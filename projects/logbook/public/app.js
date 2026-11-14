import {
  parseLogs,
  filterRecords,
  summarize,
  timeline,
  exportCsv,
  MAX_BYTES,
} from "./analyzer.js";
import {
  errorGroups,
  requestTraces,
  investigationReport,
} from "./forensics.js";
const $ = (id) => document.getElementById(id),
  PAGE_SIZE = 20;
let records = [],
  issues = [],
  filtered = [],
  view = "groups",
  page = 0,
  source = "integration-events.jsonl",
  dragDepth = 0;
const filters = { query: "", service: "all", level: "all" };
function el(tag, css = "", text) {
  const node = document.createElement(tag);
  node.className = css;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function icon(name, size = 16) {
  const paths = {
    arrow: "M5 12h14M13 6l6 6-6 6",
    open: "M6 18L18 6M6 6h12v12",
    down: "M12 4v12M7 11l5 5 5-5M5 19v2h14v-2",
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", paths[name] ?? paths.arrow);
  svg.append(path);
  return svg;
}
function formatTime(time) {
  return time ? new Date(time).toISOString().slice(11, 23) : "No timestamp";
}
function span(ms) {
  return ms === null
    ? "No timing"
    : ms < 1000
      ? ms + " ms"
      : (ms / 1000).toFixed(2) + " s";
}
function error(message) {
  $("error").textContent = message;
  $("error").hidden = !message;
}
function download(text, name, type) {
  const a = el("a"),
    url = URL.createObjectURL(new Blob([text], { type }));
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function reset() {
  filters.query = "";
  filters.service = "all";
  filters.level = "all";
  $("search").value = "";
  $("service").value = "all";
  $("level").value = "all";
  page = 0;
  render();
}
function setView(next) {
  view = next;
  page = 0;
  render();
}
function load(text, name, sample = false) {
  try {
    const result = parseLogs(text);
    if (!result.records.length)
      throw new Error(
        result.issues.length
          ? "No readable events. Include a message or msg field in each JSON object."
          : "This capture has no events.",
      );
    records = result.records;
    issues = result.issues;
    source = name;
    error("");
    $("source-name").textContent = name;
    $("source-type").textContent = sample ? "FIXTURE" : "LOCAL";
    $("source-info").textContent =
      records.length + " events / " + result.totalLines + " source lines";
    $("service").replaceChildren(new Option("All services", "all"));
    for (const service of [...new Set(records.map((r) => r.service))].sort())
      $("service").add(new Option(service, service));
    $("notice").replaceChildren();
    $("notice").hidden = !issues.length;
    if (issues.length) {
      $("notice").append(
        el(
          "span",
          "",
          issues.length +
            " source line" +
            (issues.length === 1 ? " was" : "s were") +
            " skipped.",
        ),
      );
      const button = el("button", "", "Review import notes");
      button.onclick = () => {
        const list = $("issues-list");
        list.replaceChildren();
        for (const issue of issues.slice(0, 100)) {
          const item = el("li");
          item.append(
            el("strong", "", "LINE " + issue.line),
            el("span", "", issue.reason),
          );
          list.append(item);
        }
        if (issues.length > 100)
          list.append(el("li", "", "Showing the first 100 notes."));
        $("issues-dialog").showModal();
      };
      $("notice").append(button);
    }
    reset();
    return true;
  } catch (e) {
    error(e.message);
    return false;
  }
}
function render() {
  filtered = filterRecords(records, filters);
  const summary = summarize(filtered),
    groups = errorGroups(filtered),
    traces = requestTraces(filtered);
  $("metric-events").textContent = summary.count.toLocaleString();
  $("metric-errors").textContent = summary.errors.toLocaleString();
  $("metric-error-rate").textContent =
    summary.errorRate.toFixed(1) + "% of events in view";
  $("metric-groups").textContent = groups.length;
  $("metric-p95").replaceChildren(
    el("span", "", summary.p95 === null ? "—" : summary.p95.toLocaleString()),
    el("em", "", summary.p95 === null ? "" : "ms"),
  );
  $("metric-duration-count").textContent =
    summary.durationCount + " measured events";
  $("metric-events-note").textContent =
    filtered.length === records.length
      ? "All readable records"
      : "Filtered from " + records.length + " events";
  $("nav-events").textContent = summary.count;
  $("nav-groups").textContent = groups.length;
  $("nav-traces").textContent = traces.length;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  });
  const config = {
    groups: [
      "01",
      "Recurring error groups",
      "SERVICE + STATUS + PATH + MESSAGE PATTERN",
    ],
    traces: [
      "02",
      "Request trails",
      "CHRONOLOGICAL EVENTS SHARING A REQUEST ID",
    ],
    events: ["03", "Event stream", "RAW CONTEXT, ONE EVENT AT A TIME"],
  }[view];
  $("view-index").textContent = config[0];
  $("view-title").textContent = config[1];
  $("view-description").textContent = config[2];
  const series = timeline(filtered, 36),
    chart = $("timeline");
  chart.replaceChildren();
  chart.setAttribute(
    "aria-label",
    filtered.length + " filtered events; " + summary.errors + " error events.",
  );
  if (series.bins.length) {
    const max = Math.max(1, ...series.bins.map((b) => b.count));
    for (const bin of series.bins) {
      const column = el("div", "map-column"),
        bar = el("div", "map-bar"),
        errors = el("div", "map-errors");
      bar.style.height = Math.max(2, (bin.count / max) * 100) + "%";
      bar.title = bin.count + " events / " + bin.errors + " errors";
      errors.style.height =
        (bin.count ? (bin.errors / bin.count) * 100 : 0) + "%";
      bar.append(errors);
      column.append(bar);
      chart.append(column);
    }
    $("timeline-start").textContent =
      new Date(series.start).toISOString().replace("T", " ").slice(0, 23) +
      " UTC";
    $("timeline-end").textContent =
      formatTime(new Date(series.end).toISOString()) + " UTC";
  } else {
    chart.append(el("p", "empty-map", "No readable timestamps in this view."));
    $("timeline-start").textContent = "";
    $("timeline-end").textContent = "";
  }
  const data =
      view === "groups" ? groups : view === "traces" ? traces : filtered,
    totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  page = Math.min(page, totalPages - 1);
  $("view-count").textContent = data.length;
  $("results").replaceChildren();
  if (!data.length) {
    const empty = el("div", "empty");
    empty.append(
      el("span", "empty-index", "[ ∅ ]"),
      el(
        "h3",
        "",
        view === "groups"
          ? "No recurring failures in this view."
          : view === "traces"
            ? "No request IDs in this view."
            : "No matching events.",
      ),
      el(
        "p",
        "",
        view === "traces"
          ? "Include request_id or requestId to connect service events."
          : "Try another service, severity or search term.",
      ),
    );
    const button = el("button", "secondary", "Clear filters");
    button.onclick = reset;
    empty.append(button);
    $("results").append(empty);
  } else if (view === "groups") {
    for (const group of data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const row = el("button", "group-row");
      row.setAttribute("aria-label", "Inspect error group: " + group.pattern);
      const count = el("div", "group-frequency");
      count.append(
        el("strong", "", String(group.events.length).padStart(2, "0")),
        el("span", "", "EVENTS"),
      );
      const body = el("div", "group-main");
      const meta = el("div", "group-meta");
      meta.append(
        el("span", "service-name", group.service),
        el("span", "level level-" + group.level, group.level),
      );
      if (group.status !== null)
        meta.append(el("span", "http-code", "HTTP " + group.status));
      body.append(
        meta,
        el("h3", "", group.pattern),
        el("p", "path", group.path || "No path supplied"),
      );
      const trailing = el("div", "group-trailing");
      trailing.append(
        el("span", "", group.requestIds.length + " request IDs"),
        icon("open"),
      );
      row.append(count, body, trailing);
      row.onclick = () => showGroup(group);
      $("results").append(row);
    }
  } else if (view === "traces") {
    for (const trace of data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const row = el("button", "trace-row");
      row.setAttribute("aria-label", "Follow request " + trace.id);
      const label = el("div", "trace-identity");
      label.append(
        el("code", "", trace.id),
        el(
          "small",
          "",
          trace.events.length +
            " events / " +
            trace.services.length +
            " services",
        ),
      );
      const route = el("div", "trace-services");
      trace.services.slice(0, 4).forEach((s, index) => {
        if (index) route.append(icon("arrow", 12));
        route.append(el("span", "", s));
      });
      const result = el("div", "trace-result");
      result.append(
        el(
          "strong",
          trace.errors ? "trace-error" : "",
          trace.errors ? trace.errors + " errors" : "No errors",
        ),
        el("small", "", span(trace.spanMs)),
      );
      row.append(label, route, result, icon("open"));
      row.onclick = () => showTrace(trace);
      $("results").append(row);
    }
  } else {
    const table = el("table", "event-table"),
      head = el("thead"),
      header = el("tr");
    for (const title of [
      "TIME / UTC",
      "LEVEL",
      "SERVICE",
      "MESSAGE",
      "LATENCY",
      "",
    ])
      header.append(el("th", "", title));
    head.append(header);
    table.append(head);
    const body = el("tbody");
    for (const record of data.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const row = el("tr"),
        level = el("td"),
        service = el("td"),
        message = el("td", "message-cell"),
        open = el("td");
      level.append(el("span", "level level-" + record.level, record.level));
      service.append(el("span", "service-name", record.service));
      const button = el("button", "event-message", record.message);
      button.setAttribute("aria-label", "Inspect event on line " + record.line);
      button.onclick = () => showEvent(record);
      message.append(button);
      if (record.requestId) {
        const request = el("button", "request-link", record.requestId);
        request.onclick = () =>
          showTrace(
            requestTraces(records).find((t) => t.id === record.requestId),
          );
        message.append(request);
      }
      const arrow = el("button", "event-open");
      arrow.setAttribute("aria-label", "Open source line " + record.line);
      arrow.append(icon("open"));
      arrow.onclick = () => showEvent(record);
      open.append(arrow);
      row.append(
        el("td", "event-time", formatTime(record.timestamp)),
        level,
        service,
        message,
        el(
          "td",
          "duration",
          record.duration === null ? "—" : span(record.duration),
        ),
        open,
      );
      body.append(row);
    }
    table.append(body);
    const wrap = el("div", "table-wrap");
    wrap.append(table);
    $("results").append(wrap);
  }
  $("page-info").textContent = data.length
    ? "SHOWING " +
      (page * PAGE_SIZE + 1) +
      "–" +
      Math.min((page + 1) * PAGE_SIZE, data.length) +
      " OF " +
      data.length
    : "0 RESULTS";
  $("pagination").hidden = totalPages <= 1;
  $("page-number").textContent = page + 1 + " / " + totalPages;
  $("prev").disabled = page === 0;
  $("next").disabled = page + 1 >= totalPages;
  $("export-csv").disabled = !filtered.length;
  $("export-report").disabled = !filtered.length;
}
function openDetail(label, title) {
  $("detail-label").textContent = label;
  $("detail-title").textContent = title;
  $("detail-meta").replaceChildren();
  $("detail-body").replaceChildren();
  if (!$("detail-dialog").open) $("detail-dialog").showModal();
}
function showGroup(group) {
  openDetail("ERROR GROUP / " + group.events.length + " EVENTS", group.pattern);
  $("detail-meta").append(
    el("span", "service-name", group.service),
    el("span", "level level-" + group.level, group.level),
  );
  const summary = el("div", "detail-summary");
  summary.append(
    el("p", "", group.path || "No endpoint supplied"),
    el(
      "p",
      "",
      group.requestIds.length +
        " request IDs / first seen " +
        formatTime(group.first) +
        " UTC",
    ),
  );
  $("detail-body").append(summary);
  const intro = el("div", "detail-section-title", "MATCHING EVENTS");
  $("detail-body").append(intro);
  for (const event of group.events.slice(0, 80)) {
    const row = el("button", "matching-event");
    row.append(
      el("time", "", formatTime(event.timestamp)),
      el("span", "", event.message),
      el("code", "", event.requestId || "No request ID"),
      icon("arrow"),
    );
    row.setAttribute(
      "aria-label",
      "Inspect grouped event on line " + event.line,
    );
    row.onclick = () => showEvent(event);
    $("detail-body").append(row);
  }
  if (group.requestIds.length) {
    const button = el(
      "button",
      "primary detail-action",
      "Follow request " + group.requestIds[0],
    );
    button.append(icon("arrow"));
    button.onclick = () =>
      showTrace(
        requestTraces(records).find((t) => t.id === group.requestIds[0]),
      );
    $("detail-body").append(button);
  }
  const note = el(
    "p",
    "method-note",
    "Grouping keeps service, severity and HTTP status separate. Variable IDs and numeric path segments are normalized.",
  );
  $("detail-body").append(note);
}
function showTrace(trace) {
  if (!trace) return;
  openDetail(
    "REQUEST TRAIL / " + trace.services.length + " SERVICES",
    trace.id,
  );
  $("detail-meta").append(
    el(
      "span",
      trace.errors ? "trace-error" : "trace-ok",
      trace.errors + " error events",
    ),
    el("span", "", span(trace.spanMs) + " observed span"),
  );
  $("detail-body").append(
    el(
      "p",
      "method-note",
      "Events share a request ID. The order below is observed chronology, not inferred parent/child spans.",
    ),
  );
  const trail = el("div", "request-trail");
  for (const event of trace.events) {
    const row = el(
      "button",
      "trail-step " +
        (event.level === "error" ||
        event.level === "fatal" ||
        event.status >= 500
          ? "failed"
          : ""),
    );
    const offset =
      event.timestamp && trace.start
        ? Date.parse(event.timestamp) - Date.parse(trace.start)
        : null;
    const marker = el("span", "trail-marker"),
      timing = el("div", "trail-timing");
    timing.append(
      el("strong", "", offset === null ? "—" : "+" + span(offset)),
      el("small", "", formatTime(event.timestamp)),
    );
    const body = el("div", "trail-body");
    body.append(
      el("span", "service-name", event.service),
      el("p", "", event.message),
    );
    if (event.status)
      body.append(el("small", "http-code", "HTTP " + event.status));
    row.append(marker, timing, body, icon("open", 13));
    row.onclick = () => showEvent(event);
    row.setAttribute(
      "aria-label",
      "Inspect request event on line " + event.line,
    );
    trail.append(row);
  }
  $("detail-body").append(trail);
}
function showEvent(event) {
  openDetail("SOURCE LINE / " + event.line, event.message);
  $("detail-meta").append(
    el("span", "level level-" + event.level, event.level),
    el("span", "service-name", event.service),
  );
  const properties = el("dl", "event-properties");
  for (const [key, value] of [
    ["Timestamp", event.timestamp || "Not supplied"],
    ["Request ID", event.requestId || "Not supplied"],
    ["Endpoint", event.path || "Not supplied"],
    ["HTTP status", event.status ?? "Not supplied"],
    ["Duration", span(event.duration)],
  ])
    properties.append(el("dt", "", key), el("dd", "", value));
  $("detail-body").append(properties);
  if (event.requestId) {
    const button = el(
      "button",
      "secondary detail-action",
      "Follow this request",
    );
    button.append(icon("arrow"));
    button.onclick = () =>
      showTrace(requestTraces(records).find((t) => t.id === event.requestId));
    $("detail-body").append(button);
  }
  const heading = el("div", "raw-heading");
  heading.append(el("h3", "", "RAW EVENT"));
  const copy = el("button", "copy-button", "Copy JSON"),
    result = el("span", "copy-result");
  result.setAttribute("role", "status");
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(event.raw, null, 2));
      result.textContent = "Copied";
    } catch {
      result.textContent = "Select the raw JSON to copy it.";
    }
  };
  heading.append(copy);
  $("detail-body").append(
    heading,
    el("pre", "raw-json", JSON.stringify(event.raw, null, 2)),
    result,
  );
}
async function importFile(file) {
  if (!file) return;
  if (file.size > MAX_BYTES) {
    error("Choose a capture smaller than 2 MB.");
    return;
  }
  try {
    load(await file.text(), file.name);
  } catch {
    error("The capture could not be read.");
  }
}
document
  .querySelectorAll("[data-view]")
  .forEach((button) => (button.onclick = () => setView(button.dataset.view)));
$("search").oninput = (e) => {
  filters.query = e.target.value;
  page = 0;
  render();
};
$("service").onchange = (e) => {
  filters.service = e.target.value;
  page = 0;
  render();
};
$("level").onchange = (e) => {
  filters.level = e.target.value;
  page = 0;
  render();
};
$("reset").onclick = reset;
$("prev").onclick = () => {
  page--;
  render();
};
$("next").onclick = () => {
  page++;
  render();
};
$("import-side").onclick = $("import-main").onclick = () =>
  $("file-input").click();
$("file-input").onchange = async (e) => {
  await importFile(e.target.files[0]);
  e.target.value = "";
};
$("paste-open").onclick = () => $("paste-dialog").showModal();
$("paste-form").onsubmit = (e) => {
  e.preventDefault();
  if (load($("paste-text").value, "Pasted capture")) $("paste-dialog").close();
};
$("export-csv").onclick = () =>
  download(exportCsv(filtered), "logbook-events.csv", "text/csv;charset=utf-8");
$("export-report").onclick = () =>
  download(
    investigationReport(filtered, source),
    "logbook-investigation.md",
    "text/markdown;charset=utf-8",
  );
document
  .querySelectorAll("[data-close]")
  .forEach(
    (button) => (button.onclick = () => $(button.dataset.close).close()),
  );
document.querySelectorAll("dialog").forEach(
  (dialog) =>
    (dialog.onclick = (e) => {
      if (e.target === dialog) dialog.close();
    }),
);
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) &&
    !document.querySelector("dialog[open]")
  ) {
    e.preventDefault();
    $("search").focus();
  }
});
document.addEventListener("dragenter", (e) => {
  if ([...e.dataTransfer.types].includes("Files")) {
    e.preventDefault();
    dragDepth++;
    $("drop-overlay").hidden = false;
  }
});
document.addEventListener("dragover", (e) => {
  if ([...e.dataTransfer.types].includes("Files")) e.preventDefault();
});
document.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $("drop-overlay").hidden = true;
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  $("drop-overlay").hidden = true;
  importFile(e.dataTransfer.files[0]);
});
try {
  const response = await fetch("demo.jsonl");
  if (!response.ok) throw new Error();
  load(await response.text(), "integration-events.jsonl", true);
} catch {
  error(
    "The fixture could not be loaded. Open a capture or paste JSONL to begin.",
  );
  render();
}
