# Logbook

A debugging workbench for grouping recurring failures and following a request across service events. Imported captures stay in the browser.

**JavaScript ES modules · HTML/CSS · Node.js tests · no runtime dependencies**

## Try an investigation

The included fictional capture has 80 events, 16 request IDs and three recurring error groups. Open the partner-adapter timeout group, follow `req_6a41`, and inspect the recorded events across four services. The related duplicate-order incident appears in [Relay](../relay).

Switch between Error groups, Request trails and Event stream. Filter by service or severity, search an ID, inspect the original JSON, and export the current investigation as Markdown or events as CSV. Paste JSONL, choose a local file, or drop a capture to investigate other records.

Metrics and charts are calculated from the current filtered records. Imported contents stay in memory and clear on reload. The app makes no upload of imported logs.

## Run locally

Use Node.js 24 for tests and builds.

```sh
npm test
npm run build
python3 -m http.server 8765 --directory dist
```

Open http://localhost:8765.

## Supported format

One JSON object per line, with a message or msg field:

```json
{
  "timestamp": "2026-11-13T11:42:17Z",
  "level": "error",
  "service": "partner-adapter",
  "message": "Delivery evt_8f32 timed out after 1200 ms",
  "duration_ms": 1200,
  "status": 502,
  "path": "/v1/deliveries/4821",
  "request_id": "req_6a41"
}
```

Aliases: time/ts for timestamp, severity for level, durationMs/latency_ms for duration_ms, status_code for status, requestId for request_id. Unknown fields remain in the raw event. Missing or invalid measurements appear as unavailable; unknown severity stays unknown. Invalid JSON, primitive values and records without a message are reported by source line and skipped.

Imports are bounded to 2 MB and 20,000 lines. Event and request lists paginate in groups of 20.

## How investigation works

- An error event has error/fatal severity or an HTTP status of 500–599, counted once.
- Error groups share a service, severity, HTTP status, normalized path and message pattern. Numeric path segments and UUIDs become `:id`; query strings are removed. Messages normalize UUIDs, selected ID prefixes and standalone numbers of three or more digits. Grouping is a heuristic, not a diagnosis.
- Request trails use an explicit nonempty request ID. Events are ordered by timestamp, then source line; untimed events come last. The observed span is last minus first timestamp, rather than end-to-end latency or a reconstructed causal trace.
- P50 and P95 use nearest rank on finite, nonnegative durations. The 36-bucket density chart uses readable timestamps in the filtered range.
- CSV cells are quoted and leading spreadsheet formulas are neutralized. Rendered imported content uses textContent.

[Engineering notes](docs/engineering-notes.md)

## Tests

24 tests cover parsing and aliases, malformed lines, prototype-property severity names, filters, percentiles, time buckets, input limits, CSV escaping, grouping boundaries, pattern normalization, request ordering, absent timestamps and investigation reports.

## Author

Edmond Bassey
