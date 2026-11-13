import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import {
  createWorkspace,
  listTickets,
  getTicket,
  addTicket,
  updateTicket,
  addNote,
  listEvents,
} from "../lib/service.ts";
import type { Database, Statement, SqlResult } from "../lib/service.ts";
import {
  AppError,
  validateTicket,
  summarize,
  safeCsv,
  attention,
} from "../lib/domain.ts";
import { protectWrite, sessionId, readJson } from "../lib/request.ts";
class Prepared implements Statement {
  db: DatabaseSync;
  sql: string;
  values: SQLInputValue[];
  constructor(db: DatabaseSync, sql: string, values: SQLInputValue[] = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }
  bind(...values: unknown[]) {
    return new Prepared(this.db, this.sql, values as SQLInputValue[]);
  }
  async all<T>() {
    return { results: this.db.prepare(this.sql).all(...this.values) as T[] };
  }
  async first<T>() {
    return (this.db.prepare(this.sql).get(...this.values) as T) ?? null;
  }
  execute() {
    const result = this.db.prepare(this.sql).run(...this.values);
    return { results: [], meta: { changes: Number(result.changes) } };
  }
}
function database() {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    raw.exec(
      readFileSync(new URL("../drizzle/" + file, import.meta.url), "utf8"),
    );
  const db: Database = {
    prepare: (sql) => new Prepared(raw, sql),
    async batch(statements) {
      raw.exec("BEGIN");
      try {
        const results = statements.map((s) => (s as Prepared).execute());
        raw.exec("COMMIT");
        return results;
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { db, raw };
}
const input = {
  subject: "Unable to open dashboard",
  body: "The dashboard displays a blank page after I sign in.",
  requester_name: "Morgan Ellis",
  requester_email: "morgan@example.com",
  category: "Bug report",
  priority: "high",
};
const isStatus = (status: number) => (e: unknown) =>
  e instanceof AppError && e.status === status;
test("workspaces start with separate, fictional records", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const a = await createWorkspace(db),
    b = await createWorkspace(db),
    rowsA = await listTickets(db, a),
    rowsB = await listTickets(db, b);
  assert.equal(rowsA.length, 10);
  assert.equal(rowsB.length, 10);
  assert.ok(rowsA.every((x) => !rowsB.some((y) => y.id === x.id)));
  assert.ok(rowsA.every((x) => x.requester_email.endsWith("@example.com")));
});
test("another workspace cannot read or update a ticket or add a note", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const a = await createWorkspace(db),
    b = await createWorkspace(db),
    ticket = (await listTickets(db, a))[0];
  await assert.rejects(getTicket(db, b, ticket.id), isStatus(404));
  await assert.rejects(
    updateTicket(db, b, ticket.id, { ...ticket, status: "resolved" }),
    isStatus(404),
  );
  await assert.rejects(
    addNote(db, b, ticket.id, { message: "private" }),
    isStatus(404),
  );
  assert.deepEqual(await listEvents(db, b, ticket.id), []);
});
test("ticket creation persists fields and a corresponding audit event", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const ws = await createWorkspace(db),
    ticket = await addTicket(db, ws, input);
  assert.equal(ticket.subject, input.subject);
  assert.equal(ticket.number, 1051);
  assert.equal(ticket.status, "open");
  assert.equal(ticket.owner, "Unassigned");
  assert.equal((await listEvents(db, ws, ticket.id)).length, 1);
  assert.equal((await listTickets(db, ws)).length, 11);
});
test("SQL-like input is treated as text", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const ws = await createWorkspace(db),
    subject = "Invoice'; DROP TABLE tickets; --";
  assert.equal(
    (await addTicket(db, ws, { ...input, subject })).subject,
    subject,
  );
  assert.equal((await listTickets(db, ws)).length, 11);
});
test("invalid fields fail before persistence", () => {
  for (const bad of [
    null,
    [],
    { ...input, subject: " " },
    { ...input, body: "short" },
    { ...input, priority: "critical" },
    { ...input, category: "Other" },
    { ...input, requester_email: "not-email" },
    { ...input, subject: "a".repeat(141) },
  ])
    assert.throws(() => validateTicket(bad), isStatus(400));
});
test("resolving records its time, increments version and writes one audit event", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const ws = await createWorkspace(db),
    ticket = await addTicket(db, ws, input, 100000000),
    updated = await updateTicket(
      db,
      ws,
      ticket.id,
      { ...ticket, status: "resolved" },
      104000000,
    );
  assert.equal(updated.version, 2);
  assert.equal(updated.resolved_at, new Date(104000000).toISOString());
  assert.equal((await listEvents(db, ws, ticket.id)).length, 2);
});
test("resolved tickets must be reopened before moving to another active state", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const ws = await createWorkspace(db),
    ticket = await addTicket(db, ws, input);
  const done = await updateTicket(db, ws, ticket.id, {
    ...ticket,
    status: "resolved",
  });
  await assert.rejects(
    updateTicket(db, ws, ticket.id, { ...done, status: "pending" }),
    isStatus(422),
  );
  const reopened = await updateTicket(db, ws, ticket.id, {
    ...done,
    status: "open",
  });
  assert.equal(reopened.resolved_at, null);
});
test("stale versions fail without creating a misleading audit event", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const ws = await createWorkspace(db),
    ticket = await addTicket(db, ws, input);
  await updateTicket(db, ws, ticket.id, { ...ticket, owner: "Edmond Bassey" });
  const before = (await listEvents(db, ws, ticket.id)).length;
  await assert.rejects(
    updateTicket(db, ws, ticket.id, { ...ticket, status: "resolved" }),
    isStatus(409),
  );
  assert.equal((await listEvents(db, ws, ticket.id)).length, before);
});
test("an update racing after the initial read cannot overwrite or add an audit event", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const ws = await createWorkspace(db),
    ticket = await addTicket(db, ws, input);
  const racing: Database = {
    prepare: (sql) => db.prepare(sql),
    async batch(statements) {
      raw
        .prepare(
          "UPDATE tickets SET version=version+1,last_operation='other' WHERE id=?",
        )
        .run(ticket.id);
      return db.batch(statements);
    },
  };
  await assert.rejects(
    updateTicket(racing, ws, ticket.id, { ...ticket, status: "resolved" }),
    isStatus(409),
  );
  assert.equal((await getTicket(db, ws, ticket.id)).status, "open");
  assert.equal((await listEvents(db, ws, ticket.id)).length, 1);
});
test("a no-op update does not add history or increment the version", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const ws = await createWorkspace(db),
    ticket = await addTicket(db, ws, input),
    updated = await updateTicket(db, ws, ticket.id, ticket);
  assert.equal(updated.version, ticket.version);
  assert.equal((await listEvents(db, ws, ticket.id)).length, 1);
});
test("notes preserve text and reject empty or oversized messages", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const ws = await createWorkspace(db),
    ticket = await addTicket(db, ws, input);
  const text = "<script>alert('text')</script>";
  const events = await addNote(db, ws, ticket.id, { message: text });
  assert.equal(events.find((e) => e.kind === "note")?.message, text);
  for (const message of [" ", "a".repeat(3001)])
    await assert.rejects(
      addNote(db, ws, ticket.id, { message }),
      isStatus(400),
    );
});
test("the workspace cap rejects the 101st ticket without an orphan event", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const ws = await createWorkspace(db);
  for (let i = 0; i < 90; i++) await addTicket(db, ws, input);
  const before = raw.prepare("SELECT count(*) AS n FROM ticket_events").get()!
    .n;
  await assert.rejects(addTicket(db, ws, input), isStatus(422));
  assert.equal((await listTickets(db, ws)).length, 100);
  assert.equal(
    raw.prepare("SELECT count(*) AS n FROM ticket_events").get()!.n,
    before,
  );
});
test("a failed batch rolls back all preceding statements", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  await assert.rejects(
    db.batch([
      db
        .prepare("INSERT INTO workspaces(id,created_at) VALUES (?,?)")
        .bind("test", "now"),
      db.prepare("INSERT INTO missing_table VALUES (1)"),
    ]),
  );
  assert.equal(raw.prepare("SELECT count(*) AS n FROM workspaces").get()!.n, 0);
});
test("summary uses stored records and handles an empty workspace", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const ws = await createWorkspace(db),
    rows = await listTickets(db, ws);
  assert.equal(summarize(rows).active, 8);
  assert.equal(summarize(rows).resolved, 2);
  assert.equal(summarize([]).averageHours, null);
  const done = rows.find((t) => t.status === "resolved")!;
  assert.equal(
    attention({ ...done, priority: "urgent", due_at: "2000-01-01T00:00:00Z" }),
    false,
  );
});
test("CSV export quotes values and neutralizes spreadsheet formulas", () => {
  assert.equal(
    safeCsv([["=SUM(1,2)", " plain", 'a"b', "a\nb", null]]),
    '"\'=SUM(1,2)"," plain","a""b","a\nb",""',
  );
  assert.match(safeCsv([[" @bad"]]), /^"'/);
});
test("session parsing requires an exact UUID cookie", () => {
  const id = crypto.randomUUID();
  assert.equal(
    sessionId(
      new Request("https://relay.test", {
        headers: { cookie: "other=1; relay_session=" + id },
      }),
    ),
    id,
  );
  assert.equal(
    sessionId(
      new Request("https://relay.test", {
        headers: { cookie: "relay_session=../../bad" },
      }),
    ),
    null,
  );
});
test("cross-origin browser writes are rejected", () => {
  assert.throws(
    () =>
      protectWrite(
        new Request("https://relay.test", {
          headers: { origin: "https://other.test" },
        }),
      ),
    isStatus(403),
  );
  assert.throws(
    () =>
      protectWrite(
        new Request("https://relay.test", {
          headers: { "sec-fetch-site": "cross-site" },
        }),
      ),
    isStatus(403),
  );
  assert.doesNotThrow(() =>
    protectWrite(
      new Request("https://relay.test", {
        headers: { origin: "https://relay.test" },
      }),
    ),
  );
});
test("JSON requests reject malformed, oversized and incorrect media-type bodies", async () => {
  const make = (body: string, type = "application/json") =>
    new Request("https://relay.test", {
      method: "POST",
      body,
      headers: { "content-type": type },
    });
  assert.deepEqual(await readJson(make('{"message":"✓"}')), { message: "✓" });
  await assert.rejects(readJson(make("{")), isStatus(400));
  await assert.rejects(readJson(make("{}", "text/plain")), isStatus(415));
  await assert.rejects(
    readJson(make('"' + "a".repeat(16001) + '"')),
    isStatus(413),
  );
});
