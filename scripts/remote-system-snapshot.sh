#!/usr/bin/env bash
# Read-only, bounded system metadata collection. Run over SSH; never with sudo.
# Deliberately excludes environment variables, private keys, credentials, browser
# profiles, file contents from user projects, process arguments and application logs.
set -u
export LC_ALL=C
if ! command -v timeout >/dev/null 2>&1; then
  printf 'Cannot collect safely: timeout is not available on PATH.\n' >&2
  exit 127
fi
section() { printf '\n===== %s =====\n' "$1"; }
run() {
  printf '\n$'; printf ' %q' "$@"; printf '\n'
  timeout 15 "$@" 2>&1
  local rc=$?
  if [ "$rc" -ne 0 ]; then printf '[exit=%s]\n' "$rc"; fi
  return 0
}
section 'Capture and identity'
run date -u +%FT%TZ
run hostname
run id
run uname -a
run cat /etc/os-release
run uptime
run ps -p 1 -o pid,ppid,user,comm
run readlink /proc/1/ns/pid /proc/self/ns/pid /proc/1/ns/mnt /proc/self/ns/mnt
run cat /proc/self/cgroup
run sh -c "awk '\$0 ~ / - cgroup2 / {print}' /proc/self/mountinfo"
run ls -ld /.dockerenv /run/.containerenv
section 'CPU, memory and visible cgroup controls (not host guarantees)'
run lscpu
run nproc
run free -h
run cat /proc/loadavg
run vmstat 1 3
for name in cpu.max cpu.stat cpuset.cpus.effective memory.max memory.high memory.current memory.peak memory.events memory.swap.max memory.swap.current pids.max pids.current; do
  file="/sys/fs/cgroup/$name"
  if [ -r "$file" ]; then printf '\n%s\n' "$file"; cat "$file"; fi
done
member=$(awk -F: '$1 == "0" {print $3}' /proc/self/cgroup)
if [ -n "$member" ] && [ "$member" != / ]; then
  group="/sys/fs/cgroup$member"
  while [ "$group" != /sys/fs/cgroup ] && [ -d "$group" ]; do
    printf '\nVisible member/ancestor cgroup: %s\n' "$group"
    for name in cgroup.type cpu.max cpuset.cpus.effective memory.max memory.current memory.events memory.swap.max pids.max pids.current; do
      if [ -r "$group/$name" ]; then printf '%s: ' "$name"; tr '\n' ' ' < "$group/$name"; printf '\n'; fi
    done
    group=${group%/*}
  done
fi
for file in /proc/pressure/cpu /proc/pressure/memory /proc/pressure/io; do
  if [ -r "$file" ]; then printf '\n%s\n' "$file"; cat "$file"; fi
done
section 'Filesystem and storage boundaries'
run df -hT
run df -i
run findmnt -rn -o TARGET,SOURCE,FSTYPE
run lsblk -o NAME,TYPE,SIZE,FSTYPE,MOUNTPOINTS
run ls -ld / /home /home/box /tmp /dev/shm /workspace /workspaces /opt /usr/local /var/log /var/backups
run ls -la /var/backups
run find /home/box -mindepth 1 -maxdepth 1 -printf '%y %f\n'
run find /opt /srv -mindepth 1 -maxdepth 1 -printf '%y %p\n'
section 'Network and DNS configuration'
run ip -brief address
run ip route show
run ip -6 route show
run cat /etc/resolv.conf
run getent hosts grokbot1 grokbot1.oracle.netbird cursor.oracle.netbird
run ss -s
run ss -H -lntu
section 'Security configuration and observation limits'
run sh -c "grep -E '^(Uid|Gid|Cap(Inh|Prm|Eff|Bnd|Amb)|NoNewPrivs|Seccomp):' /proc/self/status"
run sh -c "grep -E '^(Uid|Gid|Cap(Inh|Prm|Eff|Bnd|Amb)|NoNewPrivs|Seccomp):' /proc/1/status"
run cat /proc/sys/kernel/unprivileged_userns_clone /proc/sys/kernel/yama/ptrace_scope
run ls -ld /home/box/.ssh
run stat -c '%a %U:%G %n' /home/box/.ssh/authorized_keys
run sh -c "if [ -r /etc/ssh/sshd_config ]; then grep -Eih '^[[:space:]]*(Include|Port|ListenAddress|PasswordAuthentication|KbdInteractiveAuthentication|PubkeyAuthentication|PermitRootLogin|PermitEmptyPasswords|AuthenticationMethods|AllowTcpForwarding|GatewayPorts|X11Forwarding|UsePAM|Match)[[:space:]]' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null; fi"
run /usr/sbin/sshd -T
run sh -c 'command -v nft; command -v iptables; command -v ufw; command -v systemctl; command -v docker; command -v journalctl'
run sh -c 'found=0; for c in nft iptables ufw; do if command -v "$c" >/dev/null; then found=1; case "$c" in nft) nft list ruleset;; iptables) iptables -S;; ufw) ufw status;; esac; fi; done; if [ "$found" = 0 ]; then printf "No firewall inspection CLI on PATH\n"; fi'
section 'Process names and service-manager availability'
run ps -eo pid,ppid,user,comm,etimes,rss --sort=-rss
run systemctl is-system-running
run systemctl list-units --type=service --state=running --no-pager
run sh -c "awk -F: 'BEGIN {n=0} {n++} END {printf \"passwd account count: %d\\n\", n}' /etc/passwd"
section 'Time and logs (metadata only)'
run date -u +%FT%TZ
run readlink /etc/localtime
run ls -ld /var/log /var/log/journal /run/log/journal /var/log/apt /var/log/supervisor
run find /var/log -maxdepth 1 -type f -printf '%f %s bytes\n'
section 'End of read-only snapshot (individual probe failures above remain significant)'
