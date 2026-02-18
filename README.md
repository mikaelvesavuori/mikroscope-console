# MikroScope Console

MikroScope Console is the optional UI for exploring MikroScope logs.

It is a static frontend focused on fast debugging:

- stream view with expand/collapse log details
- correlation/trace drilldowns
- timeline histogram and quick filters
- saved queries in browser localStorage

## Purpose

Use the console when you want quick, visual investigation over MikroScope data without introducing a heavy observability stack.

## Prerequisites

- Node.js `>= 24`
- MikroScope API (default: `http://127.0.0.1:4310`)
- npm

## Install

```bash
npm install
```

## Quick Start (Local Dev)

From repository root:

```bash
# Terminal 1: start MikroScope API
npm run mikroscope:serve

# Terminal 2: serve console static files
npm run mikroscope-console:serve
```

Open:

```text
http://127.0.0.1:4320/
```

## Build

```bash
npm run build
```

Build output:

```text
dist/
```

## Configuration

Edit:

```text
mikroscope-console/src/config.json
```

Example:

```json
{
  "apiOrigin": "http://127.0.0.1:4310"
}
```

Fields:

- `apiOrigin`: base URL for MikroScope API

## Testing (Reproducible)

Tests run with Vitest + Happy DOM and use **real HTTP requests** against local test servers.
No network calls to `localhost:4310` are required during test runs.

1. Capture fixture data from a real running API once:

```bash
npm run fixtures:capture
```

This writes:

```text
tests/fixtures/logs.fixture.json
```

2. Run tests:

```bash
npm test
```

3. Run with coverage:

```bash
npm run test:coverage
```

## Usage

Main flows:

- **Query Controls**: set `from/to/level/audit/limit` and run
- **Inspect**: jump directly to `correlationId` / `requestId` and tune local filters
- **Correlations**: inspect grouped traces and error counts
- **Timeline**: click buckets to scope the stream locally
- **Saved Queries**: save/select/delete common filters

Notes:

- Server query `limit` is capped at `1000`
- Saved queries are local to the browser profile
- Run button is disabled while data is loading

## Guides

- Getting started: `docs/GETTING_STARTED.md`
- Testing and fixtures: `docs/TESTING.md`

## Deployment Example

Because it is static, deploy with any web server (Caddy, Nginx, object storage + CDN, etc.).

Minimal Caddy example:

```caddyfile
console.example.com {
  root * /srv/orderbutler/mikroscope-console/public
  file_server
}
```

Set `apiOrigin` in `config.json` to the reachable MikroScope API URL.

## Related

Backend sidecar and API:

- `mikroscope/README.md`

Operational runbook (backup/restore):

- `mikroscope/OPS_RUNBOOK.md`
