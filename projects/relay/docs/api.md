# Relay API

The browser uses the same-origin JSON API. Start a workspace with POST /api/session; its response sets an HttpOnly cookie. Subsequent calls use that cookie.

| Method | Endpoint               | Result                                                    |
| ------ | ---------------------- | --------------------------------------------------------- |
| POST   | /api/session           | Create or resume the browser's demo workspace             |
| GET    | /api/tickets           | Up to 100 workspace tickets, most recently updated first  |
| POST   | /api/tickets           | Create a validated ticket and its initial history event   |
| GET    | /api/tickets/:id       | Ticket and complete event history                         |
| PATCH  | /api/tickets/:id       | Change status, priority and assignee with a version check |
| POST   | /api/tickets/:id/notes | Add an internal note                                      |
| GET    | /api/activity          | Up to 100 recent events with ticket references            |

## Create a ticket

Send Content-Type: application/json:

```json
{
  "subject": "Cannot export a report",
  "body": "The export stops before downloading the CSV.",
  "requester_name": "Morgan Demo",
  "requester_email": "morgan@example.com",
  "category": "Bug report",
  "priority": "high"
}
```

Categories: Account access, Billing, Bug report, Feature request.
Priorities: low, normal, high, urgent.

## Update a ticket

Use the current version and include all three editable properties:

```json
{
  "version": 1,
  "status": "in_progress",
  "priority": "high",
  "owner": "Edmond Bassey"
}
```

Statuses: open, in_progress, pending, resolved. A resolved ticket can only move to open. Other active statuses can move to one another or resolved.

Assignees: Unassigned, Edmond Bassey, Maya Chen, Ellis Park.

## Add a note

```json
{ "message": "Reproduced in the sample workspace. Checking the CSV header." }
```

## Error responses

Errors use `{"error":"Human-readable message"}`.

- 400: invalid JSON, fields or version
- 401: missing or invalid workspace session
- 403: cross-origin browser write
- 404: ticket does not exist in this workspace
- 409: stale version or concurrent update
- 413: request exceeds 16,000 bytes
- 415: JSON media type required
- 422: invalid workflow transition or workspace record limit
- 500: unexpected storage or service failure

The API does not return raw database errors. Client code must refresh the ticket after 409 and let the person review the current state.
