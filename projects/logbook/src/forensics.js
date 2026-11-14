import { isError } from "./analyzer.js";
export function messagePattern(message) {
  return String(message)
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "<id>",
    )
    .replace(/\b(?:req|evt|job|usr)_[a-z0-9_-]+\b/gi, "<id>")
    .replace(/\b\d{3,}(?:\.\d+)?\b/g, "<n>");
}
export function pathPattern(path) {
  return String(path)
    .split("?")[0]
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "/:id")
    .replace(/\/\d+(?=\/|$)/g, "/:id");
}
export function errorGroups(records) {
  const groups = new Map();
  for (const record of records) {
    if (!isError(record)) continue;
    const pattern = messagePattern(record.message),
      path = pathPattern(record.path);
    const key = JSON.stringify([
      record.service,
      record.level,
      record.status,
      path,
      pattern,
    ]);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        pattern,
        path,
        service: record.service,
        level: record.level,
        status: record.status,
        events: [],
        requestIds: new Set(),
        first: null,
        last: null,
      };
      groups.set(key, group);
    }
    group.events.push(record);
    if (record.requestId) group.requestIds.add(record.requestId);
    if (record.timestamp) {
      if (!group.first || record.timestamp < group.first)
        group.first = record.timestamp;
      if (!group.last || record.timestamp > group.last)
        group.last = record.timestamp;
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, requestIds: [...g.requestIds] }))
    .sort(
      (a, b) =>
        b.events.length - a.events.length ||
        a.service.localeCompare(b.service) ||
        a.key.localeCompare(b.key),
    );
}
export function requestTraces(records) {
  const groups = new Map();
  for (const record of records) {
    if (!record.requestId) continue;
    const group = groups.get(record.requestId) ?? {
      id: record.requestId,
      events: [],
    };
    group.events.push(record);
    groups.set(record.requestId, group);
  }
  return [...groups.values()]
    .map((g) => {
      const events = [...g.events].sort(
        (a, b) =>
          (a.timestamp === null ? Infinity : Date.parse(a.timestamp)) -
            (b.timestamp === null ? Infinity : Date.parse(b.timestamp)) ||
          a.line - b.line,
      );
      const timed = events.filter((e) => e.timestamp),
        start = timed[0]?.timestamp ?? null,
        end = timed.at(-1)?.timestamp ?? null;
      return {
        id: g.id,
        events,
        services: [...new Set(events.map((e) => e.service))],
        errors: events.filter(isError).length,
        start,
        end,
        spanMs: start && end ? Date.parse(end) - Date.parse(start) : null,
      };
    })
    .sort(
      (a, b) =>
        b.errors - a.errors ||
        b.events.length - a.events.length ||
        a.id.localeCompare(b.id),
    );
}
export function investigationReport(records, sourceName = "Imported events") {
  const groups = errorGroups(records),
    traces = requestTraces(records),
    errors = records.filter(isError).length;
  const bullet = (s) => String(s).replaceAll("\n", " ").replaceAll("\r", " ");
  return (
    "# Logbook investigation\n\nSource: " +
    bullet(sourceName) +
    "\n\n" +
    records.length +
    " events · " +
    errors +
    " error events · " +
    traces.length +
    " request IDs\n\n## Recurring error groups\n\n" +
    (groups.length
      ? groups
          .map(
            (g) =>
              "- " +
              g.events.length +
              " events | " +
              bullet(g.service) +
              " | " +
              bullet(g.pattern) +
              " | " +
              (g.path || "no path"),
          )
          .join("\n")
      : "No error events in this view.") +
    "\n\n## Requests with errors\n\n" +
    (traces
      .filter((t) => t.errors)
      .map(
        (t) =>
          "- " +
          bullet(t.id) +
          ": " +
          t.errors +
          " errors across " +
          t.services.map(bullet).join(", ") +
          "; observed span " +
          (t.spanMs === null ? "unavailable" : t.spanMs + " ms"),
      )
      .join("\n") || "No request IDs with error events.") +
    "\n\nGrouping uses service, severity, HTTP status, path pattern and message pattern. Request timelines show chronological events sharing an ID; they do not infer parent/child spans.\n"
  );
}
