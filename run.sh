#!/bin/sh
set -eu
umask 077

OPTIONS_FILE="${OPTIONS_FILE:-/data/options.json}"
DATA_DIR="${BRIDGE_DATA_DIR:-/data}"
APP_DIR="${APP_DIR:-/app}"
SSH_DIR="${DATA_DIR}/.ssh"

mkdir -p "${DATA_DIR}" "${SSH_DIR}"
chmod 0700 "${SSH_DIR}"

OPT_DIR="$(mktemp -d)"
trap 'rm -rf "${OPT_DIR}"' EXIT INT TERM

# Supervisor options arrive as JSON. Each value is written to its own file
# instead of eval-ed shell text, so no option value can become a command.
if [ -f "${OPTIONS_FILE}" ]; then
    # shellcheck disable=SC2016  # the JavaScript below is data for node, not shell
    node -e '
const { readFileSync, writeFileSync } = require("node:fs");
const options = JSON.parse(readFileSync(process.argv[1], "utf8"));
for (const key of ["allowed_hosts", "grokbot_ssh_host", "ssh_identity_file", "ssh_known_hosts", "public_url"]) {
  writeFileSync(`${process.argv[2]}/${key}`, String(options[key] ?? ""));
}
' "${OPTIONS_FILE}" "${OPT_DIR}"
else
    for key in allowed_hosts grokbot_ssh_host ssh_identity_file ssh_known_hosts public_url; do
        : >"${OPT_DIR}/${key}"
    done
fi

option() { cat "${OPT_DIR}/$1"; }

grokbot_ssh_host="$(option grokbot_ssh_host)"
allowed_hosts="$(option allowed_hosts)"
public_url="$(option public_url)"
ssh_identity_file="$(option ssh_identity_file)"
ssh_known_hosts="$(option ssh_known_hosts)"

if [ -n "${grokbot_ssh_host}" ]; then
    GROKBOT_SSH_HOST="${grokbot_ssh_host}"
    export GROKBOT_SSH_HOST
fi
if [ -n "${allowed_hosts}" ]; then
    BRIDGE_ALLOWED_HOSTS="${allowed_hosts}"
    export BRIDGE_ALLOWED_HOSTS
else
    echo "allowed_hosts is empty: the ingress panel will answer HTTP 421 until the Home Assistant host[:port] is listed." >&2
fi
if [ -n "${public_url}" ]; then
    BRIDGE_PUBLIC_URL="${public_url}"
    export BRIDGE_PUBLIC_URL
fi

if [ -n "${ssh_known_hosts}" ]; then
    printf '%s\n' "${ssh_known_hosts}" >"${SSH_DIR}/known_hosts"
    chmod 0600 "${SSH_DIR}/known_hosts"
elif [ ! -s "${SSH_DIR}/known_hosts" ]; then
    echo "ssh_known_hosts is empty: strict host-key checking stays on, so every Grok Bot call will fail until the host key is configured." >&2
fi

# SSH refuses a group- or world-readable key, and /share is read-only here, so
# the configured key is copied into the private data directory at mode 600.
if [ -n "${ssh_identity_file}" ]; then
    if [ ! -r "${ssh_identity_file}" ]; then
        echo "ssh_identity_file is not readable inside the add-on: ${ssh_identity_file}" >&2
        exit 1
    fi
    cp "${ssh_identity_file}" "${SSH_DIR}/identity"
    chmod 0600 "${SSH_DIR}/identity"
    GROKBOT_SSH_IDENTITY_FILE="${SSH_DIR}/identity"
    export GROKBOT_SSH_IDENTITY_FILE
fi

if [ "${DRY_RUN:-0}" = "1" ]; then
    printf 'umask=077\n'
    printf 'host=%s port=%s data=%s\n' "${BRIDGE_HOST:-127.0.0.1}" "${PORT:-8120}" "${DATA_DIR}"
    printf 'grok_host=%s identity=%s\n' "${GROKBOT_SSH_HOST:-unset}" "${GROKBOT_SSH_IDENTITY_FILE:-unset}"
    printf 'allowed_hosts=%s public_url=%s\n' "${BRIDGE_ALLOWED_HOSTS:-unset}" "${BRIDGE_PUBLIC_URL:-unset}"
    printf 'known_hosts_lines=%s\n' "$(wc -l <"${SSH_DIR}/known_hosts" 2>/dev/null || echo 0)"
    exit 0
fi

# The bridge refuses to start while a lock file remains, because an owner must
# confirm the recorded process stopped. A restarted container never shares a PID
# namespace with the process that wrote this lock, so it cannot still be running.
LOCK="${DATA_DIR}/server.lock"
if [ -e "${LOCK}" ]; then
    echo "Clearing the lock left by container PID $(cat "${LOCK}" 2>/dev/null || echo unknown)."
    rm -f "${LOCK}"
fi

cd "${APP_DIR}"
exec tsx server/main.ts
