import test from "node:test";
import assert from "node:assert/strict";
import { database } from "./support/database.ts";
import {
  createWorkspace,
  listTickets,
  addTicket,
  getTicket,
  listEvents,
} from "../lib/service.ts";
import { setCheck, listChecks } from "../lib/checks.ts";
import { AppError, validateTicket } from "../lib/domain.ts";
import { incidentFields, handoffMarkdown, RUNBOOKS } from "../lib/incidents.ts";
import type { Database } from "../lib/service.ts";
const input = {
  subject: "Receiver rejects retries",
  body: "The receiver rejects the retry after a signing timestamp expires.",
  requester_name: "Demo operator",
  requester_email: "operator@example.com",
  category: "Bug report",
  priority: "high",
};
const status = (n: number) => (e: unknown) =>
  e instanceof AppError && e.status === n;
test("legacy creation inputs receive incident metadata defaults", () => {
  const fields = validateTicket(input);
  assert.equal(fields.incident_kind, "webhook");
  assert.equal(fields.environment, "production");
  assert.equal(fields.request_id, "");
});
test("incident fields reject unknown values and multiline request IDs", () => {
  for (const patch of [
    { incident_kind: "other" },
    { service: "unknown" },
    { environment: "live" },
    { impact: "huge" },
    { request_id: "one\ntwo" },
    { request_id: 23 },
  ])
    assert.throws(() => incidentFields(patch), status(400));
});
test("new incident metadata is stored with the case", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const ws = await createWorkspace(db),
    ticket = await addTicket(db, ws, {
      ...input,
      incident_kind: "identity",
      service: "Identity API",
      environment: "staging",
      impact: "partial degradation",
      request_id: "req_test",
    });
  assert.equal(ticket.incident_kind, "identity");
  assert.equal(ticket.service, "Identity API");
  assert.equal(ticket.environment, "staging");
  assert.equal(ticket.request_id, "req_test");
});
test("checks persist, reopen, and add history only for a change", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const ws = await createWorkspace(db),
    ticket = await addTicket(db, ws, input);
  const before = (await listEvents(db, ws, ticket.id)).length;
  await setCheck(db, ws, ticket.id, "response", { checked: true });
  await setCheck(db, ws, ticket.id, "response", { checked: true });
  assert.equal((await listChecks(db, ws, ticket.id))[0].checked, 1);
  assert.equal((await listEvents(db, ws, ticket.id)).length, before + 1);
  await setCheck(db, ws, ticket.id, "response", { checked: false });
  assert.equal((await listChecks(db, ws, ticket.id))[0].checked, 0);
  assert.equal((await listEvents(db, ws, ticket.id)).length, before + 2);
});
test("a check must belong to the incident runbook and use a boolean", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const ws = await createWorkspace(db),
    ticket = await addTicket(db, ws, input);
  await assert.rejects(
    setCheck(db, ws, ticket.id, "schema", { checked: true }),
    status(400),
  );
  await assert.rejects(
    setCheck(db, ws, ticket.id, "response", { checked: 1 }),
    status(400),
  );
});
test("another workspace cannot change an investigation step", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const a = await createWorkspace(db),
    b = await createWorkspace(db),
    ticket = (await listTickets(db, a))[0];
  await assert.rejects(
    setCheck(db, b, ticket.id, RUNBOOKS[ticket.incident_kind][0].id, {
      checked: true,
    }),
    status(404),
  );
  assert.deepEqual(await listChecks(db, b, ticket.id), []);
});
test("check state rolls back if its history insert fails", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const ws = await createWorkspace(db),
    ticket = await addTicket(db, ws, input);
  const failing: Database = {
    prepare: (q) => db.prepare(q),
    batch: (statements) =>
      db.batch([
        statements[0],
        db.prepare("INSERT INTO missing_table VALUES (1)"),
      ]),
  };
  await assert.rejects(
    setCheck(failing, ws, ticket.id, "response", { checked: true }),
  );
  assert.deepEqual(await listChecks(db, ws, ticket.id), []);
});
test("handoff uses stored evidence, real check state and event history", async (t) => {
  const { db, raw } = database();
  t.after(() => raw.close());
  const ws = await createWorkspace(db),
    ticket = await addTicket(db, ws, { ...input, request_id: "req_handoff" });
  await setCheck(db, ws, ticket.id, "response", { checked: true });
  const text = handoffMarkdown(
    await getTicket(db, ws, ticket.id),
    await listEvents(db, ws, ticket.id),
    await listChecks(db, ws, ticket.id),
  );
  assert.ok(text.includes("Request ID: req_handoff"));
  assert.ok(text.includes("- [x] Capture the failed response"));
  assert.ok(text.includes("- [ ] Verify the event signature"));
  assert.ok(text.includes("> " + input.body));
  assert.ok(text.includes("Completed: Capture the failed response"));
  assert.ok(!text.includes(ws));
});
