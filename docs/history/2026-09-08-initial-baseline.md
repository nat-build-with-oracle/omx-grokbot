# Full System Exploration Report
> **Historical, superseded draft.** Several interpretations below were corrected in the [current report](../../system_full_exploration_report.md). This archive is not current-state evidence.

**Date:** 2026-09-08
**Scope:** Local macOS workstation (`/Users/nat/omx-grokbot`) and remote host `grokbot1` accessed via NetBird/SSH.

## Objective
Explore the environment and produce a consolidated baseline document of system state.

## 1) Access and connectivity verification
- Confirmed SSH target resolution and login path are available via NetBird aliases.
- Tested command execution over SSH with public-key auth to `box@grokbot1`.
- Result: authenticated successfully and command execution works non-interactively.
- Host fingerprint check succeeded after key trust was added.

## 2) Local system exploration (macOS)
### 2.1 Host identity and basic OS
- Kernel/OS: `Darwin 25.3.0` (macOS build `25.3.0`, kernel `root:xnu-12377.91.3~2`), host likely `Nats-MacBook-Air.local`.
- Current user: `nat`.
- Current date/time: `Tue Sep  8 08:14:50 +07 2026`.

### 2.2 Storage
Root and data volumes are mounted across APFS containers. Notable stats:
- Main data volume (`/System/Volumes/Data`) is near capacity at **398Gi used / 460Gi**.
- Root (`/`) is mostly empty (17Gi used / 460Gi).

### 2.3 Runtime/resource overview
- `top -l 1` shows high process count (~787 total, most sleeping), with **CPU idle still significant** at snapshot time and memory pressure moderate.
- Local memory snapshot showed around **15G physical memory used** with ~111M unused and non-trivial compressed memory footprint.
- Numerous persistent user-facing/background services are running (many browsers/communication/runtime tools).

### 2.4 Filesystem and account footprint
- Working directory contains minimal repo assets:
  - `.omx/metrics.json`
  - `.omx/logs/turns-2026-09-08.jsonl`
- Confirmed user home is large and active (`~` has numerous dot-directories including `.agents`, `.codex`, `.config`, `.docker`, etc.).

### 2.5 Network (local)
- Active interface `en0` with IPv4 `192.168.1.12/24`.
- Active established outbound connections visible; no immediate local blocking issues observed.

## 3) Remote system exploration (`grokbot1`)
### 3.1 Identity and OS
- SSH target resolved via NetBird alias to IP `100.97.63.219`.
- Hostname: `cursor`.
- Login user: `box`.
- OS/kernel: Linux 6.12.94+, Debian GNU/Linux 13 (trixie, DEBIAN 13.6).

### 3.2 Uptime and resources
- Uptime: **7:36** (at capture time).
- CPU/memory from one sample:
  - Mem total: ~15Gi, used ~12Gi, available ~3.1Gi.
  - Swap total: ~15Gi (mostly unused).
- Root filesystem is overlay-backed: **126Gi total, 22Gi used (19%)**.

### 3.3 Network interfaces and routing
- Key addresses:
  - `enp0s3: 172.30.0.2/24`
  - `wt0: 100.97.63.219/16` (NetBird/wireguard interface)
  - `docker0: 172.17.0.1/16`
- UDP/TCP listeners include:
  - SSH (`22`)
  - Various Node/exec service ports (`1337/1338`, `1339/1340`, `13602-13604`, `14002-14004`)
  - VNC/Websockify ports (`5900-5904`, `6080/6081`)
  - Misc exposed ports (`26500`, `50052`)
  - DNS service on local/host addresses (`53` on `100.97.63.219` and loopback)

### 3.4 Running processes (high-level)
Notable long-running services observed:
- Multiple `/exec-daemon/node ... /exec-daemon/index.js serve ...` instances (multiple service ports).
- `/usr/local/bin/sand-*` Node services:
  - `sand-supervisor.mjs`
  - `sand-session-sync.mjs`
  - `sand-web-bot-auth.mjs`
  - `sand-ua-governor.mjs`
  - `sand-cookie-persist.mjs`
- Chromium (`/opt/google/chrome/chrome`) instances in background-like profile mode.
- X11/VNC bridge components (`Xvfb`, `x11vnc`, `websockify`).
- `sshd` active on 22.

### 3.5 Filesystem layout (remote)
- `/home/box` exists and includes many runtime/config directories (`.bun`, `.cache`, `.config`, `.cursor`, `.grok`, `.ssh`, `chrome-profile[-n]`, `sand-data`, `sand-host`, `deps`, etc.).

### 3.6 Additional observations
- `docker` CLI is not installed on the remote container (`docker: command not found`), so Docker inspection couldn’t run.
- `systemctl` is not available (containerized/system not booted with systemd).

## 4) Cross-system observations
- Local macOS machine can successfully authenticate to remote `grokbot1` over SSH, indicating network and key-based trust path is functioning.
- Remote host is an application/runtime container-like environment with heavy automation tooling and browser remote-execution services.
- Local repo is extremely small in current directory, while user home has extensive developer tooling footprints.

## 5) Command log used for evidence
- Local scans: `uname`, `df`, `top`, `ifconfig`, `netstat`, directory listings.
- Remote scans: `hostname`, `whoami`, `id`, `uname`, `/etc/os-release`, `uptime`, `df -h`, `free -h`, `ip addr`, `ss -tulnp`, `ps`, `lsblk`, `mount`, `ls /home/box`.

## 6) Next steps
To expand this into an ops-oriented audit, recommend:
1. Add scheduled snapshots (hourly) of `df`, `free/mem`, `top`-style memory, and process counts.
2. Define service owner mapping for each major `exec-daemon`/`sand-*` process.
3. Add remote alerting for VNC/exec ports exposure scope and authentication state.
4. Capture `/etc/crontab` and user cron entries if change-control auditing is required.

---
**Notes:** This is a baseline “full” discovery write-up and can be refreshed after any major config/service changes.
