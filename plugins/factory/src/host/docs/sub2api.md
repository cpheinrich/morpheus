# sub2api gateway — operator runbook

How to run a single-machine [sub2api](https://github.com/Wei-Shaw/sub2api) gateway (simple
mode) for the Factory plugin's gateway workers. This is explicit capability setup: neither
installing the Factory plugin nor Morpheus runs it.

## What it is

sub2api turns subscriptions (for example a Claude plan and a ChatGPT/Codex plan) into
Anthropic- and OpenAI-compatible endpoints. Each subscription is an account in a group; a
CLI authenticates with an `sk-` gateway key for that group.

This package owns only the install (`scripts/setup-sub2api.sh`) and this runbook. Which
gateway a worker uses, when, and with which key reference is decided by the Factory plugin
(see the plugin README, "Gateway mode"): it reads quota from the gateway admin API, uses a
gateway below its threshold, treats unknown quota as no headroom, and launches the CLI with
per-process overrides. Global `~/.claude` / `~/.codex` configuration is never rewritten.

`docs/design.md` describes a planned factory-owned `/factory/v1/capacity` document; that
broker shape is not built, and the plugin's direct admin-API read is the working path.

## Install

```sh
scripts/setup-sub2api.sh [DEPLOY_DIR]      # default ~/sub2api-deploy; idempotent
```

- Needs a Docker daemon (Colima or Docker Desktop) and the compose plugin
  (`brew install docker-compose` plus `cliPluginsExtraDirs` in `~/.docker/config.json`).
  After a reboot: `colima start`, then rerun the script.
- The deployment lives outside every repository:

  ```
  DEPLOY_DIR/
    docker-compose.local.yml   # upstream file at a pinned commit, SHA-256 checked
    docker-compose.pin.yml     # pins the application image release
    .env                       # secrets, mode 600, never printed or committed
    data/ postgres_data/ redis_data/
  ```

- `.env` sets `RUN_MODE=simple`, `SIMPLE_MODE_AUTO_CREATE_DEFAULT_GROUPS=true` and `TZ`.
  The admin password is the `ADMIN_PASSWORD` line of `.env`; the script never prints it.
- **Upgrades are deliberate.** Bump `COMPOSE_REF` + `COMPOSE_SHA256` and the image tag
  (`SUB2API_IMAGE_TAG`) together after reading the upstream changes. A checksum mismatch
  aborts before anything changes.

## Network

sub2api binds `0.0.0.0:8080` by default (`BIND_HOST` in `.env`), which reaches the local
network as well as a private overlay such as a tailnet. To restrict it, set `BIND_HOST` to
the machine's overlay address and rerun the script. There is no TLS; keep the gateway on
an encrypted private network.

## Gotchas

- **A saved native Claude login defeats the Claude gateway.** With both present the Claude
  CLI was observed to use the saved login and fail with `401` against the gateway token.
- **One owner per subscription.** A host that also holds a native login for an account the
  gateway holds can rotate the same refresh chain and invalidate the gateway's copy
  (`docs/design.md`, credential rule 3).
- **Retired models.** A gateway "Use Key" dialog may default to a model the provider has
  retired; configure a current one.
- **Terms of service.** sub2api's README warns that routing subscription traffic through a
  gateway may violate upstream terms. That is the operator's decision.

## Open questions

- Which sub2api usage fields are reliable enough to publish as a capacity document, and at
  what freshness (Claude's stored five-hour figure goes stale; Codex figures are upstream
  snapshots of varying age).
