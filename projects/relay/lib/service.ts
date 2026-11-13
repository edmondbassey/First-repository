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
const fixtures: [
  string,
  string,
  string,
  string,
  Status,
  Priority,
  string,
  number,
][] = [
  [
    "Export gets stuck at 80%",
    "The monthly report export stops at 80% and never finishes. I have tried two browsers. Could you help me get this report?",
    "Nora Williams",
    "Bug report",
    "open",
    "urgent",
    "Edmond Bassey",
    3,
  ],
  [
    "Unable to invite a teammate",
    "The invitation link shows an expired message immediately after I send it. We need to add a colleague to the workspace.",
    "Alex Morgan",
    "Account access",
    "in_progress",
    "high",
    "Maya Chen",
    7,
  ],
  [
    "A second charge on my invoice",
    "My latest invoice includes the same workspace twice. Could you check the two line items before the next payment?",
    "Jamie Brooks",
    "Billing",
    "open",
    "high",
    "Unassigned",
    12,
  ],
  [
    "Where can I find last month's report?",
    "I can see the current report but cannot find last month's report in the dashboard. Am I missing a filter?",
    "Riley Patel",
    "Feature request",
    "pending",
    "normal",
    "Ellis Park",
    20,
  ],
  [
    "Webhook events arrive out of order",
    "Our integration received an updated event before the created event. Could you confirm whether ordering is guaranteed?",
    "Taylor Adams",
    "Bug report",
    "in_progress",
    "normal",
    "Edmond Bassey",
    26,
  ],
  [
    "Update the billing contact",
    "We have a new accounts team. Please let me know how to change the email address used for invoice notifications.",
    "Robin Lee",
    "Billing",
    "resolved",
    "low",
    "Maya Chen",
    30,
  ],
  [
    "Add a dark appearance option",
    "Our team uses the dashboard late at night. A dark appearance option would make reviewing tickets more comfortable.",
    "Casey Walker",
    "Feature request",
    "open",
    "low",
    "Unassigned",
    48,
  ],
  [
    "Password reset link is not arriving",
    "I requested a password reset twice this morning and checked the spam folder, but no email has arrived yet.",
    "Drew Miller",
    "Account access",
    "pending",
    "high",
    "Ellis Park",
    54,
  ],
  [
    "Search misses archived records",
    "Searching by the reference number does not find archived records. I can still open them using an old bookmarked link.",
    "Quinn Davis",
    "Bug report",
    "in_progress",
    "normal",
    "Edmond Bassey",
    72,
  ],
  [
    "Help connecting our workspace",
    "We followed the integration guide and connected our test workspace. Everything is now working. Thanks for the clear instructions.",
    "Avery Scott",
    "Account access",
    "resolved",
    "normal",
    "Maya Chen",
    96,
  ],
];
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
        "INSERT INTO tickets (id,workspace_id,number,subject,body,requester_name,requester_email,category,status,priority,owner,created_at,updated_at,due_at,resolved_at,version,last_operation) SELECT ?,?,COALESCE(MAX(number),1040)+1,?,?,?,?,?,'open',?,'Unassigned',?,?,?,NULL,1,? FROM tickets WHERE workspace_id=? HAVING COUNT(*) < 100",
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
