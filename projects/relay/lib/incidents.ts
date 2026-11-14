import { AppError } from "./errors.ts";
import type { Ticket, TicketEvent } from "./domain.ts";
export const INCIDENT_KINDS = [
  "webhook",
  "import",
  "identity",
  "latency",
] as const;
export const SERVICES = [
  "Delivery gateway",
  "Import pipeline",
  "Identity API",
  "Reporting API",
] as const;
export const ENVIRONMENTS = ["production", "staging"] as const;
export const IMPACTS = [
  "single account",
  "partial degradation",
  "service interruption",
] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];
export type InvestigationCheck = { id: string; label: string; why: string };
export const KIND_LABELS: Record<IncidentKind, string> = {
  webhook: "Webhook delivery",
  import: "Data import",
  identity: "Identity & access",
  latency: "API latency",
};
export const RUNBOOKS: Record<IncidentKind, InvestigationCheck[]> = {
  webhook: [
    {
      id: "response",
      label: "Capture the failed response",
      why: "Record the HTTP status, response body and delivery ID.",
    },
    {
      id: "signature",
      label: "Verify the event signature",
      why: "Compare the signing method and timestamp tolerance with the receiver.",
    },
    {
      id: "idempotency",
      label: "Check duplicate handling",
      why: "Confirm retries use the same event ID and are safe to receive again.",
    },
    {
      id: "staging",
      label: "Reproduce against staging",
      why: "Validate the fix with a controlled delivery before closing the case.",
    },
  ],
  import: [
    {
      id: "sample",
      label: "Preserve a failing row",
      why: "Keep an example with its source line and validation response.",
    },
    {
      id: "schema",
      label: "Compare the expected schema",
      why: "Check required fields, date formats and encoding.",
    },
    {
      id: "boundary",
      label: "Check partial-write behaviour",
      why: "Establish which records committed before the failure.",
    },
    {
      id: "staging",
      label: "Verify a corrected import",
      why: "Run a small corrected sample in staging and record its outcome.",
    },
  ],
  identity: [
    {
      id: "request",
      label: "Capture the rejected request",
      why: "Keep the request ID and response; do not record access tokens.",
    },
    {
      id: "scope",
      label: "Compare scopes and audience",
      why: "Check the access the integration expects against the rejected request.",
    },
    {
      id: "expiry",
      label: "Check clock and expiry",
      why: "Compare token lifetime and clock skew without exposing credentials.",
    },
    {
      id: "staging",
      label: "Verify access in staging",
      why: "Confirm the intended role can complete the same action.",
    },
  ],
  latency: [
    {
      id: "window",
      label: "Define the slow time window",
      why: "Identify the affected endpoint and a representative request ID.",
    },
    {
      id: "dependency",
      label: "Locate the slow dependency",
      why: "Follow timing evidence across the request's service events.",
    },
    {
      id: "timeout",
      label: "Compare timeout budgets",
      why: "Check whether upstream and downstream timeouts are aligned.",
    },
    {
      id: "staging",
      label: "Measure the corrected path",
      why: "Record the before/after sample and its limits before resolving.",
    },
  ],
};
export type IncidentFields = {
  incident_kind: IncidentKind;
  service: string;
  environment: string;
  impact: string;
  request_id: string;
};
function option<T extends string>(
  value: unknown,
  options: readonly T[],
  fallback: T,
  label: string,
): T {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !options.includes(value as T))
    throw new AppError(400, "Choose a valid " + label + ".");
  return value as T;
}
export function incidentFields(value: unknown): IncidentFields {
  const d = value as Record<string, unknown>;
  const request = d.request_id ?? "";
  if (
    typeof request !== "string" ||
    request.length > 120 ||
    /[\r\n\x00]/.test(request)
  )
    throw new AppError(
      400,
      "Request ID must be a single line of up to 120 characters.",
    );
  return {
    incident_kind: option(
      d.incident_kind,
      INCIDENT_KINDS,
      "webhook",
      "incident type",
    ),
    service: option(d.service, SERVICES, "Delivery gateway", "service"),
    environment: option(
      d.environment,
      ENVIRONMENTS,
      "production",
      "environment",
    ),
    impact: option(d.impact, IMPACTS, "single account", "impact"),
    request_id: request.trim(),
  };
}
export type CheckState = {
  check_key: string;
  checked: number;
  updated_at: string;
};
export function handoffMarkdown(
  ticket: Ticket & IncidentFields,
  events: TicketEvent[],
  checks: CheckState[],
) {
  const quote = (value: string) =>
    value
      .split(/\r?\n/)
      .map((line) => "> " + line)
      .join("\n");
  const rows = RUNBOOKS[ticket.incident_kind] ?? RUNBOOKS.webhook;
  return (
    "# RLY-" +
    ticket.number +
    " — " +
    ticket.subject.replaceAll("\n", " ") +
    "\n\n" +
    [
      "Service: " + ticket.service,
      "Environment: " + ticket.environment,
      "Impact: " + ticket.impact,
      "Status: " + ticket.status,
      "Priority: " + ticket.priority,
      "Owner: " + ticket.owner,
      "Request ID: " + (ticket.request_id || "Not recorded"),
    ].join("\n\n") +
    "\n\n## Evidence\n\n" +
    quote(ticket.body) +
    "\n\n## Investigation\n\n" +
    rows
      .map(
        (check) =>
          "- [" +
          (checks.some((c) => c.check_key === check.id && c.checked)
            ? "x"
            : " ") +
          "] " +
          check.label,
      )
      .join("\n") +
    "\n\n## Case history\n\n" +
    events
      .map(
        (e) =>
          "### " + e.created_at + " · " + e.kind + "\n\n" + quote(e.message),
      )
      .join("\n\n") +
    "\n"
  );
}
