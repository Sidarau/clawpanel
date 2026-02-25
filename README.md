# ClawPanel

Minimal Next.js app that exposes a server-side adapter for Antfarm workflow data.

## Requirements

- Node.js **20+** (tested with Node 22)
- npm
- Antfarm installed locally (for real data reads)

## Antfarm DB configuration

By default the adapter reads from:

`~/.openclaw/antfarm/antfarm.db`

For local dev/tests, you can override the path:

```bash
ANTFARM_DB_PATH=/absolute/path/to/antfarm.db
```

The DB path is only resolved on the server and is never returned by API responses.

## API endpoints

- `GET /api/health` → `{ "ok": true }`
- `GET /api/antfarm/runs` → `{ "runs": [...] }`
- `GET /api/antfarm/runs/:id` → `{ "run": {...} }` (or `404`)

## Local smoke check

Start the app:

```bash
npm run dev
```

In another terminal, run a quick endpoint check:

```bash
curl -sS http://localhost:3000/api/health
curl -sS http://localhost:3000/api/antfarm/runs
```

Or use the script:

```bash
npm run smoke:adapter
# optional custom URL
npm run smoke:adapter -- --base-url http://localhost:3000
```
