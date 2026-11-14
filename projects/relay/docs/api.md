# Relay API

Start or resume a demo workspace with `POST /api/session`; its response sets an HttpOnly cookie. Subsequent same-origin calls use that cookie.

| Method | Endpoint | Result |
| --- | --- | --- |
| POST | /api/session | Create or resume the browser's workspace |
| GET | /api/tickets | Up to 100 workspace cases |
| POST | /api/tickets | Validated case and initial history event |
| GET | /api/tickets/:id | Case, events and saved runbook checks |
| PATCH | /api/tickets/:id | Status, priority and owner with a version check; returns case, events and checks |
| PUT | /api/tickets/:id/checks/:key | Save a boolean check; returns checks and events |
| POST | /api/tickets/:id/notes | Add an internal note |
| GET | /api/tickets/:id/handoff | Download a Markdown investigation handoff |
| GET | /api/activity | Up to 100 recent events with case references |

## Create a case

Send `Content-Type: application/json`:

```json
{
  "subject": "Webhook retry created a duplicate order",
  "body": "Delivery evt_8f32 returned 502. Its retry reused the same event ID.",
  "requester_name": "Demo operator",
  "requester_email": "operator@example.com",
  "category": "Bug report",
  "priority": "high",
  "incident_kind": "webhook",
  "service": "Delivery gateway",
  "environment": "production",
  "impact": "partial degradation",
  "request_id": "req_6a41"
}
```

Incident kinds: `webhook`, `import`, `identity`, `latency`. Services: Delivery gateway, Import pipeline, Identity API, Reporting API. Environments: production, staging. Impacts: single account, partial degradation, service interruption. Request IDs can be empty, with a maximum of 120 characters and no newline.

For compatibility, clients may omit incident fields. Defaults are webhook, Delivery gateway, production, single account and an empty request ID. Categories remain Account access, Billing, Bug report and Feature request. Priorities are low, normal, high and urgent.

## Update properties

Use the current version and all three editable properties:

```json
{"version":1,"status":"in_progress","priority":"high","owner":"Edmond Bassey"}
```

Statuses are `open`, `in_progress`, `pending` (shown as Waiting on evidence) and `resolved`. A resolved case can only move to open. Other active states can move to one another or resolved. Owners: Unassigned, Edmond Bassey, Maya Chen, Ellis Park.

## Save a check or note

A check key must belong to the case's runbook in `lib/incidents.ts`. Example: `PUT /api/tickets/:id/checks/response` with `{"checked":true}`. Repeating the same value does not add history. Check writes use last-write-wins for that boolean; they do not change the case property version.

Add a note with `{"message":"Captured the 502 response; checking duplicate handling."}`. Notes and handoff exports do not send messages to anyone.

## Errors

JSON errors use `{"error":"Human-readable message"}`.

- 400: invalid JSON, fields, check key, check value or version
- 401: missing or invalid workspace session
- 403: cross-origin browser write
- 404: case absent from this workspace
- 409: stale version or concurrent property update
- 413: request exceeds 16,000 bytes
- 415: JSON media type required
- 422: invalid workflow transition or workspace record limit
- 500: unexpected storage or service failure

Raw database errors are not returned. After 409, refresh the case and let the person review its current state.
