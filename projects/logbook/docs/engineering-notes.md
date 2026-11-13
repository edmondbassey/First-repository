# Logbook: engineering notes

The parser and calculations live in src/analyzer.js. They do not depend on the DOM. public/app.js handles file selection, filters, pagination and rendering. scripts/build.mjs creates the static distribution.

## Data flow

Text input → bounded JSONL parsing → normalized events → combined filters → metrics, table and endpoint summaries.

The raw object remains attached to each normalized event so the inspector can show fields the parser does not recognize.

## Useful decisions to discuss

- Why preserve unknown severity rather than call it info? Reclassifying it would make the data look more certain than it is.
- Why exclude invalid durations? Treating a missing measurement as zero would bias the latency percentiles.
- Why keep parsing errors separate? One malformed event should not prevent inspection of the valid records.
- Why local processing? Troubleshooting logs may contain private information, and this tool needs no server-side storage.
- Why a bound on imports? Parsing and rendering happen on the main thread. Large-file support would need streaming and a worker.
- Why nearest-rank percentiles? The method is simple, deterministic and documented; another estimator can produce different values on small datasets.
- Why no innerHTML for events? A log message can contain markup and must remain text.

## Extend it

Add a parser for another documented log format. Give it fixtures that include valid records, invalid timestamps and partially missing fields. Keep the normalized event shape stable so filters and summaries continue to work.

A next step for large datasets would be a streaming parser in a Web Worker and a virtualized table. Those are future changes, not current features.
