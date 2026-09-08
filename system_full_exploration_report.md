# Full System Exploration Report

**Systems:** local macOS workstation, native Grok Bot app, and remote `box@grokbot1` computer  
**Date:** 2026-09-08; primary captures approximately 08:17–08:23 Asia/Bangkok (01:17–01:23 UTC), with separately timestamped QA follow-ups  
**Method:** read-only system/application inspection plus a user-authorized, transcript-verified gateway conversation over NetBird  
**Classification:** internal infrastructure information; review before public sharing

## 1. Executive summary

**SSH works:** `box@grokbot1` resolves to `100.97.63.219:22`, authenticates using a public key, and returns user `box` on hostname `cursor`. The presented host key matches existing local trust records; independent verification of the original key was not performed. [SSH evidence](docs/evidence/ssh-verification.txt)

The remote environment is a **containerized Debian 13 browser/agent runtime** with custom supervision, multiple execution/PTY endpoints, four virtual displays, VNC bridges, and Chrome. It is not managed by systemd as PID 1. Host/cloud ownership, isolation guarantees, upstream firewall policy, and durable storage contracts are not established by this login. [Remote baseline](docs/evidence/remote-system.txt), [services](docs/evidence/remote-services.txt)

Key findings:

- **Local disk:** only about **22.5 GiB free of 460.4 GiB**, **4.9%**, in the shared main APFS container.
- **Remote memory:** `free` shows about 12 GiB used, but the visible ancestor cgroup reports about **2.7 GiB charged**, with a **16 GiB ceiling**. These are different accounting scopes.
- **Network:** multiple local and remote wildcard listeners exist. Three remote TCP ports remain unattributed. A listener is not proof of public reachability.
- **Security observations:** macOS Application Firewall disabled; Chrome started with `--no-sandbox`; several remote logs mode 0666. These warrant owner review, not a claim of compromise.
- **Recovery:** two Time Machine destinations are configured, but latest-backup lookup failed to mount the destination. Remote session/cookie synchronization is not a verified backup or restore.

Sources: [local evidence](docs/evidence/local-workstation.txt), [remote boundaries](docs/evidence/remote-boundaries.txt), [service evidence](docs/evidence/remote-services.txt).

**Grok Bot application:** the installed native app is **0.44.0**, bundle `com.anysphere.sand`, with an Electron UI/coordinator architecture. The remote box supplies execution, desktop/browser and Sand host services; its network name is not a conversational agent ID. Sections 14–15 cover the product architecture, supported interface and actual conversation-attempt status. [Native findings](docs/grokbot-native-findings.md), [remote bot-interface findings](docs/grokbot-interface-findings.md)

**Conversation verified:** at **09:09 Bangkok**, the explicitly selected **OMX Proxy** agent received our gateway prompt and replied. Its read-only transcript shows user row **9** and bot-output row **11** with the same request ID and test marker. The transport was **`box@grokbot1` over NetBird**, not Tailscale; the token stayed in remote process memory and the native composer was not edited. See the [tested gateway instructions](docs/grokbot-gateway-runbook.md) and [reply evidence](docs/evidence/grokbot-omx-proxy-verify.json).

## 2. Scope, method, and evidence

The requested full document covers the workstation and reachable remote environment across **access, identity, compute, storage, networking, processes, software, startup, scheduling, security configuration, logs, health visibility, and recovery**. It is a comprehensive system baseline, not a crawl of every personal file or a certification of inaccessible host/cloud layers.

The expanded objective also requires documenting **Grok Bot itself and trying to talk with it**. Static code/interface discovery and live chat delivery are separate requirements; neither a successful SSH login nor a source-defined `sendPrompt` method is counted as a conversation.

| ID | Evidence / supporting document | Coverage |
|---|---|---|
| E1 | [Local capture](docs/evidence/local-workstation.txt) | OS/hardware/resources, APFS, network, tools, process/socket/startup/backup metadata |
| E2 | [Remote baseline](docs/evidence/remote-system.txt) | Core checks at 01:17:42–01:17:44 UTC |
| E3 | [Remote boundary follow-up](docs/evidence/remote-boundaries.txt) | Cgroups, namespace visibility, systemd failure, directory metadata, DNS at 01:18:52 UTC |
| E4 | [Remote service capture](docs/evidence/remote-services.txt) | Processes, sockets, packages, sanitized code metadata, logs, limited health probes |
| E5 | [Fresh SSH verification](docs/evidence/ssh-verification.txt) | Authentication/key continuity and key-file modes at 01:20:52 UTC |
| E6 | [Refresh-script execution](docs/evidence/remote-refresh-test.txt) | Delivered collector actually run, including individual failed probes |
| E7 | [Availability verification](docs/evidence/remote-availability-verification.txt) | Explicit per-tool PATH results and child cgroup file checks during QA |
| E8 | [Local resolution provenance](docs/evidence/local-resolution-verification.txt) | SSH configuration files actually read and selected macOS resolver blocks during QA |
| E9 | [Remote bot-interface evidence](docs/evidence/grokbot-interface.txt) | Shipped app/reference docs, gateway schema, CLI/skill/tmux metadata; no RPC/message invoked |
| E10 | [Native bundle evidence](docs/evidence/grokbot-native.txt) | App version/archive, navigation declarations, renderer/coordinator architecture and development gates |
| E11 | [Conversation attempt log](docs/evidence/grokbot-conversation-attempt.txt) | Live native accessibility observations and exact attempted-action results; not a transcript of past chats |
| E12 | [Local Oracle routing check](docs/evidence/grokbot-routing-verification.txt) | Explicit contacts-path existence and filtered `maw ls` result; no message sent |
| E13 | [Gateway metadata/schema check](docs/evidence/grokbot-gateway-test.txt) and [agent discovery](docs/evidence/grokbot-gateway-discovery.json) | Authorized health/profile/schema inspection; active agent is not used as an unstable recipient selector |
| E14 | [OMX Proxy preparation](docs/evidence/grokbot-omx-proxy-prepare.json) | Exact profile/ID, unique marker, absent-marker check and pre-send row watermark |
| E15 | [One-shot gateway send](docs/evidence/grokbot-omx-proxy-send.jsonl) | Exact prompt, pinned recipient, HTTP 200 and acceptance; one POST |
| E16 | [Read-only transcript verification](docs/evidence/grokbot-omx-proxy-verify.json) | Persisted new prompt and matching bot output with shared request ID/marker |
| L | [Detailed local findings](docs/local-workstation-findings.md) | Expanded local interpretation and command caveats |
| R | [Detailed service findings](docs/remote-services-findings.md) | Expanded service architecture, versions, source checks and corrections |

These captures are **not atomic**: collection was partly concurrent, and PIDs, capacity, counters and ports can change between samples. Exact timestamps and probe errors are retained. “Observed” means direct output; source-derived roles are static evidence of intent/capability, not proof of successful execution. Unknowns are explicitly qualified.

No packages were installed, trust entries accepted, configuration changed, jobs scheduled, or services restarted. No credential values, private-key contents, environment dumps, browser profile state, preexisting conversation content, or project contents were retained. Process metadata omits unrestricted arguments; selected flags/ports/script identifiers exclude token values. Normal SSH/HTTP requests may generate ordinary logs; the `tmutil latestbackup` query attempted and failed an implicit destination mount. No backup/restore was run. The later, explicitly authorized gateway phase reads the token only inside the remote Python process and changes conversation state by sending one greeting; its **new test exchange** is retained as delivery evidence. That phase is separate from the read-only baseline and native-UI attempts.

The [initial report](docs/history/2026-09-08-initial-baseline.md) is retained as **historical, superseded material**, not current evidence. This report corrects its APFS, memory, OS-version, service-manager, and exposure interpretations.

## 3. Access and topology

```text
Mac: nat, Apple M4 / arm64
  en0 192.168.1.12/24 -> default gateway 192.168.1.1
  utun100 100.97.232.195 -> route to remote overlay address
                  |
                  | SSH TCP 22, public-key authentication
                  v
grokbot1 / grokbot1.oracle.netbird -> 100.97.63.219
  hostname cursor; user box (UID/GID 1000)
  Debian container: tini -> pod-daemon -> sand-exit-watch
    execution/PTY daemons, Sand host/router/supervisor
    four X displays, VNC bridges, Chrome, session helpers

Underlying host/cloud and upstream policy: outside verified visibility
```

The diagram combines route and process observations, not a complete packet trace or boot sequence. [E1](docs/evidence/local-workstation.txt), [E3](docs/evidence/remote-boundaries.txt), [E4](docs/evidence/remote-services.txt)

Interactive command:

```sh
ssh box@grokbot1
```

Noninteractive verification, refusing unknown/changed keys:

```sh
ssh -o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=yes \
  box@grokbot1 'date -u +%FT%TZ; hostname; id'
```

Current `ssh -G` leaves the hostname as `grokbot1`, port 22, without ProxyJump/ProxyCommand. DNS plus the overlay route supplies the path; the present effective configuration does **not** demonstrate an SSH `HostName` rewrite to the IP. Both short name and FQDN resolved. `cursor.oracle.netbird` did not resolve in the remote check; hostname `cursor` is not proof of that alias. [E1](docs/evidence/local-workstation.txt), [E3](docs/evidence/remote-boundaries.txt)

The local SSH diagnostic confirms reading `~/.ssh/config`, `/etc/ssh/ssh_config`, `/etc/ssh/ssh_config.d/100-macos.conf`, `/etc/ssh/crypto.conf`, and `/etc/ssh/ssh_config.d/99-netbird.conf`. Thus the NetBird include exists and is read, but the effective target still remains a DNS name. macOS resolver configuration includes an `oracle.netbird` supplemental resolver at **100.97.255.254**, while the selected default block lists **1.1.1.1** and the same search domain. These are configured resolver routes, not a packet-level trace of the successful lookup. Other local resolver domains were excluded. [E8](docs/evidence/local-resolution-verification.txt)

Stored short-name/FQDN and freshly presented keys agree:

```text
ED25519 SHA256:rOpANPu0hrBNtNs1K7+txaffZkm7f6qUVY07600O2wI
```

The numeric-IP lookup found no entry in the queried default known-hosts file. Matching existing records proves continuity, not independent original identity assurance. No trust records were changed. [E1](docs/evidence/local-workstation.txt), [E5](docs/evidence/ssh-verification.txt)

## 4. Local workstation

### Platform, resources, and storage

| Field | Observed value |
|---|---|
| OS / build / kernel | macOS **26.3.1 (a)** / **25D771280a** / Darwin **25.3.0** |
| Hardware | Mac16,12; Apple M4, arm64, 10 physical/logical CPUs; **16 GiB RAM** |
| Uptime | 1 day, 10h22m at first capture |
| Load / CPU sample | Load 9.57/6.11/4.19; 25.25% user, 28.74% system, 45.99% idle |
| Processes | Initial aggregate 792, including one stuck; later name-only census 807 |
| Memory / swap | `top`: 15G used, 131M unused, 4240M compressor; encrypted swap 1686.19M used of 3072M |
| Pressure query | `memory_pressure -Q`: 49% by that tool's metric; pressure-level sysctl 1 |
| Main APFS container | `disk3`: **460.43 GiB total**, **22.52 GiB free**, **4.89% free** |
| Root / Data | `df`: root 17 GiB used; Data 398 GiB used; each shows about 23 GiB shared available |

Darwin release is not the macOS build. Root and Data share the APFS container; repeated capacities must not be added, nor root's small used figure interpreted as an empty independent disk. Other container counters are in E1; roles, purgeable space, and safe cleanup candidates were not analyzed.

Memory free percentage, free pages, compressed memory and unused RAM measure different things. These snapshots do not establish sustained pressure, a leak, or CPU overload. Top CPU/RSS executable-name samples are retained without arguments; process identities and counts are transient. [E1](docs/evidence/local-workstation.txt), [local detail](docs/local-workstation-findings.md)

### Network and security configuration

SIP is **enabled**, FileVault **on**, Gatekeeper assessments **enabled**, and macOS Application Firewall **disabled (state 0)**. This is not a patch, MDM, endpoint-protection, or reachability audit.

| Current-user-visible TCP bind | Ports | Executable reported by `lsof` |
|---|---|---|
| Wildcard | 51869, 56398, 56399 | `rapportd` |
| Wildcard | 5000, 7000 | `ControlCenter` |
| Wildcard | 3283 | `ARDAgent` |
| Wildcard | 47778 | `bun` — application purpose unverified |
| Loopback | 1883, 9001 | `mosquitto` |
| Loopback | 8900 | `bun` |
| Loopback | 6463 | Discord helper |

UDP local-endpoint metadata is also retained. Unprivileged `lsof` is visibility-limited; it does not exclude additional system-owned listeners. External reachability and inbound policy were not tested. [E1](docs/evidence/local-workstation.txt)

### Startup, software, and backups

The user `launchctl list` reported **520 jobs**, **248 with running PIDs**. Its 169 nonzero last-exit fields are historical, **not 169 proven current failures**. On-disk launch plist counts: 422 system daemons, 460 system agents, 10 library daemons, 10 library agents, and 25 user agents. File counts differ from loaded jobs; the entire system launchd domain was not enumerated.

| Tool | Version / context |
|---|---|
| SSH / Git / Python | 10.2p1 / 2.53.0 / 3.14.3 |
| Bun / NetBird / OMX | 1.3.14 / 0.77.1 / 0.21.3 |
| Node | Login shell: nvm 22.20.0; OMX reports 24.3.0; initial subprocess hit a Bun wrapper and failed `--version` |

Software metadata counts: 83 top-level system-location apps plus 1 user-location app, 206 installer receipts, 319 Homebrew formulae, 13 casks. These overlap and are not a unique software total. The workspace `/Users/nat/omx-grokbot` is **not a Git worktree**; collection-time sizes include concurrent document generation.

Time Machine has **two configured destinations**, Local and Network; no backup was running. Latest-backup query returned exit 0 but no timestamp and a **backupd code 17 “Failed to mount backup destination”** error. Thus backup freshness and restoreability are **unverified** despite configured targets. No explicit mount, backup run, restore, or destination change was requested. [E1](docs/evidence/local-workstation.txt), [local detail](docs/local-workstation-findings.md)

## 5. Remote identity, compute, and container boundary

| Field | Observed value |
|---|---|
| Account | `box`, UID/GID 1000; `id` reports group `box` only |
| Userspace / kernel | Debian 13 trixie, `DEBIAN_VERSION_FULL=13.6`; Linux **6.12.94+**, x86_64 |
| CPU topology | 8 CPUs, Intel Xeon model string; KVM hypervisor reported |
| Init / marker | root-owned PID 1 `tini`; `/.dockerenv` present |
| Filesystem evidence | Overlay root; Docker-style backing paths for hosts/hostname/resolver bind mounts |
| Cgroups | v2, self membership `0::/agent`; visible mount root `/` |
| Time | `/etc/localtime` -> `Etc/UTC`; kernel uptime about 7h39m |

Combined observations support a Docker-style container on KVM-visible infrastructure, **not a claim about cloud provider, runtime version, host ownership, or tenant isolation**. PID 1 had run about 7h37m at an earlier capture; process lifetime is different from kernel uptime. Root namespace links were unreadable as `box`; self IDs do not establish host namespace sharing. [E2](docs/evidence/remote-system.txt), [E3](docs/evidence/remote-boundaries.txt)

### Resource-accounting distinction

| Scope / counter | Observation |
|---|---|
| `free -h`, host-visible | ~15 GiB RAM, 12 GiB used, 3.1 GiB available; ~15 GiB swap, 780 KiB used |
| Visible ancestor CPU | `cpu.max=800000 100000`, quota equivalent to 8 CPUs; CPU set `0-7` |
| Member `/agent` CPU | `cpu.max=max 100000`; no tighter child quota shown |
| Visible ancestor memory | Limit **16 GiB**; charged **2,876,960,768–2,913,464,320 bytes**, about **2.7 GiB** |
| Ancestor swap | Limit 16 GiB; charged 360,448 bytes at initial sample |
| Ancestor task limits | `pids.max=19209`, `pids.current=805`; tasks, not simply process count |
| Ancestor events | `oom=0`, `oom_kill=0`, CPU throttled-period count 0 at capture |
| Activity / pressure | Load 0.11/0.12/0.11; two one-second intervals ~99% idle; PSI averages 0.00 |

The recorded memory files belong to the visible ancestor; follow-up existence/readability checks confirmed the `/agent` child's `memory.max`, `memory.current`, `memory.events`, and `memory.swap.max` files were absent. The charge is not exclusively the SSH shell or one service. Unseen ancestors may impose additional constraints; limits are not reservations. “This container uses 12 GiB” is unsupported by `free` alone. These samples do not show acute pressure in the measured counters, but no trend/load testing was performed. [E2](docs/evidence/remote-system.txt), [E3](docs/evidence/remote-boundaries.txt), [E7](docs/evidence/remote-availability-verification.txt)

## 6. Remote storage and data layout

| Item | Observed state |
|---|---|
| Overlay `/` | 126 GiB total, 22 GiB used, 98 GiB available, 19% filesystem use |
| Root inodes | About 108 thousand of 8,388,608 used, 2% |
| `/dev/shm`, `/dev` | 64 MiB tmpfs each; `/dev/shm` empty at sample |
| Block device | `vda`, 128 GiB visible; exclusive ownership not established |
| `/home/box` | Mode 0700, `box:box` |
| `/var/backups` | Empty at inspection |

`df` reflects backing-filesystem capacity, not necessarily an exclusive container quota. No separate persistent mounts for `/workspace` or `/home/box` appeared in the inventory. This does not exclude platform snapshot/copy mechanisms. Persistence across replacement, encryption-at-rest, IOPS and retention are unverified. [E2](docs/evidence/remote-system.txt)

| Path | Metadata-only inventory / role |
|---|---|
| `/workspace` | `teach-sessions`, `ψ`, and SSH keypair filenames; private key 0600, public key 0644, `box:box` |
| `/home/box/reference` | `app-ui.md`, `debugging-the-box.md` operational documentation |
| `/home/box/sand-host` | Host bundle, workers, extensions, agent-isolation, box scripts and dependencies |
| `/home/box/sand-data` | Settings, database, workflows/agent/telemetry state, credential-related filenames; values excluded |
| `/home/box/agent-data` | Symlink to `/home/box/sand-data` |
| `/home/box/chrome-profile*` | Browser directories, not opened |
| `/home/box/deps` | Runtime/native dependencies including tree-sitter components |
| `/exec-daemon` | Bundled execution runtime, Node, SDK, PTY/native and rendering modules |
| `/usr/local/bin` | Sand startup/supervision/browser helper scripts |
| `/opt` | `google`, `orbit`, `sand-managed` |

Directory names do not establish size, activity, or backup success. Do not include state/profile/key contents when sharing this documentation. [E3](docs/evidence/remote-boundaries.txt), [E4](docs/evidence/remote-services.txt), [E5](docs/evidence/ssh-verification.txt)

## 7. Remote network and listener map

`enp0s3` is up at `172.30.0.2/24`, default gateway `172.30.0.1`; `wt0` has `100.97.63.219/16` and IPv6 ULA; `docker0` is down at `172.17.0.1/16`. Resolver configuration says NetBird-generated, search `oracle.netbird`, nameserver `100.97.63.219`. Root-owned NetBird is running. [E2](docs/evidence/remote-system.txt), [E3](docs/evidence/remote-boundaries.txt), [E4](docs/evidence/remote-services.txt)

`0.0.0.0` is IPv4 wildcard; `*` preserves `ss` notation and does not independently prove dual-stack behavior. **Binding is not reachability or authentication proof.**

| Protocol / ports | Bind | Observed attribution |
|---|---|---|
| TCP 22 | `0.0.0.0`, `[::]` | SSH works; root `sshd` exists |
| TCP 1337 / 1338 | `*` | Main exec-daemon API / PTY, PID 302 |
| TCP 1339 | `0.0.0.0` | Window router, PID 167 |
| TCP 1340 | `0.0.0.0` | Sand host, PID 1084 |
| TCP 14002 / 13602 | `*` | Window 2 API / PTY, PID 108873 |
| TCP 14003 / 13603 | `*` | Window 3 API / PTY, PID 1901 |
| TCP 14004 / 13604 | `*` | Window 4 API / PTY, PID 116776 |
| TCP 5900, 5902, 5903, 5904 | IPv4/IPv6 loopback | x11vnc for displays 1, 2, 3, 4 |
| TCP 6080 / 6081 | `0.0.0.0` | websockify primary / fork-window bridges |
| TCP 9225 | `127.0.0.1` | Chrome; debug purpose inferred from desktop architecture, not API inspection |
| TCP 2375, 26500, 50052 | `0.0.0.0` | **Unknown owner/protocol** under current visibility |
| TCP + UDP 53 | `100.97.63.219` | DNS-configured address; owner not visible |
| UDP 51820 | wildcard | Owner unverified; NetBird/WireGuard association plausible only |
| UDP 3128 | `127.0.0.1` | Owner/protocol unverified |

PIDs are capture-specific. Port **2375 is not proof of a Docker API**, and UDP 3128 is not proof of an HTTP proxy. No privileged owner lookup, LAN/public scan, TLS audit, or upstream ACL inspection was performed. [E4](docs/evidence/remote-services.txt)

## 8. Remote runtime, startup, and installed software

Observed ancestry starts `tini` (PID 1) -> `pod-daemon` (7) -> `sand-exit-watch` (53), with many runtime children. Parentage may include adopted processes; it is not a complete launch sequence.

| Component | Evidence-backed role / limitation |
|---|---|
| `sand-supervisor.mjs` | Running supervisor; source contains host update/readiness, restart/backoff and desktop recovery logic; recovery not exercised |
| `sand-window-router.mjs` | Running router; source sends primary displays to main daemon and checks bound owner token for fork routing; no token integration test |
| `sand-host/host-main.cjs` | Running Sand application host, with workers/extensions |
| `exec-daemon/index.js` | Four API/PTY instances; auth-token flags present, values excluded |
| Desktop stack | Xvfb displays `:1`–`:4`, x11vnc, websockify, XFCE window manager, picom, plank, D-Bus |
| `sand-session-sync.mjs` | Running; browser storage/cookie merge and seed functions in source |
| `sand-cookie-persist.mjs` | Running; cookie seed capture/restore and locking functions; not backup proof |
| `sand-web-bot-auth.mjs` | Running; request-signing/cache/auth-failure functions |
| `sand-ua-governor.mjs` | Running; browser user-agent/fingerprint treatment functions |
| `box-bounded-log.mjs` | Many log helpers; source default maximum 1 MiB, possibly overridden |

These source-derived roles describe code capability/intent, not full application correctness. Script hashes and safe process identifiers are retained. [E4](docs/evidence/remote-services.txt), [service detail](docs/remote-services-findings.md)

### Service management and schedules

`/usr/bin/systemctl` **exists**, but reports `offline`; service listing fails because systemd is not PID 1. Use the actual custom supervision model, not assumed systemd commands. Startup helpers include `start-sand-box`, `start-exec-daemon`, `supervise-exec-daemon`, `supervise-sand-supervisor`, `start-window`, and desktop helpers; none was executed by this inspection.

SysV/systemd/runit-related files exist, including `/etc/sv/ssh`; this does not prove that runit currently manages SSH. No runsv process was observed. `/etc/cron.daily` has package-maintenance entries, but cron/crond/crontab were absent from checked PATH and no cron daemon was identified. Daily files and timer directories do not prove execution. Platform-side schedules, restart policy and deployment lifecycle remain unverified. [E3](docs/evidence/remote-boundaries.txt), [E4](docs/evidence/remote-services.txt)

### Versions and package coverage

| Tool | Observed version |
|---|---|
| Shell Node / service Node | `/usr/bin/node` **20.19.2** / `/exec-daemon/node` **22.14.0** |
| npm / Bun / uv | 9.2.0 / 1.4.2 / 0.12.10 |
| Python / pip | 3.13.5 / 25.1.1 |
| Go / Rust / Cargo | 1.24.4 / 1.85.0 / 1.85.0 |
| Git / Bash / tmux | 2.47.3 / 5.2.37 / 3.5a |
| NetBird / Chrome | 0.78.1 / 151.0.7922.169 |
| OpenSSH server package | 1:10.0p1-7+deb13u4 |
| x11vnc / websockify packages | 0.9.17-1 / 0.12.0+dfsg1-4+b1 |

The **second** installed-package inventory in E4 contains all **962 installed Debian packages**, below its 1,600-entry cap; the first 900-line excerpt is incomplete. Bundled/user-managed software is not fully represented by dpkg. Exact application/exec-daemon release version was not established from inspected manifests. Docker CLI was **not on checked PATH**, not proven globally absent. Versions are inventory, not a latest-release or vulnerability assessment. [E4](docs/evidence/remote-services.txt)

## 9. Security observations

| Area | Observation and boundary |
|---|---|
| SSH permissions | `.ssh` 0700; `authorized_keys` 0600, `box:box`; key contents/authorized identities not inventoried |
| SSH excerpt | `KbdInteractiveAuthentication no`, `UsePAM yes`, `X11Forwarding yes`, Include directive; not fully evaluated per-connection policy |
| Effective SSH probe | `sshd -T` failed as `box`: `no hostkeys available`; this is **not** evidence that the working daemon lacks host keys |
| SSH-launched probe process | Effective/permitted/ambient capabilities zero; `NoNewPrivs=0`, `Seccomp=0`; not a complete confinement assessment |
| PID 1 | Broad nonzero capability mask `000001ffffffffff`, `Seccomp=0`; does not prove host-root access or a fully privileged container |
| Firewall visibility | nft/iptables/ufw absent from checked PATH; kernel/upstream/NetBird rules remain unknown |
| Chrome | Actual Chrome PID 125934 metadata confirms `--no-sandbox`; platform isolation was not independently assessed |
| VNC / bridges | x11vnc `-localhost -nopw`; websockify 6081 has token-plugin/source flags; bridge/auth/TLS enforcement not tested |
| Execution endpoints | Token flags and router checks present; configuration/source intent is not end-to-end enforcement proof |
| Runtime logs | Several mode 0666, allowing discretionary writes by users able to access those paths; actual tampering/sensitivity unexamined |

Chrome's initial argument-list test was inconclusive because the command line was flattened; the later boundary-aware check in E4 supersedes it. No secret values or raw Chrome arguments were retained. No sudo, privilege test, auth bypass, or token exercise occurred. [E2](docs/evidence/remote-system.txt), [E4](docs/evidence/remote-services.txt), [E5](docs/evidence/ssh-verification.txt)

## 10. Logs, health, time, and recovery

### Observability

Runtime metadata identifies `/tmp/exec-daemon.log`, Sand host/supervisor/router/session-sync/cookie-persist logs, `/tmp/sand-window-{2,3,4}/exec-daemon.log`, and box telemetry. Package/login/runit/NetBird log locations exist under `/var/log`. Only destinations, sizes, modes and timestamps were collected. Existence or a bounded-logger default does not prove retention, shipping or complete audit logging. A journal directory and the `journalctl` command exist without systemd as PID 1.

At 01:22:27 UTC, limited unauthenticated localhost **GET `/health`** probes returned:

- **1340:** HTTP **200**, JSON content type; body not retained.
- **1337, 1339, 14002, 14003, 14004:** HTTP **404**, proving an HTTP response at that path, **not daemon failure**.

No arbitrary endpoint, browser-debug API, UI interaction, or authentication workflow was tested. `box-doctor` was identified but **not executed**. These checks do not certify end-to-end application health. UTC clock configuration was verified, but time synchronization/drift was not. [E2](docs/evidence/remote-system.txt), [E4](docs/evidence/remote-services.txt)

### Backup and recovery

Remote `/var/backups` was empty; restic/borg/rclone/rsync were absent from the checked PATH. That does not rule out external/platform backups. Session/cookie helpers and local state files do not prove off-machine retention or recovery. Local Time Machine targets are configured, but the failed destination mount prevents freshness verification.

No reboot/restart, snapshot restore, failover, or data-loss test was run. Owners must establish which paths survive restart versus replacement, where independent copies live, retention, recovery objectives and restore authority. [E1](docs/evidence/local-workstation.txt), [E3](docs/evidence/remote-boundaries.txt), [E4](docs/evidence/remote-services.txt), [E7: per-tool backup-command checks](docs/evidence/remote-availability-verification.txt)

## 11. Reproduction and safe operations

The delivered [remote collector](scripts/remote-system-snapshot.sh) uses Bash and `timeout`, with 15-second wrapped-probe limits and an explicit missing-timeout failure. It covers the remote core baseline, **not the separate local or full service/code/package inventories**. It was syntax-checked and executed; [E6](docs/evidence/remote-refresh-test.txt) retains results.

From this workspace, save a new timestamped local capture:

```sh
mkdir -p docs/evidence
stamp=$(date -u +%Y%m%dT%H%M%SZ)
out="docs/evidence/remote-system-${stamp}.txt"
ssh -o BatchMode=yes -o ConnectTimeout=12 -o StrictHostKeyChecking=yes \
  box@grokbot1 'bash -s' < scripts/remote-system-snapshot.sh > "$out" 2>&1
rc=$?
printf '\nSSH transport exit=%s\n' "$rc" >> "$out"
printf 'Saved %s (transport exit %s)\n' "$out" "$rc"
```

Read individual `[exit=...]` results: SSH exit 0 does not mean every probe passed. Do not automatically install packages or escalate privileges to remove expected visibility errors.

| Symptom | Safe first checks / stop line |
|---|---|
| Name-resolution failure | Local `dscacheutil -q host -a name grokbot1`, `ssh -G box@grokbot1`, route to target; distinguish DNS from authentication |
| Host-key warning | Stop; compare with owner through trusted channel, rather than deleting trust or disabling checking |
| Memory concern | Compare self/ancestor cgroup counters, `free`, PSI and repeated samples; do not mix scopes |
| Local capacity concern | `df -h / /System/Volumes/Data`, APFS container counters; establish ownership/backups before deletion |
| Missing service | `ss -lntu`, argument-free process inventory, documented log metadata; do not assume systemctl manages it |
| Backup uncertainty | Establish destination availability and last successful backup/restore evidence before relying on it |

No scheduled monitoring or alerting was installed. Review captures before sharing: credentials are excluded, but internal IPs, paths, versions, key fingerprints and service topology remain sensitive infrastructure information.

## 12. Owner follow-ups and open boundaries

These are proposed decisions, **not implemented changes or proof of compromise**:

| Priority | Action | Reason |
|---|---|---|
| First | Review APFS growth and safe reclaim candidates | Only 4.9% shared space free; preserve owned backups/snapshots |
| First | Attribute TCP 2375/26500/50052 and review wildcard endpoint policy | Ownership/protocol and upstream access unverified |
| First | Confirm intended local firewall and NetBird policy | Disabled local application firewall alongside wildcard listeners |
| First | Verify backup freshness and remote persistence/recovery contract | Time Machine latest-backup lookup failed; no remote restore proof |
| Next | Review Chrome sandbox, root capabilities, VNC/bridge/token/TLS boundaries | Observed flags/masks do not establish the intended protection model |
| Next | Review mode-0666 logs and retention | Log integrity/confidentiality policy unverified |
| Next | Document platform restart/deployment ownership | Custom supervision; no lifecycle test |
| Next | Pin runtime paths for reproducible automation | Multiple local and remote Node contexts |
| Later | Add approved multi-sample resource and health monitoring | Snapshots cannot establish trends or service objectives |

Unverified layers include host/cloud inventory and firewall rules, full isolation/privilege model, patch/CVE status, key provenance/effective Match policy, complete application/dependency correctness, external schedules and backup/restore guarantees. A full baseline documents these boundaries; resolving them needs owner information, administrative visibility or separately authorized tests, not an indiscriminate file crawl.

## 13. Documentation verification

The [coverage audit](docs/coverage-audit.md) separates the original system-baseline criteria, static bot documentation, and later authorized conversation proof. The baseline pass alone is not used to certify conversation delivery: E14–E16 independently establish the pinned recipient, pre-send watermark, one-shot acceptance, and new matching transcript output.

The [mechanical QA result](docs/documentation-qa.txt) records the most recent local artifact check. It checks relative links, timestamps, package count, collector syntax/execution, stored checksums, and limited sensitive patterns. The [checksum manifest](docs/evidence/SHA256SUMS) enumerates the captures/collector included at its last refresh; ongoing conversation evidence must be rehashed after updates. Hashes detect later changes, not independent source authenticity. Secret handling relies on deliberate collection exclusions plus review; a heuristic scan cannot certify the absence of every possible secret.

To repeat local artifact checks without contacting the remote host:

```sh
python3 scripts/verify-documentation.py
shasum -a 256 -c docs/evidence/SHA256SUMS
```

The [verifier source](scripts/verify-documentation.py), retained evidence, and detailed appendices form part of this deliverable. Passing artifact QA is **not a system-health/security certificate**; documented owner follow-ups and inaccessible-layer unknowns are not represented as resolved.

## 14. Grok Bot product and application architecture

### 14.1 Distinct identities and layers

| Identity/layer | Established fact | Not established by that fact |
|---|---|---|
| `grokbot1` | SSH/network name for `100.97.63.219` | A conversational agent named grokbot1 |
| `cursor` | Linux hostname returned over SSH | A working `cursor.oracle.netbird` DNS alias |
| Grok Bot | Product named by shipped app/reference documentation | Which account/model/agent is selected in every app session |
| Native app | `/Applications/Grok Bot.app`, `com.anysphere.sand`, version/build **0.44.0** | That every bundled feature is enabled or entitled |
| App agents | Source/documentation describes entities with IDs, names, settings and sessions | Identity or contents of the user's existing agents/chats |

The native bundle declares macOS minimum 12.0, package `sand`, entrypoint `dist/electron-main/main.cjs`, and URL schemes `grokbot`/`sand`. Its `app.asar` is 34,485,800 bytes with 478 indexed files. Native/remote bundle hashes and code offsets identify the inspected artifacts rather than implying semantic release versions for every component. [E9](docs/evidence/grokbot-interface.txt), [E10](docs/evidence/grokbot-native.txt)

### 14.2 Source-supported architecture

```text
Native Grok Bot app (Electron)
  React renderer: agent sidebar, chat composer, settings, computer preview
        |
        | trusted preload: desktop / coordinatorPort
        v
  Electron main: app lifecycle, navigation, platform integrations
        |
        | Electron MessageChannels
        v
  Node agent coordinator -> gateway/host-facing communication
        |
        v
Remote Sand host -> execution/PTY, desktop/browser and agent support

Bundled local-execution helper also exists; active selection is not inferred.
```

This is a **static implementation map**, not a traced conversation or proof that the current native app agent is attached to the inspected SSH box. Host code includes backend GrokBotService clients, server-agent proxy/room logic, workflows and extensions; source presence is not an account-feature inventory. The [native appendix](docs/grokbot-native-findings.md) and [remote interface appendix](docs/grokbot-interface-findings.md) retain the distinctions.

### 14.3 Supported UI and navigation

Shipped reference docs describe an agent sidebar and chat header; the per-agent info pane contains a computer preview, Routines, and conditionally Channels/Members. Per-agent settings cover avatar, name, title, description and notifications. Global tabs are General, Computer, Updates, and conditional Usage & Billing. Documented account labels say “Sign In with Cursor”/“Sign Out”; this is not a finding about current account credentials or sign-in state.

The native deep-link declaration contains these `app`-authority paths:

| Path | Declared use |
|---|---|
| `/v1/open` | App activation, no parameters |
| `/v1/agent` | Navigate to an agent by `id` |
| `/v1/bot-template` | Template by `id` |
| `/v1/marketplace` | Marketplace tab and optional ID |
| `/v1/plugin/add` | Plugin-add flow |
| `/v1/github-connect-callback` | Integration callback with validated state/parameters |
| `/v1/settings` | Settings navigation by anchor ID |
| `/v1/sidebar` | Sidebar target/automation navigation |

`grokbot://app/v1/open` is therefore a source-supported activation route; it was not invoked during static discovery. None of the inspected route declarations accepts a prompt. Configuration/plugin/callback routes must not be treated as harmless chat-send URLs. [E9](docs/evidence/grokbot-interface.txt), [E10](docs/evidence/grokbot-native.txt)

### 14.4 API, CLI and automation boundaries

- **Internal remote gateway:** host source declares `POST /api/<method>`, `/events` SSE and `/health`. `sendPrompt` requires `prompt` and `agentId`; lifecycle and acceptance schemas also exist. No RPC/token retrieval was performed during static discovery. The later user-authorized test uses one `sendPrompt` request and scoped read-only SQLite verification, not a broad event/transcript stream.
- **Authentication intent:** source contains Bearer-token comparison and a helper implementing browser-Origin rejection and tokenless loopback Host-header checks. The complete helper call path and current effective policy were not verified; a Host-header check does not prove loopback-only peer/network access.
- **Native IPC:** `window.desktop` and `window.coordinatorPort` are private renderer bridges with trusted-renderer checks, not a documented external API.
- **Development controls:** `sand-dev` IPC requires an unpackaged app plus `SAND_DEV_CAPABILITY=1`; separate developer HTTP startup is gated by unpackaged-app status. These were not enabled or used in the packaged app.
- **No established chat CLI:** checked remote PATH had no `grokbot`, `grok`, `sand`, `maw`, `oracle`, `claude`, `codex`, `cursor` or `agent` command. `/exec-daemon/tools/origin` exists but was not executed as a guessed chat CLI. Native package metadata has no `bin` field or declared AppleScript dictionary; generic macOS accessibility is a separate surface.
- **Not an Oracle transport:** installed `.grok/skills` metadata labels the installer target “Grok CLI,” but that does not establish a working executable, contact, inbox or thread. Local Oracle contacts were absent and the checked local `maw ls` had no Grok match. Remote tmux held one bash pane, not a verified bot process; no input was injected.

Visible-UI chat was the initial approach. The user subsequently supplied and explicitly authorized the deployed gateway workflow, which allowed a verified conversation without overwriting the UI draft. This does not authorize arbitrary internal methods or developer-only controls. Never invent an agent ID, disclose credentials, or equate typing into bash with talking to Grok Bot. [E9](docs/evidence/grokbot-interface.txt), [E10](docs/evidence/grokbot-native.txt), [E12: local routing check](docs/evidence/grokbot-routing-verification.txt), [attempt record](docs/evidence/grokbot-conversation-attempt.txt), [authorized gateway runbook](docs/grokbot-gateway-runbook.md)

### 14.5 Documented recovery contract versus tested guarantees

The shipped references distinguish:

1. **Native app update:** updates Grok Bot itself.
2. **Update Grok Bot's Computer:** moves the box to a fresh instance; documentation says files/logins are retained, but installed packages, CLIs and images need reinstalling.
3. **Reset Grok Bot's Computer:** restores the last saved snapshot and may lose recently unsynchronized work.

The reference describes Docker development and brokered anyrun substrates behind common computer tools. The observed Docker marker supports the current container classification, but does not prove the entire deployment/lifecycle topology. `/workspace` is described as persistent scratch space across turns; that documented intent is narrower than a tested replacement/restore guarantee.

No update, reset, reinstall or recovery test was performed. These product descriptions supplement—rather than invalidate—the storage/backup unknowns in sections 6 and 10. [E9](docs/evidence/grokbot-interface.txt)

## 15. Conversation attempt and live retrospective

**Final conversation outcome:** the UI route was left without submitting or replacing its composer. The user then authorized a gateway route, specified NetBird DNS, and named **OMX Proxy** as the recipient. A prompt and actual reply were verified through that route at **09:09 Bangkok**. The earlier UI limitation below is historical, not a remaining conversation blocker.

| Time (Bangkok) | Attempt / observation | Result |
|---|---|---|
| 08:41 | Native app process/window metadata | One accessible standard window, process PID 24700 |
| 08:42 | Filtered accessibility controls | `New chat`, `Grok Bot's Computer`, and `Prompt` found |
| 08:43 | AppleScript attempt to click New chat | Invalid-index error **-1719**; no successful click/submission established |
| 08:44–08:48 | Native Swift accessibility probe | Trusted AX access; direct controls found; Prompt reports 16 characters |
| 08:48 | Draft/placeholder check | No AX placeholder; not equal to the tested common placeholder strings. Treat as an existing draft and leave it untouched. |
| 08:53 | Direct native AXPress on the unique New chat control | Result **0 (success)**; Prompt still 16 characters. This does not prove a fresh empty chat was created; the action may be a no-op if New chat is already open. |
| 09:02–09:08 | User-authorized gateway/profile discovery over `box@grokbot1` | Token kept remote; profile ultimately pinned to **OMX Proxy**, not whichever agent is active |
| 09:09:05 | One authenticated `POST /api/sendPrompt` | HTTP 200, `accepted: true`; verification still required |
| 09:09:21 | Read-only SQLite verification | New user row 9 and bot row 11 share request ID and marker; actual reply recorded |

No past conversation was opened for discovery. Unrelated button titles surfaced by one overly broad accessibility filter were removed from retained output and the filter was narrowed. The UI failure is not evidence that the bot itself is down; it is an automation-reference failure before verified submission.

The focused renderer-source follow-up confirms draft slots keyed by agent ID or shared `sand:new-chat`. Normal key changes save the outgoing prompt/rich text/attachments and restore the incoming draft/recovery state. New chat does not guarantee an empty slot and is a no-op if already open; preservation across normal navigation is not a crash-durability guarantee. No separate guaranteed-blank route was established for an already occupied new-chat slot. [Native draft-preservation evidence](docs/grokbot-native-findings.md)

No composer text was cleared/replaced and no native Return/Send action was performed. The successful gateway target is supported by a profile and database on the SSH-accessed machine: **OMX Proxy**, agent ID `cfecd8d4-bbe9-43e0-ba9c-606b3bd460d3`. Do not rename that agent `grokbot1`: the latter remains the computer's DNS label. Transcript proof establishes recorded delivery/reply, not native UI rendering or every capability in the bot's self-description. [UI attempt history](docs/evidence/grokbot-conversation-attempt.txt), [E14](docs/evidence/grokbot-omx-proxy-prepare.json), [E16](docs/evidence/grokbot-omx-proxy-verify.json)

Per the user's ongoing `/rrr` request, findings and failed/successful attempts are appended to the [live retrospective](ψ/memory/retrospectives/2026-09/08/08.45_system-and-grokbot-live.md); the [lesson](ψ/memory/learnings/2026-09-08_system-boundaries-and-bot-conversation.md) preserves reusable conclusions. Local retrospective/lesson persistence is verified. The required Oracle learning sync is unavailable because no `arra_learn` tool is exposed; no external sync is claimed.

## 16. Tested NetBird gateway instructions and exact result

Follow the [step-by-step gateway runbook](docs/grokbot-gateway-runbook.md). It supplies runnable, shell-quoted commands using `box@grokbot1`; `box@grokbot1.oracle.netbird` is the same network's FQDN alternative. **No Tailscale hostname, host-key deletion, disabled key checking, or token pasted into shell arguments is used.**

The delivered [gateway helper](scripts/grokbot-gateway.py) is streamed to remote Python stdin; it is not installed on the box. Its actions are:

| Action | Purpose / state effect |
|---|---|
| `discover` | Selected health/profile metadata; no message |
| `prepare --agent-name ... --marker ...` | Pin one exact name/ID, validate current column names, record maximum rowid and absent marker; read-only |
| `send --agent-id ... --expected-name ... --marker ... --after-rowid ... --prompt ...` | Check name/marker, make one authenticated POST, record acceptance/uncertainty; **changes conversation state** |
| `verify --agent-id ... --marker ... --after-rowid ...` | Accept a window of at most 1000 new rows (fetch 1001 to detect overflow); emit only the matching prompt and same-request bot outputs; read-only |

The helper reads `~/sand-data/gateway.json` remotely, uses its port, and connects to **127.0.0.1**, not the bind value `0.0.0.0`. It disables environment proxies and redirects. The token is neither copied to this workstation nor logged. SQLite uses URI `mode=ro` and `PRAGMA query_only=ON`; no database repair, migration or write occurs. Marker collision checks are not an atomic exactly-once guarantee. After an uncertain send, poll the **same** marker/watermark instead of automatically posting again.

### Verified OMX Proxy exchange

| Proof item | Actual value |
|---|---|
| Prepared profile | OMX Proxy, `cfecd8d4-bbe9-43e0-ba9c-606b3bd460d3` |
| Marker | `DOC_NETBIRD_OMX_PROXY_20260908_0208` |
| Before send | Maximum rowid **8**, no existing marker |
| POST | **02:09:05 UTC**, HTTP 200, accepted true |
| New prompt / bot output | Rows **9 / 11**, verified **02:09:21 UTC** |
| Shared request ID | `137c3f05-943c-47f6-8bcf-c5b275217188` |

The exact prompt asked OMX Proxy to identify itself and echo the marker, with no tool/file/system work. It is retained in E15/E16. The recorded reply was:

> Hi Codex — I'm OMX Proxy, Nat's Grok Bot for oh-my-codex (setup, proxy routing, team workers, Codex config). Marker: DOC_NETBIRD_OMX_PROXY_20260908_0208

The reply is nontruncated and shares the prompt's request ID. This is stronger than HTTP acceptance alone. Its stated purpose is **self-reported**, not an audit of capabilities, privileges, model choice or global tool inactivity. Earlier preparation against `test` sent nothing; the only retained POST targets the user-specified OMX Proxy profile. [E14](docs/evidence/grokbot-omx-proxy-prepare.json), [E15](docs/evidence/grokbot-omx-proxy-send.jsonl), [E16](docs/evidence/grokbot-omx-proxy-verify.json)

### Reproduction checks

The [local synthetic tests](scripts/test-grokbot-gateway.py) exercise request correlation, rejection of unrelated/tool/old output, missing/ambiguous prompt handling, explicit truncation, marker constraints, redirects and read-only SQLite behavior. [Ten tests passed](docs/grokbot-gateway-tests.txt); no live request is made by those tests. The artifact verifier additionally cross-checks the actual preparation/send/reply records. These checks do not guarantee compatibility with future gateway/schema versions; inspect the runbook's stop conditions before reuse.
