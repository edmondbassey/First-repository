import test from "node:test";
import assert from "node:assert/strict";
import {
  parseLogs,
  filterRecords,
  percentile,
  summarize,
  endpoints,
  timeline,
  exportCsv,
  MAX_BYTES,
} from "../src/analyzer.js";
const raw = (objects) => objects.map((x) => JSON.stringify(x)).join("\n");
test("reads JSONL, CRLF, BOM and blank lines", () => {
  const result = parseLogs(
    '\uFEFF{"msg":"ready","level":"INFO"}\r\n\r\n{"message":"ok"}\r\n',
  );
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].level, "info");
  assert.equal(result.records[1].line, 3);
  assert.equal(result.totalLines, 2);
});
test("reports malformed lines without discarding readable events", () => {
  const result = parseLogs('{"message":"ok"}\nnot json\n[]\n{"level":"warn"}');
  assert.equal(result.records.length, 1);
  assert.deepEqual(
    result.issues.map((x) => x.line),
    [2, 3, 4],
  );
});
test("normalizes documented aliases and preserves raw values", () => {
  const object = {
    msg: "slow",
    severity: "WARNING",
    durationMs: 42,
    status_code: 503,
    requestId: "r-1",
    extra: { value: 1 },
  };
  const event = parseLogs(raw([object])).records[0];
  assert.equal(event.level, "warn");
  assert.equal(event.duration, 42);
  assert.equal(event.status, 503);
  assert.deepEqual(event.raw, object);
});
test("unknown levels stay unknown rather than becoming info", () => {
  assert.equal(
    parseLogs(raw([{ message: "hello", level: "custom" }])).records[0].level,
    "unknown",
  );
});
test("invalid optional metrics do not invent latency or timestamps", () => {
  const event = parseLogs(
    raw([
      {
        message: "ready",
        duration_ms: -5,
        status: 900,
        timestamp: "yesterday",
      },
    ]),
  ).records[0];
  assert.equal(event.duration, null);
  assert.equal(event.status, null);
  assert.equal(event.timestamp, null);
});
test("search combines service, severity and request ID filters", () => {
  const data = parseLogs(
    raw([
      { message: "bad", level: "error", service: "api", request_id: "ABC" },
      { message: "ok", level: "info", service: "api" },
      { message: "bad", level: "error", service: "worker" },
    ]),
  ).records;
  assert.equal(
    filterRecords(data, { service: "api", level: "error", query: "abc" })
      .length,
    1,
  );
  assert.equal(filterRecords(data, { query: "nomatch" }).length, 0);
});
test("nearest-rank percentiles do not change the input", () => {
  const values = [100, 1, 2, 3, 4];
  assert.equal(percentile(values, 95), 100);
  assert.equal(percentile(values, 50), 3);
  assert.equal(percentile([], 95), null);
  assert.deepEqual(values, [100, 1, 2, 3, 4]);
  assert.throws(() => percentile(values, 101), RangeError);
});
test("errors are counted once when both level and HTTP status indicate failure", () => {
  const data = parseLogs(
    raw([
      { message: "bad", level: "error", status: 500, duration_ms: 0 },
      { message: "bad", status: 503, duration_ms: 20 },
      { message: "client", status: 404 },
    ]),
  ).records;
  const summary = summarize(data);
  assert.equal(summary.errors, 2);
  assert.equal(summary.p95, 20);
  assert.equal(summary.durationCount, 2);
  assert.equal(summarize([]).errorRate, 0);
});
test("endpoint aggregation sorts by failures and calculates measured p95", () => {
  const data = parseLogs(
    raw([
      { message: "ok", path: "/a", duration_ms: 10 },
      { message: "bad", path: "/b", status: 500, duration_ms: 90 },
      { message: "ok", path: "/b", duration_ms: 20 },
      { message: "none" },
    ]),
  ).records;
  const groups = endpoints(data);
  assert.equal(groups[0].path, "/b");
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].errors, 1);
  assert.equal(groups[0].p95, 90);
});
test("time buckets retain all timestamped events including identical timestamps", () => {
  const data = parseLogs(
    raw([
      { message: "a", timestamp: "2026-11-13T12:00:00Z" },
      { message: "b", timestamp: "2026-11-13T12:00:00Z", level: "error" },
      { message: "c" },
    ]),
  ).records;
  const series = timeline(data, 8);
  assert.equal(
    series.bins.reduce((n, b) => n + b.count, 0),
    2,
  );
  assert.equal(
    series.bins.reduce((n, b) => n + b.errors, 0),
    1,
  );
  assert.deepEqual(timeline([]).bins, []);
});
test("CSV protects spreadsheet formulas and quotes multiline content", () => {
  const data = parseLogs(
    raw([{ message: '=SUM(1,2)\n"hello"', service: "@bad" }]),
  ).records;
  const csv = exportCsv(data);
  assert.ok(
    csv.includes(
      String.fromCharCode(34, 39) + "@bad" + String.fromCharCode(34),
    ),
  );
  assert.ok(csv.includes(String.fromCharCode(39) + "=SUM(1,2)"));
  assert.ok(csv.includes('""hello""'));
});
test("markup stays data in the normalized event", () => {
  const message = "<img src=x onerror=alert(1)>";
  assert.equal(parseLogs(raw([{ message }])).records[0].message, message);
});
test("large files and excessive line counts are rejected", () => {
  assert.throws(() => parseLogs("a".repeat(MAX_BYTES + 1)), RangeError);
  assert.throws(
    () => parseLogs(Array(20002).fill('{"msg":"a"}').join("\n")),
    RangeError,
  );
});
