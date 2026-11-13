# Relay

A support desk for triaging customer issues, assigning work and keeping a clear history of what changed.

**TypeScript · React · REST API · SQLite / Cloudflare D1**

## Try it

Create a ticket with fictional customer details, assign it, move it through the workflow and add an internal note. Search the inbox by customer, subject or reference, then export the filtered records as CSV.

Each browser gets a separate demo workspace with ten fictional tickets. Records are stored on the server and survive a page reload. The interface does not send email.

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_faulty_shadow_king.sql
npm run dev
```

Open the development URL printed by the server. Apply the migration once for each new local database. Local records are kept under the ignored `.wrangler/` directory.

The development and build scripts use Vinext and Cloudflare Workers. The hosting integration and its vendor license remain in `scripts/vite/`.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

The 18 tests run real SQL against an in-memory SQLite database using the same migration and service queries as the application. They check workspace isolation, validation, transitions, rollback, stale writes, a write racing after the initial read, the record limit, request handling and CSV formula protection.

## Engineering choices

- All ticket and event queries include the workspace ID.
- Ticket changes use a version check. A stale update receives HTTP 409.
- A ticket update and its audit event share a transaction. An operation ID prevents an unsuccessful update from creating a history entry.
- A resolved ticket must be reopened before moving to another active state.
- Request bodies, field lengths and workspace size are bounded. SQL values are parameterized.
- Native dialogs handle modal focus and keyboard dismissal.

[API reference](docs/api.md) · [Architecture and walkthrough](docs/engineering-notes.md)

## Project boundaries

This is an interactive portfolio demo. The random, HttpOnly session cookie identifies a demo workspace; it is not a production account system. A production service would need account authentication, roles, rate limiting and a retention policy. The queue supports up to 100 tickets per workspace. The inbox searches those loaded records client-side.

All sample names, messages and email addresses are fictional.

## Author

Edmond Bassey
