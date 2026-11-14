# Relay

An integration incident desk for failed webhook deliveries, rejected imports, access failures and slow API requests.

**TypeScript · React · REST API · SQLite / Cloudflare D1**

## Try an investigation

Open the duplicate-order case. Read the failed response and request ID, complete a runbook step, add a field note, and export the investigation handoff. Create a case to try another incident type; each type has its own four-step runbook.

Each browser gets a separate demo workspace with ten fictional incidents. Case changes, checklists and history are stored on the server and survive a reload. Notes remain internal; the app sends no email. The matching `req_6a41` fixture in [Logbook](../logbook) provides a related service-event investigation.

## Run locally

Use Node.js 24 and npm. For a fresh local database:

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_faulty_shadow_king.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_slimy_meggan.sql
npm run dev
```

Open the development URL printed by the server. Apply each migration once, in order. For an existing database already using migration 0000, apply only 0001. Local records live in the ignored `.wrangler/` directory. Migration 0001 adds incident fields and checklists without replacing existing tickets.

Build and development use Vinext and Cloudflare Workers. The hosting integration and vendor license remain in `scripts/vite/`.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

The 26 tests run service queries against an in-memory SQLite database using both application migrations. They cover workspace isolation, validation, transitions, atomic audit writes, stale updates, a write racing after the initial read, request boundaries, CSV formula protection, incident metadata, runbook membership, checklist persistence, repeat toggles and handoff content.

## Engineering choices

- Ticket, history and checklist lookups include the workspace ID.
- Property changes use a version check. Stale writes receive HTTP 409 and the interface loads the current state.
- A property change and its history entry share a transaction. A per-operation ID prevents an unsuccessful write from creating a misleading event.
- Checklist writes validate the incident's runbook and record an audit event only when the checked value changes.
- A resolved case must be reopened before moving to another active state.
- Incident fields are validated against known values; request IDs are bounded single-line text.
- Handoffs contain evidence, completed checks and history, without the workspace session identifier.
- Native dialogs provide modal focus and keyboard dismissal.

[API reference](docs/api.md) · [Architecture and walkthrough](docs/engineering-notes.md)

## Project boundaries

This is a portfolio demo with fictional data. The random HttpOnly session cookie identifies a demo workspace, rather than a production user account. A production service would need account authentication, membership roles, rate limiting and a retention policy. The queue holds up to 100 cases per workspace and searches those loaded records in the browser. Runbooks guide investigation; they do not call external APIs or replay deliveries.

## Author

Edmond Bassey
