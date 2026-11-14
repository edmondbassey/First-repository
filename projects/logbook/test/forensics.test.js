import test from "node:test";
import assert from "node:assert/strict";
import { parseLogs } from "../src/analyzer.js";
import {
  messagePattern,
  pathPattern,
  errorGroups,
  requestTraces,
  investigationReport,
} from "../src/forensics.js";
const records = (rows) =>
  parseLogs(rows.map((r) => JSON.stringify(r)).join("\n")).records;
test("message grouping replaces volatile IDs and large numbers", () => {
  assert.equal(
    messagePattern("Delivery evt_ab12 timed out after 1200ms"),
    "Delivery <id> timed out after 1200ms",
  );
  assert.equal(
    messagePattern("Request req_a42 failed with 502"),
    "Request <id> failed with <n>",
  );
});
test("path patterns remove query strings and numeric path IDs", () => {
  assert.equal(pathPattern("/v1/orders/123?token=hidden"), "/v1/orders/:id");
  assert.equal(pathPattern("/v1/hooks"), "/v1/hooks");
});
test("recurring errors group within a service and retain every event", () => {
  const data = records([
    {
      level: "error",
      service: "gateway",
      message: "Request req_1 failed with 502",
      path: "/jobs/123",
    },
    {
      level: "error",
      service: "gateway",
      message: "Request req_2 failed with 503",
      path: "/jobs/456",
    },
    { level: "info", service: "gateway", message: "success" },
  ]);
  const groups = errorGroups(data);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].events.length, 2);
});
test("different services and levels are not silently merged", () => {
  const data = records([
    { level: "error", service: "gateway", message: "timeout" },
    { level: "fatal", service: "gateway", message: "timeout" },
    { level: "error", service: "worker", message: "timeout" },
  ]);
  assert.equal(errorGroups(data).length, 3);
});
test("HTTP failures are grouped even when severity is info", () => {
  assert.equal(
    errorGroups(
      records([{ level: "info", status: 503, message: "upstream failed" }]),
    ).length,
    1,
  );
});
test("traces correlate a request across services in chronological order", () => {
  const data = records([
    {
      timestamp: "2026-11-13T12:00:00.900Z",
      request_id: "req_a",
      service: "worker",
      message: "done",
    },
    {
      timestamp: "2026-11-13T12:00:00Z",
      request_id: "req_a",
      service: "gateway",
      message: "start",
    },
    { request_id: "req_a", message: "missing time" },
  ]);
  const trace = requestTraces(data)[0];
  assert.equal(trace.events[0].message, "start");
  assert.equal(trace.events.at(-1).message, "missing time");
  assert.equal(trace.spanMs, 900);
  assert.equal(trace.services.length, 3);
});
test("records without request IDs are not presented as one invented trace", () => {
  assert.deepEqual(
    requestTraces(records([{ message: "one" }, { message: "two" }])),
    [],
  );
});
test("identical timestamps keep source-line order and have zero observed span", () => {
  const trace = requestTraces(
    records([
      { message: "a", request_id: "r", timestamp: "2026-11-13T12:00:00Z" },
      { message: "b", request_id: "r", timestamp: "2026-11-13T12:00:00Z" },
    ]),
  )[0];
  assert.equal(trace.events[0].message, "a");
  assert.equal(trace.spanMs, 0);
});
test("investigation reports distinguish observed chronology from causal tracing", () => {
  const text = investigationReport(
    records([
      { message: "bad", level: "error", request_id: "req_a", service: "api" },
    ]),
    "demo.jsonl",
  );
  assert.ok(text.includes("1 error events"));
  assert.ok(text.includes("req_a"));
  assert.ok(text.includes("do not infer parent/child spans"));
});

test("different HTTP failure codes remain separate groups", () => {
  const data = records([
    { message: "upstream failed", service: "api", level: "error", status: 502 },
    { message: "upstream failed", service: "api", level: "error", status: 503 },
  ]);
  assert.equal(errorGroups(data).length, 2);
});
