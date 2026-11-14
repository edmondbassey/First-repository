import { AppError } from "./domain.ts";
import { RUNBOOKS } from "./incidents.ts";
import type { CheckState, IncidentFields } from "./incidents.ts";
import { getTicket } from "./service.ts";
import type { Database } from "./service.ts";
export async function listChecks(
  db: Database,
  workspace: string,
  ticketId: string,
) {
  return (
    await db
      .prepare(
        "SELECT check_key,checked,updated_at FROM incident_checks WHERE workspace_id=? AND ticket_id=? ORDER BY check_key",
      )
      .bind(workspace, ticketId)
      .all<CheckState>()
  ).results;
}
export async function setCheck(
  db: Database,
  workspace: string,
  ticketId: string,
  key: string,
  value: unknown,
  now = Date.now(),
) {
  const ticket = await getTicket(db, workspace, ticketId);
  const rows =
    RUNBOOKS[(ticket as typeof ticket & IncidentFields).incident_kind] ??
    RUNBOOKS.webhook;
  const check = rows.find((c) => c.id === key);
  if (!check)
    throw new AppError(
      400,
      "This investigation step does not belong to the case's runbook.",
    );
  if (
    !value ||
    typeof value !== "object" ||
    !("checked" in value) ||
    typeof value.checked !== "boolean"
  )
    throw new AppError(400, "Send a checked value of true or false.");
  const checked = value.checked ? 1 : 0,
    existing = await db
      .prepare(
        "SELECT checked FROM incident_checks WHERE workspace_id=? AND ticket_id=? AND check_key=?",
      )
      .bind(workspace, ticketId, key)
      .first<{ checked: number }>();
  if ((existing?.checked ?? 0) === checked)
    return listChecks(db, workspace, ticketId);
  const operation = crypto.randomUUID(),
    stamp = new Date(now).toISOString();
  await db.batch([
    db
      .prepare(
        "INSERT INTO incident_checks (id,workspace_id,ticket_id,check_key,checked,updated_at,last_operation) VALUES (?,?,?,?,?,?,?) ON CONFLICT(ticket_id,check_key) DO UPDATE SET checked=excluded.checked,updated_at=excluded.updated_at,last_operation=excluded.last_operation WHERE incident_checks.checked<>excluded.checked",
      )
      .bind(
        crypto.randomUUID(),
        workspace,
        ticketId,
        key,
        checked,
        stamp,
        operation,
      ),
    db
      .prepare(
        "INSERT INTO ticket_events (id,workspace_id,ticket_id,kind,message,created_at) SELECT ?,?,?,'investigation',?,? WHERE EXISTS (SELECT 1 FROM incident_checks WHERE ticket_id=? AND check_key=? AND last_operation=?)",
      )
      .bind(
        crypto.randomUUID(),
        workspace,
        ticketId,
        (checked ? "Completed: " : "Reopened: ") + check.label,
        stamp,
        ticketId,
        key,
        operation,
      ),
  ]);
  return listChecks(db, workspace, ticketId);
}
