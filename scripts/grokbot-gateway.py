#!/usr/bin/env python3
"""Run over SSH on the Grok Bot computer. Tokens stay in remote process memory.

Read-only actions: discover, history, prepare, verify, verify-agent. Send and create-agent each perform one POST.
No retries, redirects, proxies, transcript writes or UI draft modifications.
"""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sqlite3
import sys
import urllib.error
import urllib.request
from uuid import UUID

BASE = Path.home() / "sand-data"


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def utc():
    return datetime.now(timezone.utc).isoformat()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def request(path, payload=None):
    gateway = json.loads((BASE / "gateway.json").read_text())
    port = int(gateway["port"])
    if gateway.get("scheme", "http") != "http" or not 1 <= port <= 65535:
        raise ValueError("Unexpected gateway transport")
    token = gateway.get("token")
    if not isinstance(token, str) or not token:
        raise ValueError("No configured gateway token; refusing unauthenticated fallback")
    headers = {"Authorization": "Bearer " + token}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload, ensure_ascii=False).encode()
    req = urllib.request.Request("http://127.0.0.1:" + str(port) + path, data=data, headers=headers)
    # Explicitly disable environment proxies and HTTP redirects for this secret.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(req, timeout=8) as response:
        raw = response.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise ValueError("Gateway response exceeds safe capture limit")
        return response.status, json.loads(raw)


def health():
    status, data = request("/health")
    return {"httpStatus": status, **{k: data.get(k) for k in ("ok", "activeAgentId", "isBusy", "busyOnlyAwaitingApproval")}}


def profiles():
    result = []
    for file in sorted((BASE / "agents").glob("*/profile.json")):
        data = json.loads(file.read_text())
        result.append({"agentId": str(UUID(file.parent.name)), "name": data.get("name")})
    return result


def agent_path(agent_id):
    return BASE / "agents" / str(UUID(agent_id))


def connect(agent_id):
    db = sqlite3.connect((agent_path(agent_id) / "store.db").as_uri() + "?mode=ro", uri=True, timeout=5)
    db.execute("PRAGMA query_only=ON")
    columns = {row[1] for row in db.execute("PRAGMA table_info(transcript_entries)")}
    if not {"seq", "id", "entry"} <= columns:
        db.close()
        raise ValueError("Unexpected transcript schema; inspect metadata before proceeding")
    return db


def marker_value(value):
    if not re.fullmatch(r"[A-Za-z0-9_-]{12,120}", value):
        raise argparse.ArgumentTypeError("Use a unique 12-120 character ASCII letters/digits/_/- marker")
    return value


def marker_rows(db, marker, after=0):
    # instr() treats _ and % literally; parameterization avoids SQL injection.
    return db.execute("SELECT rowid, entry FROM transcript_entries WHERE rowid > ? AND instr(entry, ?) > 0 ORDER BY rowid", (after, marker)).fetchall()


def inspect_rows(rows, marker):
    decoded = [(seq, json.loads(raw)) for seq, raw in rows]
    prompts = [(seq, e) for seq, e in decoded if e.get("kind") == "message" and e.get("role") == "user" and marker in str(e.get("content", ""))]
    if not prompts:
        return {"status": "prompt_not_recorded", "prompt": None, "replies": []}
    if len(prompts) != 1:
        return {"status": "ambiguous_multiple_prompts", "matchingPromptCount": len(prompts), "replies": []}
    seq, prompt = prompts[0]
    rid = prompt.get("requestId")
    replies = []
    for rowid, e in decoded:
        if rowid <= seq or not rid or e.get("requestId") != rid:
            continue
        content = None
        if e.get("kind") == "send-message" and isinstance(e.get("message"), dict) and e["message"].get("type") == "text":
            content = e["message"].get("content")
        elif e.get("kind") == "message" and e.get("role") == "assistant":
            content = e.get("content")
        if isinstance(content, str):
            replies.append({"rowid": rowid, "kind": e.get("kind"), "requestId": rid, "content": content[:6000], "contentTruncated": len(content) > 6000, "isStreaming": e.get("isStreaming")})
    return {"status": "reply_recorded" if replies else "prompt_recorded_waiting_for_reply", "prompt": {"rowid": seq, "id": prompt.get("id"), "requestId": rid, "clientNonce": prompt.get("clientNonce"), "content": prompt.get("content")}, "replies": replies}


def history_page(agent_id, before=None, limit=50):
    aid = str(UUID(agent_id))
    if type(limit) is not int or not 1 <= limit <= 50 or (before is not None and (type(before) is not int or before < 1)):
        raise ValueError("Invalid history page bounds")
    profile = json.loads((agent_path(aid) / "profile.json").read_text())
    if not isinstance(profile.get("name"), str):
        raise ValueError("Agent profile has no name")
    with closing(connect(aid)) as db:
        rows = db.execute("SELECT rowid,entry FROM transcript_entries WHERE (? IS NULL OR rowid < ?) ORDER BY rowid DESC LIMIT ?", (before, before, limit + 1)).fetchall()
    entries, consumed, budget = [], 0, 131072
    for rowid, raw in rows[:limit]:
        e = json.loads(raw)
        role, content = None, None
        # Agent-to-agent, tool, system and attachment records are not user-facing text.
        if e.get("kind") == "message" and e.get("role") in ("user", "assistant") and not e.get("fromAgent") and not e.get("toAgent"):
            role, content = e["role"], e.get("content")
        elif e.get("kind") == "send-message" and isinstance(e.get("message"), dict) and e["message"].get("type") == "text":
            role, content = "assistant", e["message"].get("content")
        if not isinstance(content, str) or not content.strip():
            consumed += 1
            continue
        shown = content[:8000]
        if len(shown) > budget:
            break  # Leave this row for the next page, rather than silently lose it.
        budget -= len(shown)
        timestamp = None
        if type(e.get("timestampMs")) in (int, float):
            try:
                timestamp = datetime.fromtimestamp(e["timestampMs"] / 1000, timezone.utc).isoformat()
            except (ValueError, OverflowError, OSError):
                pass
        entries.append({"rowid": rowid, "role": role, "content": shown,
                        "timestamp": timestamp, "contentTruncated": len(content) > len(shown),
                        "isStreaming": e.get("isStreaming") is True,
                        "requestId": e.get("requestId") if isinstance(e.get("requestId"), str) and len(e["requestId"]) <= 200 else None,
                        "clientNonce": e.get("clientNonce") if isinstance(e.get("clientNonce"), str) and len(e["clientNonce"]) <= 200 else None})
        consumed += 1
    has_more = len(rows) > consumed
    return {"agentId": aid, "name": profile["name"], "entries": list(reversed(entries)),
            "hasMore": has_more, "nextBeforeRowid": rows[consumed - 1][0] if has_more and consumed else None}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("discover")
    history = sub.add_parser("history")
    history.add_argument("--agent-id", required=True)
    history.add_argument("--before-rowid", type=int)
    history.add_argument("--limit", type=int, default=50)
    create = sub.add_parser("create-agent")
    create.add_argument("--name", required=True)
    create.add_argument("--description", required=True)
    create.add_argument("--operation-id", required=True)
    check = sub.add_parser("verify-agent")
    check.add_argument("--agent-id", required=True)
    check.add_argument("--expected-name", required=True)
    prepare = sub.add_parser("prepare")
    prepare.add_argument("--agent-name", required=True)
    prepare.add_argument("--marker", type=marker_value, required=True)
    for action in ("send", "verify"):
        item = sub.add_parser(action)
        item.add_argument("--agent-id", required=True)
        item.add_argument("--marker", type=marker_value, required=True)
        item.add_argument("--after-rowid", type=int, required=True)
        if action == "send":
            item.add_argument("--expected-name", required=True)
            item.add_argument("--prompt", required=True)
    args = parser.parse_args()
    common = {"action": args.action, "utc": utc()}
    if args.action == "discover":
        emit({**common, "health": health(), "agents": profiles()})
        return
    if args.action == "history":
        emit({**common, **history_page(args.agent_id, args.before_rowid, args.limit)})
        return
    if args.action == "create-agent":
        nonce = str(UUID(args.operation_id))
        if not 1 <= len(args.name.strip()) <= 120 or len(args.description) > 4000:
            raise ValueError("Invalid profile")
        status, data = request("/api/createAgent", {
            "name": args.name, "description": args.description, "clientNonce": nonce,
            "creationRoute": {"kind": "box"}, "origin": "user",
            "isIntroductionSuppressed": True, "isKickstartRequested": False,
        })
        aid = str(UUID(data["agent"]["id"]))
        emit({**common, "operationId": nonce, "agentId": aid, "httpStatus": status})
        return
    if args.action == "verify-agent":
        aid = str(UUID(args.agent_id))
        profile = json.loads((agent_path(aid) / "profile.json").read_text())
        emit({**common, "agentId": aid, "name": profile.get("name"),
              "verified": profile.get("name") == args.expected_name})
        return
    if args.action == "prepare":
        matches = [p for p in profiles() if p["name"] == args.agent_name]
        if len(matches) != 1:
            raise ValueError("Agent name must have exactly one profile match; use discover")
        target = matches[0]
        with connect(target["agentId"]) as db:
            watermark = db.execute("SELECT COALESCE(MAX(rowid),0) FROM transcript_entries").fetchone()[0]
            existing = len(marker_rows(db, args.marker))
        emit({**common, **target, "marker": args.marker, "afterRowid": watermark, "existingMarkerRows": existing, "health": health(), "schema": "transcript_entries(seq INTEGER, id TEXT, entry TEXT)"})
        if existing:
            sys.exit(3)
        return
    if args.after_rowid < 0:
        raise ValueError("Watermark must be nonnegative")
    aid = str(UUID(args.agent_id))
    context = {**common, "agentId": aid, "marker": args.marker, "afterRowid": args.after_rowid}
    if args.action == "verify":
        with connect(aid) as db:
            rows = db.execute("SELECT rowid,entry FROM transcript_entries WHERE rowid > ? ORDER BY rowid LIMIT 1001", (args.after_rowid,)).fetchall()
        if len(rows) > 1000:
            raise ValueError("More than 1000 new transcript rows; stop for a narrower request-specific read")
        emit({**context, **inspect_rows(rows, args.marker)})
        return
    name = json.loads((agent_path(aid) / "profile.json").read_text()).get("name")
    if name != args.expected_name:
        raise ValueError("Pinned agent name changed; refusing to send")
    if args.marker not in args.prompt:
        raise ValueError("Prompt must include the exact correlation marker")
    with connect(aid) as db:
        if marker_rows(db, args.marker):
            emit({**context, "status": "marker_already_recorded_no_post", "instruction": "Use verify; no resend performed"})
            return
    emit({**context, "phase": "before_post", "targetName": name, "prompt": args.prompt})
    try:
        status, data = request("/api/sendPrompt", {"agentId": aid, "prompt": args.prompt, "clientNonce": args.marker})
    except Exception as error:
        emit({**context, "phase": "post_result", "status": "delivery_uncertain_do_not_resend", "errorType": type(error).__name__, "httpStatus": getattr(error, "code", None), "instruction": "Verify the same marker and watermark before any further send"})
        sys.exit(4)
    emit({**context, "phase": "post_result", "httpStatus": status, "accepted": data.get("accepted") if isinstance(data, dict) else None, "instruction": "Acceptance is not delivery proof; use verify"})


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Do not print exception strings, response bodies, headers or token data.
        emit({"utc": utc(), "status": "stopped", "errorType": type(error).__name__, "httpStatus": getattr(error, "code", None)})
        sys.exit(2)
