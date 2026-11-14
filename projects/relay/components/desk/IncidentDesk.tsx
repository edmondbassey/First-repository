"use client";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Search,
  X,
  Download,
  Activity,
  Check,
  Clock,
  ArrowLeft,
  Radio,
  GitBranch,
} from "lucide-react";
import { api, ApiError } from "@/lib/client";
import {
  STATUSES,
  PRIORITIES,
  OWNERS,
  LABELS,
  TRANSITIONS,
  attention,
  safeCsv,
} from "@/lib/domain";
import type { Ticket, TicketEvent } from "@/lib/domain";
import {
  RUNBOOKS,
  KIND_LABELS,
  INCIDENT_KINDS,
  SERVICES,
  ENVIRONMENTS,
  IMPACTS,
} from "@/lib/incidents";
import type { CheckState, IncidentKind } from "@/lib/incidents";
type Detail = { ticket: Ticket; events: TicketEvent[]; checks: CheckState[] };
function time(iso: string) {
  return (
    new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC"
  );
}
function elapsed(iso: string) {
  const m = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));
  return m < 1
    ? "now"
    : m < 60
      ? m + "m"
      : m < 1440
        ? Math.floor(m / 60) + "h"
        : Math.floor(m / 1440) + "d";
}
const two = (n: number) => String(n).padStart(2, "0");
const initial = (s: string) =>
  s
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
function exportText(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function NewCase({
  onClose,
  onCreate,
  busy,
  error,
}: {
  onClose: () => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="case-modal"
      aria-labelledby="new-case-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <span className="mono eyebrow">FILE A NEW CASE</span>
          <h2 id="new-case-title">Start with the evidence.</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close new case"
        >
          <X size={22} />
        </button>
      </div>
      <form onSubmit={onCreate} className="new-case-form">
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <label>
          What failed?
          <input
            name="subject"
            placeholder="e.g. Webhook retries create duplicate records"
            minLength={3}
            maxLength={140}
            required
          />
        </label>
        <div className="form-grid">
          <label>
            Incident type
            <select name="incident_kind">
              {INCIDENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Service
            <select name="service">
              {SERVICES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Environment
            <select name="environment">
              {ENVIRONMENTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Impact
            <select name="impact">
              {IMPACTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select name="priority" defaultValue="high">
              {PRIORITIES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Request or delivery ID
            <input name="request_id" maxLength={120} placeholder="req_6a41" />
          </label>
        </div>
        <label>
          Evidence & reproduction
          <textarea
            name="body"
            placeholder="Observed response, affected operation, steps to reproduce and what you expected."
            minLength={10}
            maxLength={5000}
            rows={4}
            required
          />
        </label>
        <div className="form-footer">
          <span>Use fictional data. Keep credentials out of case notes.</span>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Create case"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </dialog>
  );
}
export default function IncidentDesk() {
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [creating, setCreating] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [query, setQuery] = useState(""),
    [service, setService] = useState("all"),
    [queue, setQueue] = useState("active"),
    [panel, setPanel] = useState("evidence"),
    [mobileCase, setMobileCase] = useState(false);
  const init = useRef<Promise<unknown> | null>(null),
    sequence = useRef(0);
  async function openCase(id: string) {
    const request = ++sequence.current;
    setError("");
    try {
      const data = await api<Detail>("/api/tickets/" + id);
      if (request === sequence.current) {
        setDetail(data);
        setPanel("evidence");
        setNote("");
        setMobileCase(true);
      }
    } catch (e) {
      if (request === sequence.current) setError((e as Error).message);
    }
  }
  async function refresh() {
    const data = await api<{ tickets: Ticket[] }>("/api/tickets");
    setTickets(data.tickets);
    return data.tickets;
  }
  useEffect(() => {
    let live = true;
    init.current ??= api("/api/session", { method: "POST" });
    init.current
      .then(() => api<{ tickets: Ticket[] }>("/api/tickets"))
      .then(async (data) => {
        if (!live) return;
        setTickets(data.tickets);
        const first = [...data.tickets]
          .sort(
            (a, b) =>
              PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority),
          )
          .find((t) => t.status !== "resolved");
        if (first) {
          const d = await api<Detail>("/api/tickets/" + first.id);
          if (live) setDetail(d);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("case-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const active = tickets.filter((t) => t.status !== "resolved"),
    resolved = tickets.length - active.length;
  const visible = tickets
    .filter(
      (t) =>
        (queue === "all" ||
          (queue === "active" && t.status !== "resolved") ||
          (queue === "resolved" && t.status === "resolved") ||
          (queue === "mine" && t.owner === "Edmond Bassey") ||
          (queue === "attention" && attention(t))) &&
        (service === "all" || t.service === service) &&
        [t.subject, t.service, t.request_id, t.body, "RLY-" + t.number]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority) ||
        b.updated_at.localeCompare(a.updated_at),
    );
  async function mutate(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409 && detail) {
        setDetail(await api<Detail>("/api/tickets/" + detail.ticket.id));
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  function update(patch: Partial<Ticket>) {
    if (!detail) return;
    mutate(async () => {
      const t = detail.ticket;
      const data = await api<Detail>("/api/tickets/" + t.id, {
        method: "PATCH",
        body: JSON.stringify({
          version: t.version,
          status: t.status,
          priority: t.priority,
          owner: t.owner,
          ...patch,
        }),
      });
      setDetail(data);
      await refresh();
    });
  }
  function checkStep(key: string, checked: boolean) {
    if (!detail) return;
    mutate(async () => {
      const data = await api<{ checks: CheckState[]; events: TicketEvent[] }>(
        "/api/tickets/" + detail.ticket.id + "/checks/" + key,
        { method: "PUT", body: JSON.stringify({ checked }) },
      );
      setDetail({ ...detail, ...data });
    });
  }
  function addNote(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    mutate(async () => {
      const data = await api<{ events: TicketEvent[] }>(
        "/api/tickets/" + detail.ticket.id + "/notes",
        { method: "POST", body: JSON.stringify({ message: note }) },
      );
      setDetail({ ...detail, events: data.events });
      setNote("");
    });
  }
  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    mutate(async () => {
      const data = await api<{ ticket: Ticket }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          requester_name: "Demo operator",
          requester_email: "operator@example.com",
          category:
            values.incident_kind === "identity"
              ? "Account access"
              : "Bug report",
        }),
      });
      await refresh();
      setCreating(false);
      await openCase(data.ticket.id);
    });
  }
  async function handoff() {
    if (!detail) return;
    mutate(async () => {
      const response = await fetch(
        "/api/tickets/" + detail.ticket.id + "/handoff",
      );
      if (!response.ok) throw new Error("The handoff could not be exported.");
      exportText(
        await response.text(),
        "relay-" + detail.ticket.number + "-handoff.md",
        "text/markdown;charset=utf-8",
      );
    });
  }
  const ticket = detail?.ticket,
    runbook = ticket
      ? (RUNBOOKS[ticket.incident_kind] ?? RUNBOOKS.webhook)
      : [],
    completed = detail
      ? runbook.filter((step) =>
          detail.checks.some((c) => c.check_key === step.id && c.checked),
        ).length
      : 0;
  return (
    <div className={"relay " + (mobileCase ? "show-case" : "")}>
      <a className="skip" href="#desk">
        Skip to incident desk
      </a>
      <header className="masthead">
        <a href="/" className="wordmark">
          <span className="brand-symbol">
            <GitBranch size={21} />
          </span>
          relay<span className="brand-index mono">/ 01</span>
        </a>
        <div className="masthead-center mono">
          <span className="dot blue" />
          INTEGRATION OPERATIONS
        </div>
        <div className="masthead-right">
          <a
            href="https://github.com/edmondbassey/First-repository/tree/main/projects/relay"
            target="_blank"
            rel="noreferrer"
          >
            Source <ArrowUpRight size={14} />
          </a>
          <span className="operator-avatar">EB</span>
        </div>
      </header>
      <div className="workspace">
        <aside className="rail">
          <span className="rail-label mono">WORKSPACE</span>
          <button
            className={
              queue === "active" ? "rail-button active" : "rail-button"
            }
            onClick={() => {
              setQueue("active");
              setMobileCase(false);
            }}
            title="Active cases"
          >
            <Radio size={20} />
            <span>Active</span>
            <b>{two(active.length)}</b>
          </button>
          <button
            className={queue === "mine" ? "rail-button active" : "rail-button"}
            onClick={() => {
              setQueue("mine");
              setMobileCase(false);
            }}
            title="Assigned to me"
          >
            <span className="rail-initials">EB</span>
            <span>Assigned</span>
          </button>
          <button
            className={
              queue === "attention" ? "rail-button active" : "rail-button"
            }
            onClick={() => {
              setQueue("attention");
              setMobileCase(false);
            }}
            title="Needs attention"
          >
            <Clock size={20} />
            <span>Attention</span>
            <b>{two(tickets.filter((t) => attention(t)).length)}</b>
          </button>
          <button
            className={
              queue === "resolved" ? "rail-button active" : "rail-button"
            }
            onClick={() => {
              setQueue("resolved");
              setMobileCase(false);
            }}
            title="Resolved cases"
          >
            <Check size={20} />
            <span>Resolved</span>
          </button>
          <div className="rail-foot mono">
            FIELD
            <br />
            NOTES
            <br />
            <span>2026</span>
          </div>
        </aside>
        <main id="desk" className="desk">
          <section className="hero">
            <div>
              <p className="kicker mono">A FIELD DESK FOR THINGS THAT BREAK</p>
              <h1>
                Integration
                <br />
                <em>incident desk.</em>
              </h1>
              <p className="hero-copy">
                Failed deliveries. Broken imports. A clear trail
                <br className="desktop-break" /> from the first signal to the
                final handoff.
              </p>
            </div>
            <div className="hero-side">
              <span className="mono hero-status">
                <span className="dot orange" />{" "}
                {loading ? "LOADING CASES" : "DEMO WORKSPACE"}
              </span>
              <div className="hero-number">
                {loading ? "—" : two(active.length)}
                <span>
                  active
                  <br />
                  cases
                </span>
              </div>
              <button
                className="button primary"
                disabled={loading}
                onClick={() => {
                  setError("");
                  setCreating(true);
                }}
              >
                <Plus size={16} />
                New incident
              </button>
            </div>
          </section>
          <div className="case-strip mono">
            <span>
              <b>
                {two(tickets.filter((t) => t.status === "in_progress").length)}
              </b>{" "}
              INVESTIGATING
            </span>
            <span>
              <b>{two(tickets.filter((t) => t.status === "pending").length)}</b>{" "}
              AWAITING EVIDENCE
            </span>
            <span>
              <b>{two(resolved)}</b> RESOLVED
            </span>
            <span className="strip-note">
              Fictional incidents · Changes are saved
            </span>
          </div>
          {error && !creating && (
            <div className="error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          <div className="workbench">
            <section className="queue">
              <div className="section-head">
                <h2 className="mono">
                  {queue === "resolved"
                    ? "CLOSED CASES"
                    : queue === "mine"
                      ? "YOUR CASES"
                      : queue === "attention"
                        ? "NEEDS ATTENTION"
                        : "CASE QUEUE"}
                  <span>{two(visible.length)}</span>
                </h2>
                <button
                  className="text-button mono"
                  onClick={() => {
                    setQueue(queue === "all" ? "active" : "all");
                    setMobileCase(false);
                  }}
                >
                  {queue === "all" ? "Active only" : "View all"}
                  <ArrowUpRight size={13} />
                </button>
              </div>
              <div className="queue-filters">
                <label className="search-box">
                  <Search size={15} />
                  <input
                    id="case-search"
                    aria-label="Search cases"
                    placeholder="Search case, service, request ID…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <kbd>⌘K</kbd>
                </label>
                <select
                  aria-label="Filter by service"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                >
                  <option value="all">All services</option>
                  {SERVICES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="queue-list">
                {loading ? (
                  <div className="queue-empty">Opening your field desk…</div>
                ) : visible.length ? (
                  visible.map((t) => (
                    <button
                      key={t.id}
                      className={
                        "case-row " + (ticket?.id === t.id ? "selected" : "")
                      }
                      onClick={() => openCase(t.id)}
                    >
                      <div className="case-row-top mono">
                        <span>RLY-{t.number}</span>
                        <span className={"severity " + t.priority}>
                          <i />
                          {t.priority === "urgent"
                            ? "P1"
                            : t.priority === "high"
                              ? "P2"
                              : t.priority === "normal"
                                ? "P3"
                                : "P4"}
                        </span>
                        <time>{elapsed(t.updated_at)}</time>
                      </div>
                      <h3>{t.subject}</h3>
                      <p>
                        {t.service}
                        <span> / </span>
                        {t.environment}
                      </p>
                      <div className="case-row-bottom">
                        <span className={"state " + t.status}>
                          <i />
                          {LABELS[t.status]}
                        </span>
                        <span className="assignee" title={t.owner}>
                          {t.owner === "Unassigned" ? "—" : initial(t.owner)}
                        </span>
                        <ChevronRight size={15} />
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="queue-empty">
                    <Search size={24} />
                    <h3>No matching cases.</h3>
                    <p>Try a service or request ID.</p>
                    <button
                      className="text-button"
                      onClick={() => {
                        setQuery("");
                        setService("all");
                        setQueue("all");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </div>
              <div className="queue-footer mono">
                {visible.length} CASES IN THIS VIEW
                <button
                  aria-label="Export case queue"
                  title="Export case queue"
                  onClick={() =>
                    exportText(
                      safeCsv([
                        [
                          "Case",
                          "Subject",
                          "Service",
                          "Environment",
                          "Status",
                          "Owner",
                        ],
                        ...visible.map((t) => [
                          "RLY-" + t.number,
                          t.subject,
                          t.service,
                          t.environment,
                          t.status,
                          t.owner,
                        ]),
                      ]),
                      "relay-case-queue.csv",
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  <Download size={14} />
                </button>
              </div>
            </section>
            <aside className="case-file" aria-label="Selected incident">
              {detail && ticket ? (
                <>
                  <div className="file-top">
                    <button
                      className="mobile-back text-button"
                      onClick={() => setMobileCase(false)}
                    >
                      <ArrowLeft size={15} />
                      Case queue
                    </button>
                    <span className="mono">
                      CASE FILE / RLY-{ticket.number}
                    </span>
                    <button
                      className="text-button mono"
                      onClick={handoff}
                      disabled={busy}
                    >
                      <Download size={14} />
                      Export handoff
                    </button>
                  </div>
                  <div className="file-heading">
                    <div className="file-tags mono">
                      <span className={"severity " + ticket.priority}>
                        {ticket.priority === "urgent"
                          ? "P1 / URGENT"
                          : ticket.priority === "high"
                            ? "P2 / HIGH"
                            : ticket.priority === "normal"
                              ? "P3 / NORMAL"
                              : "P4 / LOW"}
                      </span>
                      <span>{ticket.environment}</span>
                    </div>
                    <h2>{ticket.subject}</h2>
                    <div className="file-service">
                      <GitBranch size={15} />
                      {ticket.service}
                      <span>{ticket.impact}</span>
                    </div>
                  </div>
                  <div className="case-controls">
                    <label>
                      Status
                      <select
                        disabled={busy}
                        value={ticket.status}
                        onChange={(e) =>
                          update({ status: e.target.value as Ticket["status"] })
                        }
                      >
                        {[ticket.status, ...TRANSITIONS[ticket.status]].map(
                          (s) => (
                            <option key={s} value={s}>
                              {LABELS[s]}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      Owner
                      <select
                        disabled={busy}
                        value={ticket.owner}
                        onChange={(e) => update({ owner: e.target.value })}
                      >
                        {OWNERS.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Priority
                      <select
                        disabled={busy}
                        value={ticket.priority}
                        onChange={(e) =>
                          update({
                            priority: e.target.value as Ticket["priority"],
                          })
                        }
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div
                    className="file-tabs"
                    role="group"
                    aria-label="Case file view"
                  >
                    <button
                      className={panel === "evidence" ? "active" : ""}
                      aria-pressed={panel === "evidence"}
                      onClick={() => setPanel("evidence")}
                    >
                      Evidence & runbook
                    </button>
                    <button
                      className={panel === "history" ? "active" : ""}
                      aria-pressed={panel === "history"}
                      onClick={() => setPanel("history")}
                    >
                      Case history<span>{detail.events.length}</span>
                    </button>
                  </div>
                  {panel === "evidence" ? (
                    <div className="file-content">
                      <section className="evidence">
                        <div className="section-label mono">
                          <span>01 / OBSERVED BEHAVIOUR</span>
                          <Radio size={14} />
                        </div>
                        <p>{ticket.body}</p>
                        <div className="request-line mono">
                          <span>REQUEST ID</span>
                          <code>{ticket.request_id || "Not recorded"}</code>
                        </div>
                      </section>
                      <section className="runbook">
                        <div className="section-label mono">
                          <span>
                            02 /{" "}
                            {KIND_LABELS[ticket.incident_kind] ??
                              "INVESTIGATION"}
                          </span>
                          <b>
                            {completed}/{runbook.length}
                          </b>
                        </div>
                        <div className="runbook-progress">
                          <span
                            style={{
                              width: (completed / runbook.length) * 100 + "%",
                            }}
                          />
                        </div>
                        {runbook.map((step, index) => (
                          <label className="runbook-step" key={step.id}>
                            <input
                              type="checkbox"
                              checked={detail.checks.some(
                                (c) => c.check_key === step.id && !!c.checked,
                              )}
                              disabled={busy}
                              onChange={(e) =>
                                checkStep(step.id, e.target.checked)
                              }
                            />
                            <span className="step-number mono">
                              {two(index + 1)}
                            </span>
                            <div>
                              <strong>{step.label}</strong>
                              <p>{step.why}</p>
                            </div>
                          </label>
                        ))}
                      </section>
                      <div className="handoff-callout">
                        <span className="handoff-symbol">
                          <ArrowUpRight size={25} />
                        </span>
                        <div>
                          <strong>Leave the next person a clear trail.</strong>
                          <p>
                            Export the evidence, completed checks and case
                            history in one handoff.
                          </p>
                        </div>
                        <button
                          onClick={handoff}
                          disabled={busy}
                          aria-label="Download investigation handoff"
                        >
                          <Download size={18} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="history">
                      {detail.events.map((event, index) => (
                        <article className="history-event" key={event.id}>
                          <span className="history-number mono">
                            {two(index + 1)}
                          </span>
                          <div>
                            <div className="history-title">
                              <strong>
                                {event.kind === "created"
                                  ? "Case opened"
                                  : event.kind === "investigation"
                                    ? "Investigation updated"
                                    : event.kind === "note"
                                      ? "Field note"
                                      : "Case updated"}
                              </strong>
                              <time className="mono">
                                {time(event.created_at)}
                              </time>
                            </div>
                            <p>{event.message}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  <form className="field-note" onSubmit={addNote}>
                    <label htmlFor="field-note" className="mono">
                      ADD A FIELD NOTE
                    </label>
                    <textarea
                      id="field-note"
                      maxLength={3000}
                      required
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="What did you find? Record the evidence and the next action."
                    />
                    <div>
                      <span>Internal record. No email is sent.</span>
                      <button
                        className="button dark small"
                        disabled={busy || !note.trim()}
                      >
                        {busy ? "Saving…" : "Save note"}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </form>
                  <footer className="file-footer mono">
                    <span>OPENED {time(ticket.created_at)}</span>
                    <span>VERSION {ticket.version}</span>
                  </footer>
                </>
              ) : (
                <div className="file-empty">
                  <Activity size={30} />
                  <h2>Select a case.</h2>
                  <p>The investigation starts with a good record.</p>
                </div>
              )}
            </aside>
          </div>
          <footer className="desk-footer">
            <span className="mono">RELAY / INTEGRATION INCIDENT DESK</span>
            <span>Follow the evidence. Keep the context.</span>
          </footer>
        </main>
      </div>
      {creating && (
        <NewCase
          onClose={() => {
            setCreating(false);
            setError("");
          }}
          onCreate={create}
          busy={busy}
          error={error}
        />
      )}
    </div>
  );
}
