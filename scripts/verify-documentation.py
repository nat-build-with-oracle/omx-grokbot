#!/usr/bin/env python3
"""Mechanical artifact checks, not a system-health or security certification."""
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
import json
import re
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
errors = []
markdown = [root / "system_full_exploration_report.md", *sorted((root / "docs").rglob("*.md"))]
visited = set(markdown)
# Follow linked Markdown artifacts, including this session's retrospective,
# instead of crawling unrelated user memory or directories.
for path in markdown:
    for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", path.read_text()):
        if "://" in target or target.startswith("#"):
            continue
        candidate = (path.parent / target.split("#", 1)[0]).resolve()
        if candidate.suffix == ".md" and candidate.is_file() and candidate.is_relative_to(root) and candidate not in visited:
            visited.add(candidate)
            markdown.append(candidate)
link_count = 0
for path in markdown:
    content = path.read_text()
    if len(re.findall(r"^```", content, re.M)) % 2:
        errors.append(f"Unbalanced fenced code blocks: {path.relative_to(root)}")
    for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", content):
        if "://" in target or target.startswith("#"):
            continue
        link_count += 1
        if not (path.parent / target.split("#", 1)[0]).resolve().exists():
            errors.append(f"Missing link: {path.relative_to(root)} -> {target}")

evidence = sorted(path for path in (root / "docs/evidence").iterdir() if path.is_file() and path.suffix in {".txt", ".json", ".jsonl"})
for path in evidence:
    if not path.stat().st_size or not re.search(r"\d{4}-\d{2}-\d{2}T", path.read_text()):
        errors.append(f"Empty or untimestamped evidence: {path.name}")

manifest_count = 0
manifest_paths = set()
for line in (root / "docs/evidence/SHA256SUMS").read_text().splitlines():
    digest, name = line.split(maxsplit=1)
    path = root / name.lstrip("*")
    manifest_paths.add(path.resolve())
    manifest_count += 1
    if not path.exists() or sha256(path.read_bytes()).hexdigest() != digest:
        errors.append(f"Checksum mismatch: {name}")
for path in [*evidence, root / "scripts/remote-system-snapshot.sh", root / "scripts/grokbot-gateway.py"]:
    if path.resolve() not in manifest_paths:
        errors.append(f"Evidence/collector missing from checksum manifest: {path.relative_to(root)}")

service = (root / "docs/evidence/remote-services.txt").read_text()
declared = re.search(r"Installed package count: (\d+) capture limit: (\d+)", service)
rows = re.findall(r"^installed\t([^\t\n]+)\t([^\n]+)$", service, re.M)
if not declared or len(rows) != int(declared[1]) or len({name for name, _ in rows}) != len(rows) or len(rows) > int(declared[2]):
    errors.append("Installed-package inventory does not match its declared complete count/cap")

syntax = subprocess.run(["bash", "-n", str(root / "scripts/remote-system-snapshot.sh")], capture_output=True, text=True)
if syntax.returncode:
    errors.append("Collector Bash syntax check failed: " + syntax.stderr.strip())
refresh = (root / "docs/evidence/remote-refresh-test.txt").read_text()
if "SSH transport exit=0" not in refresh or "End of read-only snapshot" not in refresh:
    errors.append("Missing completed remote collector execution evidence")

# This particular live test must have a new persisted prompt AND a correlated
# bot output. HTTP acceptance or an isolated echoed marker is insufficient.
proof_ok = False
try:
    prep = json.loads((root / "docs/evidence/grokbot-omx-proxy-prepare.json").read_text())
    sends = [json.loads(line) for line in (root / "docs/evidence/grokbot-omx-proxy-send.jsonl").read_text().splitlines() if line.strip()]
    verified = json.loads((root / "docs/evidence/grokbot-omx-proxy-verify.json").read_text())
    before = [entry for entry in sends if entry.get("phase") == "before_post"]
    accepted = [entry for entry in sends if entry.get("phase") == "post_result"]
    prompt = verified.get("prompt") or {}
    replies = verified.get("replies") or []
    assert prep["name"] == "OMX Proxy" and prep["existingMarkerRows"] == 0
    assert len(before) == len(accepted) == 1 and accepted[0].get("accepted") is True and accepted[0].get("httpStatus") == 200
    for entry in [*sends, verified]:
        assert entry["agentId"] == prep["agentId"] and entry["marker"] == prep["marker"] and entry["afterRowid"] == prep["afterRowid"]
    assert before[0]["targetName"] == prep["name"]
    assert verified["status"] == "reply_recorded"
    assert prompt["rowid"] > prep["afterRowid"] and prompt["content"] == before[0]["prompt"]
    assert prompt["clientNonce"] == prep["marker"] and prompt.get("requestId")
    assert any(reply["rowid"] > prompt["rowid"] and reply.get("requestId") == prompt["requestId"] and prep["marker"] in reply.get("content", "") and not reply.get("contentTruncated") and reply.get("isStreaming") is not True for reply in replies)
    proof_ok = True
except (OSError, ValueError, KeyError, TypeError, AssertionError):
    errors.append("Live OMX Proxy conversation proof failed target/marker/watermark/request/reply checks")

# These limited patterns are only a second check after deliberate data exclusion.
patterns = {
    "private-key armor": r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
    "AWS access-key shape": r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
    "GitHub token shape": r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b",
    "literal bearer token": r"(?i)\bBearer\s+[A-Za-z0-9._-]{24,}",
}
for path in [*markdown, *evidence]:
    for number, line in enumerate(path.read_text().splitlines(), 1):
        for label, pattern in patterns.items():
            if re.search(pattern, line):
                errors.append(f"Review sensitive pattern ({label}): {path.relative_to(root)}:{number}")

print(json.dumps({
    "checked_at_utc": datetime.now(timezone.utc).isoformat(),
    "result": "PASS" if not errors else "FAIL",
    "markdown_files": len(markdown),
    "relative_links_checked": link_count,
    "timestamped_evidence_files": len(evidence),
    "checksum_entries_checked": manifest_count,
    "complete_installed_package_rows": len(rows),
    "collector_bash_syntax_exit": syntax.returncode,
    "recorded_collector_transport_exit": 0 if "SSH transport exit=0" in refresh else None,
    "omx_proxy_live_conversation_proof": proof_ok,
    "errors": errors,
    "limits": "Mechanical checks and limited sensitive-pattern scan only. Semantic evidence review is in docs/coverage-audit.md. Probe-level failures in the snapshot remain significant; this is not a health/security certificate.",
}, indent=2))
sys.exit(bool(errors))
