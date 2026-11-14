# Logbook: engineering notes

`src/analyzer.js` handles bounded parsing, normalization, filtering and measurements. `src/forensics.js` groups errors, orders requests and writes the investigation report. Neither module depends on the DOM. `public/app.js` handles file input, navigation, dialogs, pagination and text rendering. The build copies those ES modules into a static distribution.

## From capture to investigation

A capture is parsed once. Its readable records and source-line issues remain separate. Search, service and severity filters produce the current dataset. All three views and the exported investigation use that same filtered dataset.

The sample connects to Relay's fictional duplicate-order case: request `req_6a41` passes through the API gateway, delivery gateway, partner adapter and delivery worker. There is no live integration between the two apps.

## Grouping without pretending to know the cause

A group key includes service, severity, HTTP status, normalized path and message pattern. Keeping HTTP status in the key prevents a 409 conflict from being merged with a 502 timeout just because message normalization removes their digits. All original member events remain inspectable.

Path normalization removes query strings and replaces numeric or UUID segments. Message normalization replaces UUIDs, req_/evt_/job_/usr_ identifiers and standalone numbers of at least three digits. These rules can over-group unrelated messages or miss equivalent ones; they offer an investigation starting point rather than root-cause detection.

## Request chronology and timing

Request trails require an explicit ID. Matching events are sorted by readable timestamp, then source line; untimed events appear last. The inspector shows offsets from the first timed event. The observed span is the difference between the first and last timestamps.

This is a chronology of recorded events. It does not infer parent/child spans, prove causality, correct clock skew, or measure network latency from event gaps. A missing duration is never converted to zero. P95 uses nearest rank on available nonnegative numeric durations.

## Input handling

One malformed line does not prevent inspection of valid records. Unknown severity is kept as unknown; aliases use own-property checks so names such as constructor cannot resolve through the object prototype. Raw fields remain attached to each normalized event.

Imports stop above 2 MB or 20,000 lines. Rendering uses textContent for imported values, and CSV output protects against leading spreadsheet formulas. All imported contents stay in browser memory; exports are local downloads.

Parsing still runs on the main thread. Large-capture support would need a streaming parser, a Web Worker and virtualized rendering. Authentication and persistent storage are unnecessary for the present local workflow.
