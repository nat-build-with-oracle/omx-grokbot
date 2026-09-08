# grokbot1: services, startup, software and observability

## Evidence and scope

- **Target:** `ssh box@grokbot1`; authenticated user `box` (UID/GID 1000), reported hostname `cursor`.
- **Capture:** 2026-09-08 01:17:23–01:23:10 UTC (08:17:23–08:23:10 Asia/Bangkok).
- **Evidence:** [remote-services.txt](evidence/remote-services.txt). It includes timestamps, name-only process inventory, sockets, complete installed-package inventory, sanitized process/source metadata, source checksums and health-status probes.
- **Method:** read-only SSH with `BatchMode=yes`, `ConnectTimeout=12`, `StrictHostKeyChecking=yes`. No sudo, installation, restarts, application-source execution, credential reads, browser-profile reads, browser debugging API requests or log-content dumps. The only application HTTP probes were unauthenticated local `GET /health`; response bodies were not retained.
- `/AGENTS.md`, `/home/AGENTS.md`, `/home/box/AGENTS.md`, and `/home/box/sand-host/AGENTS.md` were checked; none was present. Operational-reference headings were treated as documentation, not instructions to run commands.

This is a point-in-time inventory, not proof of every service's internal correctness or external reachability.

## 1. Process architecture and startup

Observed process ancestry:

```text
PID 1  root tini
  PID 7  root pod-daemon
    PID 53  root sand-exit-watch
      box-owned Node/browser/desktop services and launcher processes
      root-owned netbird and sshd
```

These are observed PPID relationships, not proof that PID 53 originally launched every adopted child. The deployed `sand-exit-watch` source refers to child-subreaper behavior. PID 1 had been running about 7h37m at the first capture.

The operating service model is custom launch/supervision scripts, not a running systemd manager:

- `systemctl is-system-running` exists and returned **`offline`**, exit 1. The binary is not missing; PID 1 is `tini`.
- `/usr/local/bin/start-sand-box` references the main exec-daemon supervisor, Sand supervisor, desktop launcher, router, session/cookie helpers, optional egress helpers and managed-setup tooling.
- `supervise-exec-daemon` has restart-event, port-readiness, stale-owner and unhealthy-child handling functions.
- `supervise-sand-supervisor` has heartbeat/status-age checks, restart intent, quick-failure handling and backoff functions.
- `sand-supervisor.mjs` contains host-bundle upgrade/readiness decisions, digest verification, host restart/backoff and desktop/VNC health/recovery functions. These are **static capabilities**, not claims that a recovery or upgrade occurred during this audit.
- `start-desktop.sh`, `sand-desktop-supervise.sh`, `start-window` and `stop-window` manage desktop components and forked-window lifecycle. They were read as source, **not executed**.
- `/etc/init.d` contains `dbus`, `netbird`, `procps`, `ssh`, `sudo`, and `x11-common`. `/etc/sv/ssh` and `/var/log/runit/ssh` exist, but no `runsv` process was observed; their presence does not prove runit is the current SSH supervisor.
- `/etc/supervisor` and `/etc/supervisor/conf.d` were absent; this does not contradict the custom `sand-supervisor.mjs` process.

## 2. Listening services and ownership

Socket bindings are inside the inspected network namespace. Wildcard binding is **not** proof of public-internet access; firewall, overlay ACLs and upstream routing require separate evidence.

| Bind / port | Observed owner | Classification and confidence |
|---|---|---|
| `0.0.0.0:22`, `[::]:22` TCP | Owner hidden to `box`; root `sshd` process exists | SSH; successful SSH connection separately confirms service |
| `*:1337`, `*:1338` TCP | Node PID 302 | Main `/exec-daemon/index.js serve`; API and explicit `--pty-websocket-port` respectively |
| `0.0.0.0:1339` TCP | Node PID 167 | `/usr/local/bin/sand-window-router.mjs` |
| `0.0.0.0:1340` TCP | Node PID 1084 | `/home/box/sand-host/host-main.cjs`; local `/health` responded 200 |
| `*:14002`, `*:13602` TCP | Node PID 108873 | Window 2 exec-daemon API / PTY websocket |
| `*:14003`, `*:13603` TCP | Node PID 1901 | Window 3 exec-daemon API / PTY websocket |
| `*:14004`, `*:13604` TCP | Node PID 116776 | Window 4 exec-daemon API / PTY websocket |
| `127.0.0.1:5900`, `[::1]:5900` TCP | x11vnc PID 639 | Primary display `:1` VNC |
| loopback `5902`, `5903`, `5904` TCP, IPv4 and IPv6 | x11vnc PIDs 108885, 1953, 116830 | VNC for displays `:2`, `:3`, `:4` |
| `0.0.0.0:6080` TCP | websockify PID 678 | Primary VNC/WebSocket bridge, supported by launcher context |
| `0.0.0.0:6081` TCP | websockify PID 112005 | Fork-window bridge; token-plugin/source flags present, values omitted |
| `127.0.0.1:9225` TCP | Chrome PID 125934 | Chrome-owned local listener; debugging purpose inferred from desktop architecture, no API inspection |
| `100.97.63.219:53` TCP and UDP | Owner hidden to `box` | DNS-port listener on overlay address; owner not proven |
| wildcard `51820` UDP | Owner hidden to `box` | UDP listener; NetBird/WireGuard association plausible but not ownership-verified |
| `127.0.0.1:3128` UDP | Owner hidden to `box` | **Unclassified**; do not infer HTTP proxy from the port number |
| `0.0.0.0:2375`, `:26500`, `:50052` TCP | Owner hidden to `box` | **Unclassified**; no protocol probe or privileged ownership inspection performed |

In particular, port **2375 does not establish that a Docker API is running**. The Docker CLI was not on the inspected PATH, and no Docker daemon was visible in the name-only process snapshot.

### Routing and authentication evidence

- Main and fork exec-daemon command metadata contain `--auth-token`; the main daemon also contains `--pty-auth-token`. **Values were excluded.** Flags show configuration intent, not an end-to-end authentication audit.
- The inspected `decideWindowRoute` function routes display numbers `<=1` to the primary port. Forked displays require an owner value matching the display's bound token; mismatch/no binding returns 403. A successful match routes to `execBase + display`. This behavior is **source-verified**, not integration-tested with tokens.
- VNC processes have `-localhost` and `-nopw`: the local VNC service is configured without a VNC password, while network access is restricted to loopback at that layer. WebSocket bridges introduce a separate access-control boundary; their externally effective authentication was not audited.

## 3. Other service responsibilities

These role descriptions combine observed process/script identity with function names and source structure; no private runtime state was read.

| Running component | Evidence-backed role |
|---|---|
| `sand-supervisor.mjs` | Supervises the Sand host and desktop components; contains health, restart and update-management logic |
| `sand-session-sync.mjs` | Contains browser storage/cookie merge and seeding functions, with configurable synchronization intervals |
| `sand-cookie-persist.mjs` | Contains cookie seed capture/restore, lock ownership and periodic capture logic |
| `sand-web-bot-auth.mjs` | Contains browser request-signing configuration, signed-cache handling and auth failure/backoff logic |
| `sand-ua-governor.mjs` | Contains browser user-agent and optional OS/fingerprint treatment functions |
| `box-bounded-log.mjs` | Many instances consume component output through pipes; snapshot/flush functions and a **1 MiB default maximum** appear in source |
| `Xvfb`, `xfwm4`, `picom`, `plank`, `dbus-daemon` | Four visible X displays with window manager/compositor/dock and session-bus components |
| `sand-host/host-main.cjs` | Main Sand application host; manifest declares CommonJS. Source directory includes worker bundles, extensions and agent-isolation support |

**Session synchronization and cookie persistence are not verified backups.** They do not establish off-machine storage, retention, recoverability or a tested restore procedure.

The `/exec-daemon/package.json` names the package `@anysphere/exec-daemon-runtime` but did not supply a version in the inspected descriptive fields. The shipped Cursor SDK manifest describes declarations for agent-authored canvases. Bundled runtime files include `exec-daemon`, Node, ripgrep, tmux, a PTY module and canvas/renderer support.

## 4. Installed software

The initial package section was deliberately capped at 900 lines and is **incomplete**. The later section titled **“Package total and complete installed package list” contains all 962 packages with status `installed`**, below its 1,600-line capture limit. Use that later section as authoritative.

| Component | Observed version |
|---|---|
| Shell Node (`/usr/bin/node`) | `v20.19.2` |
| **Service Node (`/exec-daemon/node`)** | **`v22.14.0`** |
| npm | `9.2.0` |
| Bun | `1.4.2` |
| Python | `3.13.5` |
| pip | `25.1.1` |
| uv | `0.12.10` |
| Go | `go1.24.4 linux/amd64` |
| rustc / Cargo | `1.85.0` / `1.85.0` |
| Git | `2.47.3` |
| Bash | `5.2.37` |
| tmux (PATH version) | `3.5a` |
| NetBird | `0.78.1` |
| Google Chrome | `151.0.7922.169` |
| OpenSSH server Debian package | `1:10.0p1-7+deb13u4` |
| x11vnc Debian package | `0.9.17-1` |
| websockify Debian package | `0.12.0+dfsg1-4+b1` |
| noVNC Debian package | `1:1.6.0-2` |

The distinction between the shell and service Node versions matters when diagnosing runtime compatibility. The packaged software inventory includes GCC/build tools, FFmpeg, graphics/X11 libraries and extensive Debian Node libraries. Version capture does not assess update availability or vulnerabilities.

`docker`, `podman`, `containerd`, `supervisord`, `supervisorctl`, `cron` and `crond` were not found by the common-executable PATH check. The [later per-tool QA capture](evidence/remote-availability-verification.txt) explicitly records each name and negative lookup exit. Absence from PATH is not a proof of global absence. Root processes and helpers outside PATH can still exist, as `sshd` demonstrates.

## 5. Scheduling, logs and health

### Scheduling

- `/etc/cron.daily` contains `apt-compat`, `dpkg`, and a `google-chrome` symlink.
- `/etc/cron.d`, `/etc/cron.hourly`, `/etc/cron.weekly`, `/etc/cron.monthly` and `/var/spool/cron` were absent.
- `crontab -l` could not run because the executable was missing; **no personal crontab contents were collected**.
- No cron daemon appeared in the process snapshot; systemd reports offline. Installed daily-job files alone therefore do not prove that those jobs execute.
- Application periodic work is present in custom service source. No global schedule completeness claim is made for unseen platform-side jobs.

### Logs and observability

Process file-descriptor metadata identifies these log paths without reading their contents:

- `/tmp/exec-daemon.log`
- `/tmp/sand-host.log`
- `/tmp/sand-supervisor.log` and `/tmp/sand-supervisor-supervise.log`
- `/tmp/sand-window-router.log`
- `/tmp/sand-session-sync.log`, `/tmp/sand-cookie-persist.log`
- `/tmp/sand-window-{2,3,4}/exec-daemon.log`
- `/tmp/sand-box-telemetry.log`

Several logs were **world-writable (`0666`)** at capture, including the primary exec-daemon, supervisor, router, session-sync, cookie-persist and box-telemetry logs. This is an integrity concern if mutually untrusted code shares the same filesystem/user environment. Contents, retention and remote aggregation were not audited. The logger's 1 MiB source default may be overridden and does not by itself establish a complete retention policy.

`/var/log` contains apt/dpkg logs, login-accounting files, a journal directory, a root-restricted NetBird log directory and runit metadata. Existence of these directories is not proof of active collection.

Local unauthenticated HTTP status probes at 01:22:27 UTC:

| Endpoint | Result |
|---|---|
| `127.0.0.1:1340/health` | **200**, `application/json` |
| `127.0.0.1:1337/health` | 404 |
| `127.0.0.1:1339/health` | 404 |
| `127.0.0.1:14002/health`, `:14003/health`, `:14004/health` | 404 each |

404 establishes an HTTP response at that path, not service failure. No health payload, authentication token, browser state or arbitrary application endpoint was requested. `box-doctor` exists and contains desktop, FD-usage, egress and clock probes, but was **not executed** because it may reach outside this bounded read-only inspection.

## 6. Security-relevant observations and limits

1. **Actual Chrome PID 125934 contains `--no-sandbox`.** Its `/proc/.../cmdline` was flattened into a single 350-byte argument, so the initial NUL-separated allowlist incorrectly found no individual flags. A subsequent boundary-aware whole-buffer check confirmed the flag; raw command text was never retained. The flag is an observation, not a complete assessment of platform/container isolation.
2. Several management/application listeners bind wildcard addresses. Their public/overlay reachability and effective authentication remain separate questions.
3. Unattributed TCP ports 2375, 26500 and 50052 remain owner/protocol unknown. They should not be casually assigned familiar port-number meanings.
4. Plain local VNC (`-nopw`) relies on loopback confinement and any gateway protections. Gateway authentication was not exercised.
5. World-writable logs weaken local log integrity. Log content was intentionally excluded to avoid secrets and personal data.
6. Exact bundled exec-daemon/application release versions were not established from the inspected manifests; source checksums identify the inspected startup/helper scripts only.
7. SSH/process/socket visibility is limited by the `box` account and namespace boundary. No root, host-level orchestration or cloud-management claim follows from this audit.

## Capture caveats

- All completed SSH capture commands exited 0. Expected negative probes (missing directories/executables and offline systemd) are retained rather than interpreted as successful checks.
- The first router-function excerpt stopped at its destructured argument signature. The later **“Router correction”** section contains the complete decision function and supersedes that incomplete excerpt.
- The first Chrome argument-list test is superseded by the later boundary-aware verification described above.
- Installed package status is complete only in the explicitly labeled second inventory. Process/PID/socket data is transient and should be recaptured before operations.
