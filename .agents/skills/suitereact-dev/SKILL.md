---
name: suitereact-dev
description: 'Starts, inspects, and stops a managed SuiteReact Vite and optional NetSuite OAuth proxy session. Use for local app development or browser testing without leaking background processes.'
---

# Run a SuiteReact app locally

**Usage:** `/suitereact-dev <app-name> [--live] [--port <port>]`

Run `npm run doctor` first; use `-- --live` only when NetSuite credentials are required. Then start the session:

For live local calls, copy the app's `example.env` to `.env.development.local` and use the same token as `SUITEREACT_PROXY_TOKEN` in `server/.env`. Never use a production-mode env file.

```bash
cp apps/<app-name>/example.env apps/<app-name>/.env.development.local
```

```bash
npm run dev -- <app-name> [--live] [--port <port>]
```

The session manager verifies service identity, starts the OAuth proxy only for live calls, selects a strict free Vite port, waits for health checks, and reports URLs, PIDs, logs, reuse, and ownership as JSON. It never reuses an unknown service on port 3001.

Inspect or stop the session with:

```bash
npm run dev:status -- <app-name>
npm run dev:stop -- <app-name>
```

Always stop managed sessions after automated tests. The stop command terminates only processes started and owned by that session. `handleRestletAction` uses the configured local proxy during Vite development and the hosted NetSuite route after deployment; direct `REST.post` is only for intentionally hosted-only client code.
