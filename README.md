# pi-honcho

Pi extension for [Honcho](https://github.com/plastic-labs/honcho) — an agent memory layer.

Honcho builds long-term memory for AI agents by storing conversations and extracting conclusions (facts, preferences, inferences). This extension wires pi into Honcho so every session is persisted and the LLM can query memory on demand.

## Features

- **Auto-sync** — user and assistant messages are pushed to Honcho after every turn
- **`honcho_memory`** — tool for the LLM to query Honcho's Dialectic agent (answers grounded in stored facts)
- **`honcho_remember`** — tool for the LLM to explicitly store facts/conclusions
- **`honcho_representation`** — tool for a fast read-only context dump (no LLM call)
- **`/honcho-status`** — command to inspect connection state
- **Status bar indicator** — green when connected, red when Honcho is offline
- **Graceful degradation** — tools return clear error messages when Honcho isn't reachable
- **State persistence** — survives pi session reloads

## Install

```bash
pi install git:github.com/leonj1/pi-honcho
```

Or locally during development:

```bash
pi install ./path/to/pi-honcho
```

## Prerequisites

A running [Honcho](https://github.com/plastic-labs/honcho) server. By default the extension expects it on `http://localhost:8000`.

Start Honcho:

```bash
cd honcho
uv run fastapi dev src/main.py
```

The server needs PostgreSQL with pgvector (the `.env` file points at `localhost:5490`).

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `HONCHO_API_URL` | `http://localhost:8000` | Honcho server URL |

Honcho auth is disabled by default (`AUTH_USE_AUTH=false`). If you enable it, pass the JWT as a header — the extension uses unauthenticated requests.

## How it maps

| pi concept | Honcho resource |
|-----------|----------------|
| Project directory | Workspace (auto-named from dir) |
| OS user (`$USER`) | Peer (e.g. `jose` and `jose-agent`) |
| pi session | Session (`pi-{sessionfile}`) |
| User message | Message (user peer) |
| Assistant response | Message (agent peer) |

## Tools

### `honcho_memory`

Query Honcho's long-term memory. The Dialectic agent answers questions grounded in stored conclusions and session history.

```
"Does the user have a preferred testing framework?"
"What did we decide about the database schema last week?"
```

Parameters: `query` (required), `target` (optional peer), `reasoning_level` (optional: minimal/low/medium/high/max).

### `honcho_remember`

Store a fact or conclusion explicitly.

```
"User prefers Rust over Python for systems programming."
"Auth module must support OAuth2 + API keys."
```

Parameters: `content` (required), `about` (optional peer).

### `honcho_representation`

Get a read-only summary of stored conclusions. Faster than `honcho_memory` since it skips the LLM call.

Parameters: `target` (optional peer).

## License

MIT
