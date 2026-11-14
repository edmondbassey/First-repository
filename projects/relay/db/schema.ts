import {
  integer,
  sqliteTable,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
});
export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    number: integer("number").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    requesterName: text("requester_name").notNull(),
    requesterEmail: text("requester_email").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull(),
    priority: text("priority").notNull(),
    owner: text("owner").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    dueAt: text("due_at").notNull(),
    resolvedAt: text("resolved_at"),
    version: integer("version").notNull().default(1),
    lastOperation: text("last_operation").notNull(),
    incidentKind: text("incident_kind").notNull().default("webhook"),
    service: text("service").notNull().default("Delivery gateway"),
    environment: text("environment").notNull().default("production"),
    impact: text("impact").notNull().default("single account"),
    requestId: text("request_id").notNull().default(""),
  },
  (t) => [
    uniqueIndex("tickets_workspace_number").on(t.workspaceId, t.number),
    index("tickets_workspace_updated").on(t.workspaceId, t.updatedAt),
  ],
);
export const events = sqliteTable(
  "ticket_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("events_workspace_ticket").on(t.workspaceId, t.ticketId, t.createdAt),
  ],
);

export const incidentChecks = sqliteTable(
  "incident_checks",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id),
    checkKey: text("check_key").notNull(),
    checked: integer("checked").notNull().default(0),
    updatedAt: text("updated_at").notNull(),
    lastOperation: text("last_operation").notNull(),
  },
  (t) => [
    uniqueIndex("incident_check_ticket_key").on(t.ticketId, t.checkKey),
    index("incident_checks_workspace").on(t.workspaceId, t.ticketId),
  ],
);
