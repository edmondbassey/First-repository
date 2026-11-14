export const LEVELS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "unknown",
];
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_LINES = 20000;
const aliases = {
  warning: "warn",
  critical: "fatal",
  err: "error",
  information: "info",
};
export function parseLogs(text) {
  if (typeof text !== "string")
    throw new TypeError("Paste log text or choose a text file.");
  if (new TextEncoder().encode(text).length > MAX_BYTES)
    throw new RangeError("Choose a file smaller than 2 MB.");
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length > MAX_LINES + 1)
    throw new RangeError("Use no more than 20,000 lines.");
  const records = [],
    issues = [];
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const data = JSON.parse(line);
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new Error("Expected one JSON object.");
      const message = data.message ?? data.msg;
      if (message === undefined)
        throw new Error('Missing a "message" or "msg" field.');
      const rawLevel = String(
        data.level ?? data.severity ?? "unknown",
      ).toLowerCase();
      const level = Object.hasOwn(aliases, rawLevel)
        ? aliases[rawLevel]
        : LEVELS.includes(rawLevel)
          ? rawLevel
          : "unknown";
      const duration = data.duration_ms ?? data.durationMs ?? data.latency_ms;
      const status = data.status ?? data.status_code;
      const time = data.timestamp ?? data.time ?? data.ts;
      const timestamp =
        typeof time === "string" &&
        /^\d{4}-\d{2}-\d{2}T/.test(time) &&
        Number.isFinite(Date.parse(time))
          ? new Date(time).toISOString()
          : null;
      records.push({
        id: index + 1,
        line: index + 1,
        timestamp,
        level,
        service: String(data.service ?? "unspecified"),
        message:
          typeof message === "string" ? message : JSON.stringify(message),
        duration:
          typeof duration === "number" &&
          Number.isFinite(duration) &&
          duration >= 0
            ? duration
            : null,
        status:
          Number.isInteger(status) && status >= 100 && status <= 599
            ? status
            : null,
        path: typeof data.path === "string" ? data.path : "",
        requestId: String(data.request_id ?? data.requestId ?? ""),
        raw: data,
      });
    } catch (error) {
      issues.push({ line: index + 1, reason: error.message });
    }
  });
  if (lines.filter((l) => l.trim()).length > MAX_LINES)
    throw new RangeError("Use no more than 20,000 lines.");
  return { records, issues, totalLines: lines.filter((l) => l.trim()).length };
}
export function filterRecords(
  records,
  { query = "", level = "all", service = "all" } = {},
) {
  const q = query.toLowerCase().trim();
  return records.filter(
    (r) =>
      (level === "all" || r.level === level) &&
      (service === "all" || r.service === service) &&
      (!q ||
        [r.message, r.path, r.requestId, r.service, r.status ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q)),
  );
}
export function percentile(values, p) {
  if (!Number.isFinite(p) || p < 0 || p > 100)
    throw new RangeError("Percentile must be between 0 and 100.");
  const sorted = values
    .filter((v) => typeof v === "number" && Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  return sorted.length
    ? sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]
    : null;
}
export function isError(record) {
  return (
    record.level === "error" ||
    record.level === "fatal" ||
    (record.status !== null && record.status >= 500)
  );
}
export function summarize(records) {
  const counts = Object.fromEntries(LEVELS.map((level) => [level, 0]));
  let errors = 0;
  const services = new Set(),
    durations = [];
  for (const r of records) {
    counts[r.level]++;
    if (isError(r)) errors++;
    services.add(r.service);
    if (r.duration !== null) durations.push(r.duration);
  }
  return {
    count: records.length,
    errors,
    errorRate: records.length ? (errors / records.length) * 100 : 0,
    services: services.size,
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    durationCount: durations.length,
    counts,
  };
}
export function endpoints(records) {
  const map = new Map();
  for (const r of records) {
    if (!r.path) continue;
    const group = map.get(r.path) ?? {
      path: r.path,
      count: 0,
      errors: 0,
      durations: [],
    };
    group.count++;
    if (isError(r)) group.errors++;
    if (r.duration !== null) group.durations.push(r.duration);
    map.set(r.path, group);
  }
  return [...map.values()]
    .map((g) => ({
      path: g.path,
      count: g.count,
      errors: g.errors,
      p95: percentile(g.durations, 95),
    }))
    .sort(
      (a, b) =>
        b.errors - a.errors ||
        b.count - a.count ||
        a.path.localeCompare(b.path),
    );
}
export function timeline(records, buckets = 16) {
  if (!Number.isInteger(buckets) || buckets < 1 || buckets > 100)
    throw new RangeError("Choose 1–100 time buckets.");
  const timed = records.filter((r) => r.timestamp !== null),
    times = timed.map((r) => Date.parse(r.timestamp));
  if (!times.length) return { start: null, end: null, bins: [] };
  const start = Math.min(...times),
    end = Math.max(...times),
    width = Math.max(1, (end - start + 1) / buckets),
    bins = Array.from({ length: buckets }, () => ({ count: 0, errors: 0 }));
  for (const r of timed) {
    const i = Math.min(
      buckets - 1,
      Math.floor((Date.parse(r.timestamp) - start) / width),
    );
    bins[i].count++;
    if (isError(r)) bins[i].errors++;
  }
  return { start, end, bins };
}
export function exportCsv(records) {
  const rows = [
    [
      "Line",
      "Timestamp",
      "Level",
      "Service",
      "Message",
      "Duration (ms)",
      "HTTP status",
      "Path",
      "Request ID",
    ],
    ...records.map((r) => [
      r.line,
      r.timestamp,
      r.level,
      r.service,
      r.message,
      r.duration,
      r.status,
      r.path,
      r.requestId,
    ]),
  ];
  return rows
    .map((row) =>
      row
        .map((value) => {
          let cell = String(value ?? "");
          if (/^[\s]*[=+\-@]/.test(cell) || /^[\t\r]/.test(cell))
            cell = "'" + cell;
          return '"' + cell.replaceAll('"', '""') + '"';
        })
        .join(","),
    )
    .join("\r\n");
}
