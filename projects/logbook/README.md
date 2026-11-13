# Logbook

A log explorer for finding failed requests, inspecting events and checking latency without uploading log files.

**JavaScript ES modules · HTML/CSS · Node.js tests · no runtime dependencies**

## Use it

Load the included sample, paste JSONL, or import a file. Filter by service and severity, search a request ID, inspect the original JSON, and export the filtered view.

Metrics and charts are calculated from the current records. Imported data stays in browser memory and is cleared when the page is reloaded. File contents are not sent to a server.

## Run locally

```sh
npm test
npm run build
python3 -m http.server 8765 --directory dist
```

Open http://localhost:8765. Use Node.js 24 for tests and builds.

## Supported format

One JSON object per line, with a message or msg field:

```json
{
  "timestamp": "2026-11-13T13:00:00Z",
  "level": "error",
  "service": "billing",
  "message": "Upstream timeout",
  "duration_ms": 820,
  "status": 503,
  "path": "/api/invoices",
  "request_id": "req_123"
}
```

Recognized aliases: time/ts for timestamp, severity for level, durationMs/latency_ms for duration_ms, status_code for status, requestId for request_id. Unknown fields are preserved in the raw event.

Missing or invalid optional measurements appear as unavailable. Unknown severities remain unknown. Invalid JSON, primitive values and records without message/msg are reported by source line and skipped.

Imports are bounded to 2 MB and 20,000 lines. The table paginates the filtered result in groups of 25.

## How the numbers work

- An error event has error/fatal severity or an HTTP status of 500–599. A matching event is counted once.
- P50 and P95 use the nearest-rank method on finite, nonnegative numeric duration values.
- Time charts include records with readable ISO timestamps. Their buckets use the filtered dataset's time range.
- Endpoint summaries group by the supplied path exactly, then sort by error count. Dynamic path parameters are not inferred.
- CSV exports quote every cell and neutralize leading spreadsheet formulas.

[Engineering notes](docs/engineering-notes.md)

## Tests

13 tests cover parsing, aliases, malformed rows, unknown fields, filters, percentile math, aggregation, time buckets, size limits and CSV escaping. Rendered event text uses textContent rather than HTML interpolation.

## Author

Edmond Bassey
