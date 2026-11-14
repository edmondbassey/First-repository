import {
  AppError,
  LABELS,
  validateTicket,
  validateUpdate,
  validateNote,
} from "./domain.ts";
import type { Ticket, TicketEvent, Status, Priority } from "./domain.ts";
export type SqlResult<T = unknown> = {
  results: T[];
  meta?: { changes?: number };
};
export interface Statement {
  bind(...values: unknown[]): Statement;
  all<T = unknown>(): Promise<SqlResult<T>>;
  first<T = unknown>(): Promise<T | null>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<SqlResult[]>;
}
const at = (now: number, hours: number) =>
  new Date(now - hours * 3600000).toISOString();
const fixtures = [
  [
    "Webhook retries create duplicate orders",
    "Delivery evt_8f32 returned HTTP 502 after 1,200 ms. A retry used the same event ID, but the receiver created a second order. Preserve the response and verify idempotency before a staging replay.",
    "Nora Williams",
    "Bug report",
    "open",
    "urgent",
    "Edmond Bassey",
    3,
  ],
  [
    "Partner import rejects ISO dates",
    "Row 214 fails validation on a timezone suffix in completed_at. Earlier rows have already committed. Preserve a failing row and establish whether the import can be resumed safely.",
    "Alex Morgan",
    "Bug report",
    "in_progress",
    "high",
    "Maya Chen",
    7,
  ],
  [
    "Service token rejected after rotation",
    "The reporting integration now returns 403 after a token rotation. Compare expected audience and scopes without copying the credential into this case.",
    "Jamie Brooks",
    "Account access",
    "open",
    "high",
    "Unassigned",
    12,
  ],
  [
    "Nightly report exceeds gateway timeout",
    "The reporting endpoint spends 28 seconds on aggregation, but the caller times out at 25 seconds. Follow the gateway and report worker events to compare their budgets.",
    "Riley Patel",
    "Bug report",
    "pending",
    "normal",
    "Ellis Park",
    20,
  ],
  [
    "Delivery signatures fail on retried events",
    "First deliveries pass signature validation, but retries are rejected as expired. Check whether the retry reuses the original signing timestamp and confirm with a staging delivery.",
    "Taylor Adams",
    "Bug report",
    "in_progress",
    "normal",
    "Edmond Bassey",
    26,
  ],
  [
    "CSV import recovers from a blank amount",
    "The parser now identifies the row and column for a blank amount. A corrected five-row staging sample passed, and the failed batch created no partial records.",
    "Robin Lee",
    "Bug report",
    "resolved",
    "low",
    "Maya Chen",
    30,
  ],
  [
    "Out-of-order events overwrite a newer state",
    "An older status was applied after a later update had arrived. Preserve both event timestamps and check whether the receiver uses an event version.",
    "Casey Walker",
    "Bug report",
    "open",
    "low",
    "Unassigned",
    48,
  ],
  [
    "Workspace role cannot create API keys",
    "An integration administrator receives 403 when creating a staging API key. Compare the workspace role's intended permissions with the policy evaluation response.",
    "Drew Miller",
    "Account access",
    "pending",
    "high",
    "Ellis Park",
    54,
  ],
  [
    "Import progress stalls after row 500",
    "The worker retries validation while progress remains at the same offset. Check the resume cursor and identify committed rows before restarting.",
    "Quinn Davis",
    "Bug report",
    "in_progress",
    "normal",
    "Edmond Bassey",
    72,
  ],
  [
    "Gateway timeout aligned with worker budget",
    "The worker now returns a bounded failure before the gateway times out. A staging check returned the request ID and preserved the idempotency key on retry.",
    "Avery Scott",
    "Bug report",
    "resolved",
    "normal",
    "Maya Chen",
    96,
  ],
] as const;
const seedMetadata = [
  [
    "webhook",
    "Delivery gateway",
    "production",
    "partial degradation",
    "req_6a41",
  ],
  ["import", "Import pipeline", "production", "single account", "req_6a42"],
  ["identity", "Identity API", "production", "single account", "req_6a43"],
  ["latency", "Reporting API", "production", "partial degradation", "req_6a44"],
  ["webhook", "Delivery gateway", "staging", "partial degradation", "req_6a45"],
  ["import", "Import pipeline", "staging", "single account", "req_6a46"],
  [
    "webhook",
    "Delivery gateway",
    "production",
    "partial degradation",
    "req_6a47",
  ],
  ["identity", "Identity API", "staging", "single account", "req_6a48"],
  ["import", "Import pipeline", "production", "single account", "req_6a49"],
  ["latency", "Reporting API", "staging", "single account", "req_6a4a"],
] as const;
export async function createWorkspace(db: Database, now = Date.now()) {
  const id = crypto.randomUUID(),
    statements = [
      db
        .prepare("INSERT INTO workspaces (id,created_at) VALUES (?,?)")
        .bind(id, at(now, 0)),
    ];
  fixtures.forEach((f, index) => {
    const [subject, body, name, category, status, priority, owner, hours] = f,
      tid = crypto.randomUUID(),
      created = at(now, hours),
      updated = at(now, Math.min(hours, index * 0.4));
    statements.push(
      db
        .prepare(
          "INSERT INTO tickets (id,workspace_id,number,subject,body,requester_name,requester_email,category,status,priority,owner,created_at,updated_at,due_at,resolved_at,version,last_operation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          tid,
          id,
          1041 + index,
          subject,
          body,
          name,
          name.toLowerCase().replaceAll(" ", ".") + "@example.com",
          category,
          status,
          priority,
          owner,
          created,
          updated,
          at(
            now,
            hours - (priority === "urgent" ? 2 : priority === "high" ? 24 : 72),
          ),
          status === "resolved" ? updated : null,
          1,
          "seed",
        ),
    );
    statements.push(
      db
        .prepare(
          "INSERT INTO ticket_events (id,workspace_id,ticket_id,kind,message,created_at) VALUES (?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          id,
          tid,
          "created",
          "Ticket received from " + name + ".",
          created,
        ),
    );
    if (status !== "open")
      statements.push(
        db
          .prepare(
            "INSERT INTO ticket_events (id,workspace_id,ticket_id,kind,message,created_at) VALUES (?,?,?,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            id,
            tid,
            "updated",
            "Moved to " + LABELS[status] + " and assigned to " + owner + ".",
            updated,
          ),
      );
    const [kind, service, environment, impact, requestId] = seedMetadata[index];
    statements.push(
      db
        .prepare(
          "UPDATE tickets SET incident_kind=?,service=?,environment=?,impact=?,request_id=? WHERE id=? AND workspace_id=?",
        )
        .bind(kind, service, environment, impact, requestId, tid, id),
    );
  });
  await db.batch(statements);
  return id;
}
export async function workspaceExists(db: Database, id: string) {
  return !!(await db
    .prepare("SELECT id FROM workspaces WHERE id=?")
    .bind(id)
    .first());
}
export async function listTickets(db: Database, workspace: string) {
  return (
    await db
      .prepare(
        "SELECT * FROM tickets WHERE workspace_id=? ORDER BY updated_at DESC,number DESC LIMIT 100",
      )
      .bind(workspace)
      .all<Ticket>()
  ).results;
}
export async function getTicket(db: Database, workspace: string, id: string) {
  const ticket = await db
    .prepare("SELECT * FROM tickets WHERE workspace_id=? AND id=?")
    .bind(workspace, id)
    .first<Ticket>();
  if (!ticket) throw new AppError(404, "Ticket not found.");
  return ticket;
}
export async function listEvents(
  db: Database,
  workspace: string,
  ticketId?: string,
) {
  return (
    await db
      .prepare(
        ticketId
          ? "SELECT * FROM ticket_events WHERE workspace_id=? AND ticket_id=? ORDER BY created_at ASC,id ASC"
          : "SELECT e.*,t.subject,t.number FROM ticket_events e JOIN tickets t ON t.id=e.ticket_id WHERE e.workspace_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 100",
      )
      .bind(...(ticketId ? [workspace, ticketId] : [workspace]))
      .all<TicketEvent>()
  ).results;
}
export async function addTicket(
  db: Database,
  workspace: string,
  value: unknown,
  now = Date.now(),
) {
  const input = validateTicket(value),
    id = crypto.randomUUID(),
    stamp = at(now, 0);
  const results = await db.batch([
    db
      .prepare(
        "INSERT INTO tickets (id,workspace_id,number,subject,body,requester_name,requester_email,category,status,priority,owner,created_at,updated_at,due_at,resolved_at,version,last_operation,incident_kind,service,environment,impact,request_id) SELECT ?,?,COALESCE(MAX(number),1040)+1,?,?,?,?,?,'open',?,'Unassigned',?,?,?,NULL,1,?,?,?,?,?,? FROM tickets WHERE workspace_id=? HAVING COUNT(*) < 100",
      )
      .bind(
        id,
        workspace,
        input.subject,
        input.body,
        input.requester_name,
        input.requester_email,
        input.category,
        input.priority,
        stamp,
        stamp,
        at(
          now,
          -(input.priority === "urgent"
            ? 2
            : input.priority === "high"
              ? 24
              : 72),
        ),
        id,
        input.incident_kind,
        input.service,
        input.environment,
        input.impact,
        input.request_id,
        workspace,
      ),
    db
      .prepare(
        "INSERT INTO ticket_events (id,workspace_id,ticket_id,kind,message,created_at) SELECT ?,?,?,'created',?,? WHERE EXISTS (SELECT 1 FROM tickets WHERE id=? AND workspace_id=?)",
      )
      .bind(
        crypto.randomUUID(),
        workspace,
        id,
        "Ticket received from " + input.requester_name + ".",
        stamp,
        id,
        workspace,
      ),
  ]);
  if (!results[0].meta?.changes)
    throw new AppError(
      422,
      "This demo workspace has reached its limit of 100 tickets.",
    );
  return getTicket(db, workspace, id);
}
export async function updateTicket(
  db: Database,
  workspace: string,
  id: string,
  value: unknown,
  now = Date.now(),
) {
  const current = await getTicket(db, workspace, id),
    input = validateUpdate(value, current);
  if (current.version !== input.version)
    throw new AppError(
      409,
      "This ticket changed in another tab. Refresh it and try again.",
    );
  const changes: string[] = [];
  if (input.status !== current.status)
    changes.push(
      "Status: " + LABELS[current.status] + " → " + LABELS[input.status],
    );
  if (input.priority !== current.priority)
    changes.push("Priority: " + current.priority + " → " + input.priority);
  if (input.owner !== current.owner) changes.push("Assigned to " + input.owner);
  if (!changes.length) return current;
  const operation = crypto.randomUUID(),
    stamp = at(now, 0),
    resolved =
      input.status === "resolved" ? (current.resolved_at ?? stamp) : null;
  const results = await db.batch([
    db
      .prepare(
        "UPDATE tickets SET status=?,priority=?,owner=?,updated_at=?,resolved_at=?,version=version+1,last_operation=? WHERE workspace_id=? AND id=? AND version=?",
      )
      .bind(
        input.status,
        input.priority,
        input.owner,
        stamp,
        resolved,
        operation,
        workspace,
        id,
        input.version,
      ),
    db
      .prepare(
        "INSERT INTO ticket_events (id,workspace_id,ticket_id,kind,message,created_at) SELECT ?,?,?,'updated',?,? WHERE EXISTS (SELECT 1 FROM tickets WHERE id=? AND workspace_id=? AND last_operation=?)",
      )
      .bind(
        crypto.randomUUID(),
        workspace,
        id,
        changes.join(" · "),
        stamp,
        id,
        workspace,
        operation,
      ),
  ]);
  if (!results[0].meta?.changes)
    throw new AppError(
      409,
      "This ticket changed in another tab. Refresh it and try again.",
    );
  return getTicket(db, workspace, id);
}
export async function addNote(
  db: Database,
  workspace: string,
  id: string,
  value: unknown,
  now = Date.now(),
) {
  const message = validateNote(value);
  await getTicket(db, workspace, id);
  await db.batch([
    db
      .prepare(
        "INSERT INTO ticket_events (id,workspace_id,ticket_id,kind,message,created_at) VALUES (?,?,?,'note',?,?)",
      )
      .bind(crypto.randomUUID(), workspace, id, message, at(now, 0)),
  ]);
  return listEvents(db, workspace, id);
}
