# Edmond Bassey

Freelance backend engineer based in Montreal. I build web applications and tools for debugging and support. I am open to backend development, software testing and technical support work.

## Selected projects

### [Relay — support desk](projects/relay)

A working support-ticket application with a React interface, a TypeScript REST API and persistent SQLite storage.

- Create and search tickets, assign work, update priorities and add internal notes.
- Version checks prevent older browser tabs from overwriting newer changes.
- Ticket updates and their history entries share a transaction.
- Separate demo workspaces, parameterized SQL and bounded inputs.
- 18 tests using real SQL, including workspace isolation and concurrent edits.

[Source and setup](projects/relay) · [Architecture](projects/relay/docs/engineering-notes.md) · [API reference](projects/relay/docs/api.md)

### [Logbook — log explorer](projects/logbook)

A browser-based JSONL log inspector for finding failed requests and investigating latency.

- Import or paste events, combine filters, inspect raw JSON and export a filtered CSV.
- Calculates error rates, nearest-rank percentiles and endpoint summaries from the loaded data.
- Reports malformed source lines while keeping valid events available.
- Imported logs stay on the device.
- 13 tests covering parsing, calculations, filtering and export edge cases.

[Source and setup](projects/logbook) · [Engineering notes](projects/logbook/docs/engineering-notes.md)

## Earlier coursework

- [Simple interest calculator](https://github.com/edmondbassey/Final) — browser app with validation and automated calculation tests.
- [Movie review database](https://github.com/edmondbassey/qkfls-Movie-Reviews-Database) — Node.js/Express coursework with Cloudant and Watson Natural Language Understanding.
- [Text and URL analysis](https://github.com/edmondbassey/cazgi-IBM-Watson-NLU-Project) — React/Express coursework using Watson.

The coursework retains its original attribution. The READMEs describe the implemented and unfinished parts.

## Client work

My freelance client projects remain private under client agreements.

## Repository history

The original firstpython.py and testchild.py files are early Python and Git exercises. New applications are kept under projects/.
