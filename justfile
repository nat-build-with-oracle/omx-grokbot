# grokbot — verify locally, deploy the add-on to the Home Assistant guest, and
# read the running version back. A success message is not evidence; every deploy
# recipe ends by reading state from the guest.
#
# Coordinates come from the environment (set them in a gitignored .envrc):
#   GROKBOT_BOX   ssh target of the HAOS guest (default kvmlab1.oracle.netbird)
# No credential is read, printed, or passed through argv here.

set shell := ["bash", "-euo", "pipefail", "-c"]
set positional-arguments

box   := env_var_or_default("GROKBOT_BOX", "kvmlab1.oracle.netbird")
slug  := "local_grokbot"
addon := "/addons/grokbot"

_default:
    @just --list --unsorted

# ── verify (local, no guest) ───────────────────────────────────────────────────

# Typecheck, unit tests, web build, and the add-on entrypoint's static checks.
verify: check
    bash -n run.sh
    shellcheck run.sh
    grep -q '^version:' config.yaml
    git diff --check -- .

check:
    npm run check

web:
    npm run build

# The option bridge without Supervisor: prints what run.sh would export from a
# sample options file, with deliberately non-default values.
dry-run:
    #!/usr/bin/env bash
    set -euo pipefail
    dir=$(mktemp -d)
    printf '%s' '{"allowed_hosts":"homeassistant.local:8123","grokbot_ssh_host":"box@grokbot1.oracle.netbird","ssh_identity_file":"","ssh_known_hosts":"grokbot1.oracle.netbird ssh-ed25519 AAAA","public_url":""}' >"$dir/options.json"
    OPTIONS_FILE="$dir/options.json" BRIDGE_DATA_DIR="$dir" DRY_RUN=1 ./run.sh

# ── deploy (⚠ changes live state on the guest) ────────────────────────────────

# Anonymous consumer-side probe. Supervisor pulls without credentials, so a
# private or missing package surfaces as a misleading install failure. 200 means
# installable, 401 private, 404 absent.
probe:
    @printf 'amd64-addon-grokbot: HTTP '
    @curl -sS -o /dev/null -w '%{http_code}\n' \
        https://ghcr.io/v2/nat-build-with-oracle/amd64-addon-grokbot/tags/list

# Copy the manifest to the guest. The image itself comes from ghcr.io, so no
# source is compiled there: only config.yaml, DOCS.md and run.sh are needed.
push:
    @echo "==> {{addon}} on {{box}}"
    rsync -az --delete \
        --exclude node_modules/ --exclude dist/ --exclude data/ --exclude '.git*' \
        --exclude ψ/ --exclude .impeccable/ --exclude .playwright-mcp/ \
        ./ "{{box}}:{{addon}}/"
    ssh "{{box}}" "chmod 0755 {{addon}}/run.sh"

# rsync the manifest, then update to the version config.yaml advertises and poll
# until that version is the RUNNING one. Supervisor pulls the published image, so
# a new release means: bump version, push to main, wait for CI, then run this.
deploy: check push
    #!/usr/bin/env bash
    set -euo pipefail
    WANT=$(awk -F'"' '/^version:/{print $2}' config.yaml)
    ssh "{{box}}" "ha store reload >/dev/null"
    NOW=$(ssh "{{box}}" "ha apps info {{slug}}" | awk '/^version:/{print $2}')
    if [ "$NOW" != "$WANT" ]; then
        echo "→ installed $NOW, published $WANT: updating {{slug}}"
        ssh "{{box}}" "ha store apps update {{slug}}" | tail -1 || true
    else
        echo "→ already at $WANT: restarting {{slug}} (bump version to ship new code)"
        ssh "{{box}}" "ha apps restart {{slug}}" | tail -1 || true
    fi
    for i in $(seq 1 20); do
        NOW=$(ssh "{{box}}" "ha apps info {{slug}}" | awk '/^version:/{print $2}')
        STATE=$(ssh "{{box}}" "ha apps info {{slug}}" | awk '/^state:/{print $2}')
        [ "$NOW" = "$WANT" ] && [ "$STATE" = "started" ] && { echo "→ running $NOW, state $STATE"; break; }
        if [ "$NOW" = "$WANT" ] && [ "$STATE" != "started" ] && [ "$STATE" != "startup" ]; then
            echo "→ $NOW installed, state $STATE: starting {{slug}}"
            ssh "{{box}}" "ha apps start {{slug}}" | tail -1 || true
        fi
        sleep 15
    done
    [ "$NOW" = "$WANT" ] && [ "$STATE" = "started" ] || { echo "✗ $NOW / $STATE after 5 min — read: ssh {{box}} 'ha apps logs {{slug}} | tail -30'" >&2; exit 1; }
    just status

# First installation: probe the registry, let the store see the folder, install
# (a pull, not a build), start.
install: probe push
    ssh "{{box}}" "ha store reload >/dev/null && ha store apps install {{slug}}" | tail -1
    ssh "{{box}}" "ha apps start {{slug}}" | tail -1 || true
    @just status

restart:
    ssh "{{box}}" "ha apps restart {{slug}}" | tail -1

logs N="40":
    @ssh "{{box}}" "ha apps logs {{slug}}" | tail -{{N}}

# Add-on state, version, ingress entry — read from the guest.
status:
    @ssh "{{box}}" "ha apps info {{slug}}" | grep -E '^(state|version|version_latest|ingress_entry|ingress_url|ingress_panel):'

# Health of the running bridge through its LAN port on the guest.
health:
    @ssh "{{box}}" "curl -sS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8120/api/connections"
