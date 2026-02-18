# MikroScope Console

**A minimal, fast log console for [MikroScope](https://github.com/mikaelvesavuori/mikroscope).**

MikroScope Console is a static web UI for investigating logs, correlations, and time patterns without running a heavy observability stack.

## Requirements

| Requirement | Default | Notes |
| --- | --- | --- |
| MikroScope API | `http://127.0.0.1:4310` | Must expose `/api/logs` and `/api/logs/aggregate` |
| Browser | Modern Chromium/Firefox/Safari | JavaScript required |
| Static hosting | Any web server/CDN | Console is a static frontend |

## At A Glance

| Capability | What you can do | Why it helps |
| --- | --- | --- |
| Stream | Browse logs with expandable rows and load-more pagination | Fast triage on large result sets |
| Inspect | Jump directly to `correlationId` or `requestId`, then refine with local filter/sort | Isolate one trace quickly |
| Correlations | View grouped correlation cards with error counts and copy IDs/chain JSON | Follow a request path end-to-end |
| Timeline | Drill down by time bucket (auto-fit or manual) | Spot bursts and scope precisely |
| Saved Query + URL Path | Save common queries and copy a shareable view path | Reuse and share investigations |
| Keyboard + Command Palette | Drive core actions without mouse-only workflows | Higher operator throughput |

## Quick Start

| Setup path | Best for | Command |
| --- | --- | --- |
| One-line installer (recommended) | Running the console quickly | `curl -fsSL https://raw.githubusercontent.com/mikaelvesavuori/mikroscope-console/main/install.sh -o install.sh && sh install.sh && rm install.sh` |
| One-line installer (specific version) | Pinned deployments | `curl -fsSL https://raw.githubusercontent.com/mikaelvesavuori/mikroscope-console/main/install.sh -o install.sh && sh install.sh --version vX.Y.Z --dir /srv/mikroscope-console && rm install.sh` |
| Manual release bundle | Offline/manual deployment flow | Download from [GitHub Releases](https://github.com/mikaelvesavuori/mikroscope-console/releases) |
| Local development | Editing the UI | `npm install && npm start` |

After installation (release bundle path):

| Step | Action |
| --- | --- |
| 1 | Edit `public/config.json` and set `apiOrigin` to your MikroScope API |
| 2 | Serve static files, for example: `npx http-server public -p 4320 -c-1` |
| 3 | Open `http://127.0.0.1:4320/` |

## Configuration

| File | When to edit |
| --- | --- |
| `public/config.json` | Running from a prebuilt release bundle |
| `src/config.json` | Running from this repository in local development |

| Key | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `apiOrigin` | string (URL) | Yes | `http://127.0.0.1:4310` | Base URL of your MikroScope API |

Example:

```json
{
  "apiOrigin": "https://logs.example.com"
}
```

## Daily Usage

| Goal | Where | Action |
| --- | --- | --- |
| Fetch logs in a time window | Query Controls | Set `From`, `To`, optional filters, then run query |
| Investigate one trace | Inspect | Set key (`Auto`/`correlationId`/`requestId`) and value, then `Go to Trace` |
| Narrow by traffic spikes | Timeline | Open Timeline, click bucket to drill down, click again to clear |
| Reuse common filters | Query Controls > Advanced | Save query, select saved query, run |
| Share an exact view | Advanced or keyboard | Click `Copy View URL` or press `U` |
| Work in expanded stream | Workspace | Press `Space` or click expand icon |

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + K` | Open command palette |
| `Q` | Toggle query controls |
| `I` | Toggle inspect panel |
| `S` | Open stream tab |
| `C` | Open correlations tab |
| `T` | Open timeline tab |
| `U` | Copy current view URL path |
| `Enter` | Run query |
| `Space` | Toggle expanded stream |
| `?` | Toggle shortcuts help |

Shortcuts are ignored while typing in editable controls.

## Shareable View URL Parameters

The copied URL path keeps query state in URL parameters.

| Parameter | Example | Meaning |
| --- | --- | --- |
| `from` | `2026-02-18T00:00:00.000Z` | Start timestamp (ISO-8601) |
| `to` | `2026-02-18T23:59:59.999Z` | End timestamp (ISO-8601) |
| `level` | `ERROR` | Log level filter |
| `audit` | `true` | Audit filter (`true`/`false`) |
| `field` | `correlationId` | Field used with `value` |
| `value` | `8b5a...` | Filter value (contains match) |
| `limit` | `1000` | Server-side limit (`1-1000`) |

## MikroScope API Compatibility

| Endpoint | Method | Used for | Required response fields |
| --- | --- | --- | --- |
| `/api/logs` | `GET` | Main stream query and pagination | `entries` (array), `hasMore` (boolean), `nextCursor` (string/null) |
| `/api/logs/aggregate` | `GET` | Insights/cards (`level`, `event`, `component`, `correlation`) | `buckets` (array of `{ key, count }`) |

## Deploying

Because it is static, you can host it on any static web server or CDN.

| Target | Notes |
| --- | --- |
| Nginx / Caddy / Apache | Serve `public/` from release bundle or `dist/` from local build |
| Object storage + CDN | Upload static files and cache aggressively |
| Local troubleshooting | `npx http-server public -p 4320 -c-1` |

Minimal Caddy example:

```caddyfile
console.example.com {
  root * /srv/mikroscope-console/public
  file_server
}
```

## Troubleshooting

| Problem | Likely cause | Fix |
| --- | --- | --- |
| No logs appear | `apiOrigin` wrong or API unavailable | Verify `config.json` and test API reachability |
| Query loads but cards are empty | Aggregate endpoint unavailable | Check `/api/logs/aggregate` on backend |
| Timeline looks empty | Timestamps missing/invalid in returned logs | Ensure entries include parseable timestamps |
| CORS/network errors in browser devtools | API not allowing frontend origin | Allow CORS for your console host |

## Maintainers

Developer and release workflows are documented in `docs/MAINTAINERS.md`.
