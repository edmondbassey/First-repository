import { AppError } from "./errors.ts";
import { incidentFields } from "./incidents.ts";
export const STATUSES = ["open", "in_progress", "pending", "resolved"] as const;
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const CATEGORIES = [
  "Account access",
  "Billing",
  "Bug report",
  "Feature request",
] as const;
export const OWNERS = [
  "Unassigned",
  "Edmond Bassey",
  "Maya Chen",
  "Ellis Park",
] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];
export const LABELS: Record<Status, string> = {
  open: "Open",
  in_progress: "In progress",
  pending: "Waiting on evidence",
  resolved: "Resolved",
};
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  open: ["in_progress", "pending", "resolved"],
  in_progress: ["open", "pending", "resolved"],
  pending: ["open", "in_progress", "resolved"],
  resolved: ["open"],
};
export { AppError } from "./errors.ts";
export type Ticket = {
  id: string;
  workspace_id: string;
  number: number;
  subject: string;
  body: string;
  requester_name: string;
  requester_email: string;
  category: string;
  status: Status;
  priority: Priority;
  owner: string;
  created_at: string;
  updated_at: string;
  due_at: string;
  resolved_at: string | null;
  version: number;
  last_operation: string;
  incident_kind: import("./incidents.ts").IncidentKind;
  service: string;
  environment: string;
  impact: string;
  request_id: string;
};
export type TicketEvent = {
  id: string;
  ticket_id: string;
  kind: string;
  message: string;
  created_at: string;
  subject?: string;
  number?: number;
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError(400, "Send a JSON object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, min: number, max: number) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    throw new AppError(
      400,
      label + " must contain " + min + "–" + max + " characters.",
    );
  return value.trim();
}
function choice<T extends string>(
  value: unknown,
  options: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !options.includes(value as T))
    throw new AppError(400, "Choose a valid " + label + ".");
  return value as T;
}
export function validateTicket(value: unknown) {
  const d = object(value),
    email = text(d.requester_email, "Email", 3, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AppError(400, "Enter a valid email address.");
  return {
    ...incidentFields(d),
    subject: text(d.subject, "Subject", 3, 140),
    body: text(d.body, "Description", 10, 5000),
    requester_name: text(d.requester_name, "Customer name", 2, 80),
    requester_email: email,
    category: choice(d.category, CATEGORIES, "category"),
    priority: choice(d.priority, PRIORITIES, "priority"),
  };
}
export function validateUpdate(value: unknown, current: Ticket) {
  const d = object(value);
  if (!Number.isInteger(d.version) || (d.version as number) < 1)
    throw new AppError(400, "Include the current ticket version.");
  const status = choice(d.status, STATUSES, "status");
  if (
    status !== current.status &&
    !TRANSITIONS[current.status].includes(status)
  )
    throw new AppError(
      422,
      "Reopen this ticket before moving it to another status.",
    );
  return {
    version: d.version as number,
    status,
    priority: choice(d.priority, PRIORITIES, "priority"),
    owner: choice(d.owner, OWNERS, "owner"),
  };
}
export function validateNote(value: unknown) {
  return text(object(value).message, "Note", 1, 3000);
}
export function attention(t: Ticket, now = Date.now()) {
  return (
    t.status !== "resolved" &&
    (t.priority === "urgent" || Date.parse(t.due_at) < now)
  );
}
export function summarize(tickets: Ticket[], now = Date.now()) {
  const resolved = tickets.filter((t) => t.status === "resolved"),
    hours = resolved
      .filter((t) => t.resolved_at)
      .map(
        (t) =>
          (Date.parse(t.resolved_at!) - Date.parse(t.created_at)) / 3600000,
      );
  return {
    active: tickets.length - resolved.length,
    attention: tickets.filter((t) => attention(t, now)).length,
    resolved: resolved.length,
    averageHours: hours.length
      ? hours.reduce((a, b) => a + b, 0) / hours.length
      : null,
  };
}
export function safeCsv(rows: unknown[][]) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let cell = String(value ?? "");
          if (/^[\s]*[=+\-@]/.test(cell) || /^[\t\r]/.test(cell))
            cell = "'" + cell;
          return '"' + cell.replaceAll('"', '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
}
