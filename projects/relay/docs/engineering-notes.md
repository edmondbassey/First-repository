# Relay: engineering notes

## One investigation, two kinds of state

The queue describes the incident: service, environment, impact, owner, priority and workflow status. The case file describes the investigation: observed evidence, request ID, a runbook, notes and a downloadable handoff.

`components/desk/IncidentDesk.tsx` owns the interface. `lib/domain.ts` and `lib/incidents.ts` validate inputs, `lib/service.ts` stores cases and history, and `lib/checks.ts` stores runbook progress. REST handlers resolve the workspace, validate the request boundary and call those services.

## Why transactions and versions both matter

A transaction keeps a case update and its audit event together. It does not stop an older browser tab from overwriting a newer value.

Property updates carry the version they read. SQL only updates a matching version. A unique operation ID is written with the change, and the audit insert checks that ID in the same transaction. A failed conditional update therefore cannot add a misleading event. The UI refreshes after HTTP 409.

A regression test interleaves a second write after the service reads the case and before its update executes. The older write receives 409, the newer state survives and no extra event appears.

## Checklist semantics

Each incident kind owns a fixed runbook. A check key from another runbook is rejected. Checks accept strict booleans and use a unique `(ticket_id, check_key)` constraint. An upsert changes only a different checked value, and a nonce guards its history insertion in the same transaction. Repeating the current value creates no audit noise.

Checklist booleans use last-write-wins rather than the case's property version. They track the recorded investigation, not external actions: checking a step never sends a delivery or touches a partner system.

## Isolation and migrations

The browser receives an opaque workspace UUID in an HttpOnly, SameSite cookie. Queries scope cases, events and checks by workspace. Tests try another workspace's case ID for reads, property edits, notes and checks.

Migration 0000 remains intact. Migration 0001 adds defaulted incident fields and the `incident_checks` table. Existing cases remain available; the new ten-case fixture is inserted only when a new workspace is created. Both migrations run against real SQLite in the tests.

This session mechanism is suitable for separate demo workspaces. Production accounts would need authentication, membership roles, rate limiting and a retention policy.

## Handoff and sample walkthrough

Open RLY-1041, record its failed response, add an internal field note, and download the handoff. The Markdown includes case metadata, quoted evidence, checklist progress and history. It excludes the workspace session ID.

The fictional request `req_6a41` also appears in Logbook's bundled capture. The apps share a scenario, not a live backend connection. Logbook can show that request's recorded service events; Relay holds the investigator's interpretation and handoff.

Useful code-review exercises: explain the operation-ID guard, reproduce a stale update in two tabs, trace a checklist toggle into SQL, and distinguish an internal field note from an outbound response.
