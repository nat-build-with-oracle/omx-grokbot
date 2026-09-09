# GrokBot Bridge — Home Assistant add-on

This add-on runs the bridge from this repository inside Home Assistant OS. The
owner console is reached through Ingress; the MCP endpoint is reached through
the add-on's own port, because an MCP client cannot authenticate to an Ingress
URL.

## Installation

The manifest is installed from a local folder; the image is pulled from
`ghcr.io/nat-build-with-oracle/amd64-addon-grokbot`, published by CI on every
push to `main`. Supervisor never compiles anything on the guest.

```sh
just probe      # anonymous registry check: 200 installable, 401 private, 404 absent
just install    # probe, rsync the manifest, ha store reload, install (a pull), start
just status     # read state and version back from the guest
```

`GROKBOT_BOX` selects the guest (default `kvmlab1.oracle.netbird`).
`just status` is the evidence that the intended version is running; a successful
command is not.

Shipping a change:

```sh
# bump `version:` in config.yaml, commit, push to main, wait for the builder run
just deploy     # tests, rsync the manifest, update to the published version, poll
just logs 60
```

The version in `config.yaml` is also the image tag. Supervisor updates only
across a version change, so new code needs a bump, not a restart.

## Options

| Option | Meaning |
|---|---|
| `allowed_hosts` | Comma-separated `host[:port]` values the front-door host filter accepts. Ingress requests arrive with the Home Assistant host in the `Host` header, so the panel returns HTTP 421 until that value is listed (for example `homeassistant.local:8123,192.168.1.10:8123`). |
| `grokbot_ssh_host` | Grok Bot SSH target. Only the approved NetBird targets are accepted by the bridge. |
| `ssh_identity_file` | Path, inside the add-on, of the private key for that host. `/share` is mounted read-only, so `/share/grokbot/id_ed25519` works. The key is copied to the private data directory at mode 600 before use. |
| `ssh_known_hosts` | `known_hosts` lines for the Grok Bot host. Strict host-key checking stays on, so remote calls fail until this is set. |
| `public_url` | Public **origin** (no path) when the bridge is fronted by an HTTPS tunnel. Non-loopback origins must be HTTPS. Setting it does not create reachability. |

## Credentials

On first start the bridge generates distinct owner and headless-client secrets
inside its private data directory (`access.json`, mode 600). They are never
printed to the log. Read the file on the guest when configuring a client, and
keep it out of commits, screenshots, and chat.

## Ports and paths

- Ingress: the owner console (`/`, `/chat`, `/new`, `/history`, `/connections`).
- `8120/tcp`: the same console plus `/mcp` and the JSON API for MCP clients.
- `/data`: SQLite ledger, LanceDB vectors, `access.json`, embedding model cache,
  and the copied SSH material under `.ssh/`.

## Limits

- History search reads a separate workstation over SSH. Inside the add-on that
  host is unreachable unless its key and host key are configured too; the rest
  of the bridge works without it.
- The bridge refuses to start while a lock file remains. `run.sh` clears a lock
  left by a previous container, because a restarted container cannot share a PID
  namespace with the process that wrote it.
- `amd64` only. The image is built on the guest, not pulled from a registry.
