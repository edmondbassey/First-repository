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
