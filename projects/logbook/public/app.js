import {
  parseLogs,
  filterRecords,
  summarize,
  endpoints,
  timeline,
  exportCsv,
  MAX_BYTES,
} from "./analyzer.js";
const $ = (id) => document.getElementById(id);
let records = [],
  issues = [],
  filtered = [],
  page = 0,
  selected = null,
  source = "demo.jsonl",
  dragDepth = 0;
const PAGE_SIZE = 25,
  filters = { query: "", service: "all", level: "all" };
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function formatTime(iso) {
  return iso ? new Date(iso).toISOString().slice(11, 23) : "Unknown";
}
function error(message) {
  $("error").textContent = message;
  $("error").hidden = !message;
}
function close(id) {
  $(id).close();
}
function reset() {
  filters.query = "";
  filters.service = "all";
  filters.level = "all";
  $("search").value = "";
  $("service").value = "all";
  $("other-level").value = "all";
  page = 0;
  render();
}
function load(text, name, isSample = false) {
  try {
    const result = parseLogs(text);
    if (!result.records.length)
      throw new Error(
        result.issues.length
          ? "No readable events. Use one JSON object per line, with a message or msg field."
          : "This file has no events.",
      );
    records = result.records;
    issues = result.issues;
    source = name;
    error("");
    $("source-name").textContent = name;
    $("source-type").textContent = isSample ? "SAMPLE" : "LOCAL";
    $("source-info").textContent =
      records.length.toLocaleString() +
      " readable events · " +
      result.totalLines.toLocaleString() +
      " lines";
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
            " line" +
            (issues.length === 1 ? " was" : "s were") +
            " skipped.",
        ),
      );
      const button = el("button", "text-button", "Review import issues →");
      button.onclick = () => {
        const list = $("issues-list");
        list.replaceChildren();
        for (const issue of issues.slice(0, 100)) {
          const li = el("li", "");
          li.append(
            el("strong", "", "Line " + issue.line),
            el("span", "", issue.reason),
          );
          list.append(li);
        }
        if (issues.length > 100)
          list.append(el("li", "", "Showing the first 100 issues."));
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
    all = summarize(filterRecords(records, { ...filters, level: "all" }));
  $("metric-events").textContent = summary.count.toLocaleString();
  $("metric-errors").textContent = summary.errors.toLocaleString();
  $("metric-error-rate").textContent =
    summary.errorRate.toFixed(1) + "% of filtered events";
  $("metric-p95").replaceChildren(
    el("span", "", summary.p95 === null ? "—" : summary.p95.toLocaleString()),
    el("em", "", summary.p95 === null ? "" : "ms"),
  );
  $("metric-duration-count").textContent =
    summary.durationCount + " measured events";
  $("metric-services").textContent = summary.services;
  $("view-count").textContent = summary.count.toLocaleString();
  $("metric-events-note").textContent =
    filters.query || filters.level !== "all" || filters.service !== "all"
      ? "Filtered from " + records.length + " total"
      : "All readable events";
  for (const level of ["all", "info", "warn", "error", "fatal"])
    $("count-" + level).textContent =
      level === "all" ? all.count : all.counts[level];
  document.querySelectorAll("[data-level]").forEach((button) => {
    const chosen = button.dataset.level === filters.level;
    button.classList.toggle("selected", chosen);
    button.setAttribute("aria-pressed", String(chosen));
  });
  $("other-level").value = ["debug", "trace", "unknown"].includes(filters.level)
    ? filters.level
    : "all";
  const series = timeline(filtered),
    chart = $("timeline");
  chart.replaceChildren();
  chart.setAttribute(
    "aria-label",
    summary.count +
      " events shown across time; " +
      summary.errors +
      " error events.",
  );
  if (series.bins.length) {
    const max = Math.max(1, ...series.bins.map((b) => b.count));
    series.bins.forEach((bin) => {
      const column = el("div", "bar-column"),
        bar = el("div", "bar"),
        err = el("div", "bar-errors");
      bar.style.height = Math.max(2, (bin.count / max) * 100) + "%";
      bar.title = bin.count + " events, " + bin.errors + " errors";
      err.style.height = (bin.count ? (bin.errors / bin.count) * 100 : 0) + "%";
      bar.append(err);
      column.append(bar);
      chart.append(column);
    });
    $("timeline-start").textContent =
      new Date(series.start).toISOString().replace("T", " ").slice(0, 19) +
      " UTC";
    $("timeline-end").textContent =
      new Date(series.end).toISOString().slice(11, 19) + " UTC";
  } else {
    chart.append(el("p", "chart-empty", "No timestamped events in this view."));
    $("timeline-start").textContent = "";
    $("timeline-end").textContent = "";
  }
  const endpointList = $("endpoints");
  endpointList.replaceChildren();
  const groups = endpoints(filtered).slice(0, 4);
  for (const group of groups) {
    const button = el("button", "endpoint-row"),
      left = el("div", ""),
      count = el("span", "endpoint-count", group.errors);
    left.append(
      el("code", "", group.path),
      el(
        "small",
        "",
        group.count +
          " requests · p95 " +
          (group.p95 === null ? "—" : group.p95 + " ms"),
      ),
    );
    button.append(left, count);
    button.title = "Filter by " + group.path;
    button.onclick = () => {
      $("search").value = group.path;
      filters.query = group.path;
      page = 0;
      render();
    };
    endpointList.append(button);
  }
  if (!groups.length)
    endpointList.append(
      el("p", "endpoint-empty", "Events with a path field appear here."),
    );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  page = Math.min(page, totalPages - 1);
  const rows = $("event-rows");
  rows.replaceChildren();
  for (const record of filtered.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE,
  )) {
    const row = el("tr", ""),
      time = el("td", "event-time", formatTime(record.timestamp)),
      level = el("td", ""),
      service = el("td", ""),
      message = el("td", "message-cell"),
      duration = el(
        "td",
        "duration",
        record.duration === null ? "—" : record.duration + " ms",
      ),
      open = el("td", "");
    level.append(el("span", "level level-" + record.level, record.level));
    service.append(el("span", "service-name", record.service));
    const button = el("button", "message-button", record.message);
    button.onclick = () => showEvent(record);
    button.setAttribute(
      "aria-label",
      "Inspect line " + record.line + ": " + record.message,
    );
    message.append(button);
    if (record.requestId)
      message.append(el("small", "request-id", record.requestId));
    const arrow = el("button", "row-open", "↗");
    arrow.setAttribute("aria-label", "Open event on line " + record.line);
    arrow.onclick = () => showEvent(record);
    open.append(arrow);
    row.append(time, level, service, message, duration, open);
    rows.append(row);
  }
  $("empty").hidden = filtered.length > 0;
  $("page-info").textContent = filtered.length
    ? "Showing " +
      (page * PAGE_SIZE + 1) +
      "–" +
      Math.min((page + 1) * PAGE_SIZE, filtered.length) +
      " of " +
      filtered.length +
      " events"
    : "0 events";
  $("page-number").textContent = page + 1 + " / " + totalPages;
  $("prev").disabled = page === 0;
  $("next").disabled = page + 1 >= totalPages;
  $("export").disabled = !filtered.length;
}
function showEvent(record) {
  selected = record;
  $("event-title").textContent = record.message;
  $("event-meta").replaceChildren(
    el("span", "level level-" + record.level, record.level),
    el("span", "service-name", record.service),
  );
  const properties = $("event-properties");
  properties.replaceChildren();
  for (const [key, value] of [
    ["Source line", record.line],
    ["Timestamp", record.timestamp ?? "Not supplied"],
    ["Service", record.service],
    ["HTTP status", record.status ?? "Not supplied"],
    [
      "Latency",
      record.duration === null ? "Not supplied" : record.duration + " ms",
    ],
    ["Request ID", record.requestId || "Not supplied"],
    ["Path", record.path || "Not supplied"],
  ])
    properties.append(el("dt", "", key), el("dd", "", value));
  $("raw-json").textContent = JSON.stringify(record.raw, null, 2);
  $("copy-status").textContent = "";
  $("copy-json").textContent = "Copy JSON";
  $("event-dialog").showModal();
}
async function importFile(file) {
  if (!file) return;
  if (file.size > MAX_BYTES) {
    error("Choose a file smaller than 2 MB.");
    return;
  }
  try {
    load(await file.text(), file.name);
  } catch {
    error("This file could not be read.");
  }
}
$("import-side").onclick = $("import-main").onclick = () =>
  $("file-input").click();
$("file-input").onchange = async (event) => {
  await importFile(event.target.files[0]);
  event.target.value = "";
};
$("search").oninput = (event) => {
  filters.query = event.target.value;
  page = 0;
  render();
};
$("service").onchange = (event) => {
  filters.service = event.target.value;
  page = 0;
  render();
};
document.querySelectorAll("[data-level]").forEach(
  (button) =>
    (button.onclick = () => {
      filters.level = button.dataset.level;
      page = 0;
      render();
    }),
);
$("other-level").onchange = (event) => {
  filters.level = event.target.value;
  page = 0;
  render();
};
$("try-errors").onclick = () => {
  filters.level = "error";
  page = 0;
  render();
};
$("prev").onclick = () => {
  page--;
  render();
};
$("next").onclick = () => {
  page++;
  render();
};
$("reset-filters").onclick = $("empty-reset").onclick = reset;
$("paste-open").onclick = () => $("paste-dialog").showModal();
$("paste-form").onsubmit = (event) => {
  event.preventDefault();
  if (load($("paste-text").value, "Pasted logs")) close("paste-dialog");
};
document
  .querySelectorAll("[data-close]")
  .forEach((button) => (button.onclick = () => close(button.dataset.close)));
document.querySelectorAll("dialog").forEach(
  (dialog) =>
    (dialog.onclick = (event) => {
      if (event.target === dialog) dialog.close();
    }),
);
$("copy-json").onclick = async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(selected.raw, null, 2));
    $("copy-json").textContent = "Copied";
    $("copy-status").textContent = "JSON copied.";
  } catch {
    $("copy-status").textContent =
      "Copy is unavailable. Select and copy the raw event below.";
  }
};
$("export").onclick = () => {
  const blob = new Blob([exportCsv(filtered)], {
      type: "text/csv;charset=utf-8;",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "logbook-filtered-events.csv";
  a.click();
  URL.revokeObjectURL(url);
};
document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) &&
    !document.querySelector("dialog[open]")
  ) {
    event.preventDefault();
    $("search").focus();
  }
});
document.addEventListener("dragenter", (event) => {
  if ([...event.dataTransfer.types].includes("Files")) {
    event.preventDefault();
    dragDepth++;
    $("drop-overlay").hidden = false;
  }
});
document.addEventListener("dragover", (event) => {
  if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
});
document.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $("drop-overlay").hidden = true;
});
document.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  $("drop-overlay").hidden = true;
  importFile(event.dataTransfer.files[0]);
});
try {
  const response = await fetch("demo.jsonl");
  if (!response.ok) throw new Error();
  load(await response.text(), "demo.jsonl", true);
} catch {
  error(
    "The sample file could not be loaded. Import a file or paste logs to begin.",
  );
  render();
}
