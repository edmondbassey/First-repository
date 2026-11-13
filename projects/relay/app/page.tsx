"use client";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Inbox,
  Search,
  Plus,
  ChevronRight,
  ArrowUpRight,
  MessageSquare,
  Clock,
  CheckCircle2,
  Circle,
  PauseCircle,
  Download,
  Activity,
  LifeBuoy,
  X,
  Send,
  RefreshCw,
  AlertTriangle,
  User,
  Layers,
  ArrowRight,
  Check,
} from "lucide-react";
import {
  STATUSES,
  PRIORITIES,
  CATEGORIES,
  OWNERS,
  LABELS,
  TRANSITIONS,
  attention,
  summarize,
  safeCsv,
} from "@/lib/domain";
import type { Ticket, TicketEvent, Status } from "@/lib/domain";
type View = "inbox" | "mine" | "attention" | "activity";
class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const r = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  let data: unknown;
  try {
    data = await r.json();
  } catch {
    throw new Error("The service could not be reached. Try again.");
  }
  if (!r.ok) {
    const message =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string"
        ? data.error
        : "Request failed.";
    throw new ApiError(message, r.status);
  }
  return data as T;
}
const initials = (name: string) =>
  name
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2);
function age(iso: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(iso)) / 60000),
  );
  return minutes < 1
    ? "Just now"
    : minutes < 60
      ? minutes + "m ago"
      : minutes < 1440
        ? Math.floor(minutes / 60) + "h ago"
        : Math.floor(minutes / 1440) + "d ago";
}
function StatusIcon({ status }: { status: Status }) {
  const Icon =
    status === "resolved"
      ? CheckCircle2
      : status === "pending"
        ? PauseCircle
        : status === "in_progress"
          ? Clock
          : Circle;
  return <Icon size={14} />;
}
function Badge({ status }: { status: Status }) {
  return (
    <span className={"status status-" + status}>
      <StatusIcon status={status} />
      {LABELS[status]}
    </span>
  );
}
function Dialog({
  children,
  title,
  onClose,
  drawer = false,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={drawer ? "dialog drawer" : "dialog modal"}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-inner">{children}</div>
    </dialog>
  );
}
export default function Home() {
  const [tickets, setTickets] = useState<Ticket[]>([]),
    [view, setView] = useState<View>("inbox"),
    [tab, setTab] = useState("all"),
    [query, setQuery] = useState(""),
    [priority, setPriority] = useState("all"),
    [sort, setSort] = useState("updated");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Ticket | null>(null),
    [events, setEvents] = useState<TicketEvent[]>([]),
    [allEvents, setAllEvents] = useState<TicketEvent[]>([]),
    [creating, setCreating] = useState(false),
    [note, setNote] = useState(""),
    [saved, setSaved] = useState(""),
    [help, setHelp] = useState(false);
  const init = useRef<Promise<unknown> | null>(null),
    newButton = useRef<HTMLButtonElement>(null);
  async function refresh() {
    const data = await api<{ tickets: Ticket[] }>("/api/tickets");
    setTickets(data.tickets);
    setSaved(
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    );
    return data.tickets as Ticket[];
  }
  useEffect(() => {
    let active = true;
    init.current ??= api("/api/session", { method: "POST" });
    init.current
      .then(() => api<{ tickets: Ticket[] }>("/api/tickets"))
      .then((d) => {
        if (active) {
          setTickets(d.tickets);
          setSaved(
            new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            }),
          );
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("ticket-search")?.focus();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  async function openTicket(id: string) {
    setError("");
    setBusy(true);
    try {
      const data = await api<{ ticket: Ticket; events: TicketEvent[] }>(
        "/api/tickets/" + id,
      );
      setSelected(data.ticket);
      setEvents(data.events);
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function change(patch: Partial<Ticket>) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<{ ticket: Ticket; events: TicketEvent[] }>(
        "/api/tickets/" + selected.id,
        {
          method: "PATCH",
          body: JSON.stringify({
            version: selected.version,
            status: selected.status,
            priority: selected.priority,
            owner: selected.owner,
            ...patch,
          }),
        },
      );
      setSelected(data.ticket);
      setEvents(data.events);
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const data = await api<{ ticket: Ticket; events: TicketEvent[] }>(
          "/api/tickets/" + selected.id,
        );
        setSelected(data.ticket);
        setEvents(data.events);
        await refresh();
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submitNote(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<{ events: TicketEvent[] }>(
        "/api/tickets/" + selected.id + "/notes",
        { method: "POST", body: JSON.stringify({ message: note }) },
      );
      setEvents(data.events);
      setNote("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      const response = await api<{ ticket: Ticket }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify(data),
      });
      await refresh();
      setCreating(false);
      setSelected(response.ticket);
      const detail = await api<{ ticket: Ticket; events: TicketEvent[] }>(
        "/api/tickets/" + response.ticket.id,
      );
      setEvents(detail.events);
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function selectView(next: View) {
    setView(next);
    setTab("all");
    setQuery("");
    setError("");
    if (next === "activity") {
      try {
        setAllEvents(
          (await api<{ events: TicketEvent[] }>("/api/activity")).events,
        );
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }
  const metrics = summarize(tickets);
  const base = tickets.filter((t) =>
    view === "mine"
      ? t.owner === "Edmond Bassey"
      : view === "attention"
        ? attention(t)
        : true,
  );
  const visible = base
    .filter(
      (t) =>
        (tab === "all" || t.status === tab) &&
        (priority === "all" || t.priority === priority) &&
        [t.subject, t.requester_name, t.requester_email, t.body, "#" + t.number]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "priority"
        ? PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority) ||
          b.updated_at.localeCompare(a.updated_at)
        : b.updated_at.localeCompare(a.updated_at),
    );
  function download() {
    const csv = safeCsv([
      [
        "Ticket",
        "Subject",
        "Customer",
        "Status",
        "Priority",
        "Owner",
        "Created",
      ],
      ...visible.map((t) => [
        t.number,
        t.subject,
        t.requester_name,
        LABELS[t.status],
        t.priority,
        t.owner,
        t.created_at,
      ]),
    ]);
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "relay-tickets.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  const titles = {
    inbox: "Support inbox",
    mine: "Assigned to you",
    attention: "Needs attention",
    activity: "Activity log",
  };
  return (
    <div className="app-shell">
      <a href="#main" className="skip">
        Skip to inbox
      </a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Relay home">
          <span className="brand-mark">
            <ArrowRight size={23} />
          </span>
          relay<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">
            <Layers size={17} />
          </span>
          <div>
            <strong>Acme workspace</strong>
            <small>Customer support</small>
          </div>
          <span className="workspace-chevron">⌄</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={view === "inbox" ? "nav-item active" : "nav-item"}
            onClick={() => selectView("inbox")}
          >
            <Inbox size={17} />
            All tickets<span>{tickets.length}</span>
          </button>
          <button
            className={view === "mine" ? "nav-item active" : "nav-item"}
            onClick={() => selectView("mine")}
          >
            <User size={17} />
            Assigned to me
            <span>
              {tickets.filter((t) => t.owner === "Edmond Bassey").length}
            </span>
          </button>
          <button
            className={view === "attention" ? "nav-item active" : "nav-item"}
            onClick={() => selectView("attention")}
          >
            <AlertTriangle size={17} />
            Needs attention
            <span className="attention-count">{metrics.attention}</span>
          </button>
          <button
            className={view === "activity" ? "nav-item active" : "nav-item"}
            onClick={() => selectView("activity")}
          >
            <Activity size={17} />
            Activity log
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="tip-card">
            <span className="tip-icon">
              <MessageSquare size={18} />
            </span>
            <strong>Make room for good support.</strong>
            <p>One inbox. A clear next step for every conversation.</p>
            <span className="tip-line" />
          </div>
          <button className="help-link" onClick={() => setHelp(true)}>
            <LifeBuoy size={17} />
            Quick guide
            <ArrowUpRight size={14} />
          </button>
          <div className="agent">
            <span className="avatar me">EB</span>
            <div>
              <strong>Edmond Bassey</strong>
              <small>
                <i />
                Available
              </small>
            </div>
            <span className="agent-tag">Agent</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={13} />
            <strong>{titles[view]}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <i />
              Demo workspace
            </span>
            <span className="avatar me tiny">EB</span>
          </div>
        </header>
        <main id="main" className="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">EVERY CONVERSATION COUNTS</div>
              <h1>
                {titles[view]}
                <span className="heading-dot">.</span>
              </h1>
              <p>Keep things moving. Give every customer a clear next step.</p>
            </div>
            <button
              ref={newButton}
              className="primary"
              onClick={() => {
                setError("");
                setCreating(true);
              }}
              disabled={loading}
            >
              <Plus size={17} />
              New ticket
            </button>
          </div>
          <div className="metrics" aria-label="Workspace summary">
            <div className="metric">
              <div>
                <span>Active tickets</span>
                <Inbox size={17} />
              </div>
              <strong>{loading ? "—" : metrics.active}</strong>
              <small>Open, in progress or waiting</small>
            </div>
            <div className="metric">
              <div>
                <span>Needs attention</span>
                <Clock size={17} />
              </div>
              <strong className="amber">
                {loading ? "—" : metrics.attention}
                <span className="metric-pill">Priority queue</span>
              </strong>
              <small>Urgent or past their target time</small>
            </div>
            <div className="metric">
              <div>
                <span>Resolved</span>
                <CheckCircle2 size={17} />
              </div>
              <strong>{loading ? "—" : metrics.resolved}</strong>
              <small>Conversations brought to a close</small>
            </div>
            <div className="metric">
              <div>
                <span>Avg. resolution</span>
                <Activity size={17} />
              </div>
              <strong>
                {loading || metrics.averageHours === null
                  ? "—"
                  : metrics.averageHours.toFixed(1)}
                <em>{metrics.averageHours !== null ? "hrs" : ""}</em>
              </strong>
              <small>From creation to resolution</small>
            </div>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={17} />
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={15} />
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading">
              <span className="loader" />
              Preparing your workspace…
            </div>
          ) : view === "activity" ? (
            <section className="activity-panel">
              <div className="section-heading">
                <h2>A clear record of every change</h2>
                <span>{allEvents.length} recent events</span>
              </div>
              {allEvents.map((event) => (
                <button
                  className="activity-row"
                  key={event.id}
                  onClick={() => openTicket(event.ticket_id)}
                >
                  <span
                    className={
                      "event-icon " + (event.kind === "note" ? "note-icon" : "")
                    }
                  >
                    <MessageSquare size={16} />
                  </span>
                  <div>
                    <strong>
                      #{event.number} · {event.subject}
                    </strong>
                    <p>{event.message}</p>
                  </div>
                  <time>{age(event.created_at)}</time>
                  <ChevronRight size={15} />
                </button>
              ))}
            </section>
          ) : (
            <>
              <section className="inbox-panel" aria-label="Ticket list">
                <div
                  className="tabs"
                  role="group"
                  aria-label="Filter by status"
                >
                  {["all", ...STATUSES].map((status) => (
                    <button
                      key={status}
                      aria-pressed={tab === status}
                      className={tab === status ? "selected" : ""}
                      onClick={() => setTab(status)}
                    >
                      {status === "all"
                        ? "All tickets"
                        : LABELS[status as Status]}
                      <span>
                        {status === "all"
                          ? base.length
                          : base.filter((t) => t.status === status).length}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="filters">
                  <label className="search">
                    <Search size={16} />
                    <input
                      id="ticket-search"
                      aria-label="Search tickets"
                      placeholder="Search tickets, customers or keywords…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    <kbd>⌘ K</kbd>
                  </label>
                  <label className="filter-select">
                    <span className="sr-only">Priority filter</span>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                    >
                      <option value="all">All priorities</option>
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p[0].toUpperCase() + p.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="filter-select">
                    <span className="sr-only">Sort tickets</span>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="updated">Recently updated</option>
                      <option value="priority">Highest priority</option>
                    </select>
                  </label>
                  <button
                    className="icon-button export"
                    onClick={download}
                    title="Export filtered tickets"
                    aria-label="Export filtered tickets"
                  >
                    <Download size={17} />
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th className="ticket-column">TICKET</th>
                        <th>CUSTOMER</th>
                        <th>STATUS</th>
                        <th>PRIORITY</th>
                        <th>ASSIGNEE</th>
                        <th>UPDATED</th>
                        <th>
                          <span className="sr-only">Open</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <button
                              className="ticket-title"
                              onClick={() => openTicket(t.id)}
                              disabled={busy}
                            >
                              <span>#{t.number}</span>
                              <strong>{t.subject}</strong>
                              <small>{t.category}</small>
                            </button>
                          </td>
                          <td>
                            <div className="customer">
                              <span
                                className={"avatar color-" + (t.number % 4)}
                              >
                                {initials(t.requester_name)}
                              </span>
                              <span>{t.requester_name}</span>
                            </div>
                          </td>
                          <td>
                            <Badge status={t.status} />
                          </td>
                          <td>
                            <span className={"priority priority-" + t.priority}>
                              <i />
                              {t.priority[0].toUpperCase() +
                                t.priority.slice(1)}
                            </span>
                          </td>
                          <td>
                            {t.owner === "Unassigned" ? (
                              <span className="unassigned">Unassigned</span>
                            ) : (
                              <span
                                className="avatar owner"
                                title={t.owner}
                                aria-label={t.owner}
                              >
                                {initials(t.owner)}
                              </span>
                            )}
                          </td>
                          <td className="muted time">{age(t.updated_at)}</td>
                          <td>
                            <button
                              className="row-open"
                              aria-label={"Open ticket " + t.number}
                              onClick={() => openTicket(t.id)}
                              disabled={busy}
                            >
                              <ChevronRight size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!visible.length && (
                  <div className="empty">
                    <Search size={28} />
                    <h2>No tickets here</h2>
                    <p>Try another search or clear your filters.</p>
                    <button
                      className="secondary"
                      onClick={() => {
                        setQuery("");
                        setTab("all");
                        setPriority("all");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    {visible.length} of {base.length} tickets
                  </span>
                  <span>
                    <span className="saved-dot" />
                    Saved · {saved}
                    <button
                      onClick={() => {
                        refresh().catch((e) => setError(e.message));
                      }}
                      aria-label="Refresh tickets"
                    >
                      <RefreshCw size={13} />
                    </button>
                  </span>
                </div>
              </section>
              <div className="bottom-caption">
                <span>
                  <span className="mini-logo">↗</span>A little clarity goes a
                  long way.
                </span>
                <span>Fictional customer data · Your changes are saved</span>
              </div>
            </>
          )}
        </main>
      </div>
      {selected && (
        <Dialog
          title={"Ticket " + selected.number}
          drawer
          onClose={() => {
            setSelected(null);
            setError("");
          }}
        >
          <div className="drawer-top">
            <span className="ticket-id">TICKET #{selected.number}</span>
            <button
              className="icon-button"
              aria-label="Close ticket"
              onClick={() => {
                setSelected(null);
                setError("");
              }}
            >
              <X size={20} />
            </button>
          </div>
          <div className="drawer-body">
            <Badge status={selected.status} />
            <h2>{selected.subject}</h2>
            <p className="drawer-sub">
              Created{" "}
              {new Date(selected.created_at).toLocaleDateString([], {
                month: "long",
                day: "numeric",
              })}{" "}
              · {selected.category}
            </p>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="ticket-properties">
              <label>
                Status
                <select
                  disabled={busy}
                  value={selected.status}
                  onChange={(e) => change({ status: e.target.value as Status })}
                >
                  {[selected.status, ...TRANSITIONS[selected.status]].map(
                    (s) => (
                      <option value={s} key={s}>
                        {LABELS[s]}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Priority
                <select
                  disabled={busy}
                  value={selected.priority}
                  onChange={(e) =>
                    change({ priority: e.target.value as Ticket["priority"] })
                  }
                >
                  {PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label className="full">
                Assigned to
                <select
                  disabled={busy}
                  value={selected.owner}
                  onChange={(e) => change({ owner: e.target.value })}
                >
                  {OWNERS.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
            </div>
            <article className="customer-message">
              <header>
                <span className="avatar color-2">
                  {initials(selected.requester_name)}
                </span>
                <div>
                  <strong>{selected.requester_name}</strong>
                  <small>{selected.requester_email}</small>
                </div>
                <span className="message-label">Customer</span>
              </header>
              <p>{selected.body}</p>
            </article>
            <div className="section-heading">
              <h3>Conversation history</h3>
              <span>{events.length} events</span>
            </div>
            <div className="timeline">
              {events.map((event) => (
                <div
                  className={
                    "timeline-item " +
                    (event.kind === "note" ? "internal-note" : "")
                  }
                  key={event.id}
                >
                  <span className="timeline-dot">
                    {event.kind === "note" ? (
                      <MessageSquare size={12} />
                    ) : (
                      <Check size={12} />
                    )}
                  </span>
                  <div>
                    <div className="event-top">
                      <strong>
                        {event.kind === "note"
                          ? "Internal note"
                          : event.kind === "created"
                            ? "Ticket created"
                            : "Ticket updated"}
                      </strong>
                      <time>{age(event.created_at)}</time>
                    </div>
                    <p>{event.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <form className="note-form" onSubmit={submitNote}>
            <label htmlFor="note">Add an internal note</label>
            <textarea
              id="note"
              maxLength={3000}
              placeholder="What should the next person know?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
            />
            <div>
              <span>Visible in this workspace. No email is sent.</span>
              <button className="primary small" disabled={busy || !note.trim()}>
                <Send size={14} />
                {busy ? "Saving…" : "Add note"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {creating && (
        <Dialog
          title="Create a ticket"
          onClose={() => {
            setCreating(false);
            setError("");
            newButton.current?.focus();
          }}
        >
          <div className="modal-heading">
            <div>
              <span className="eyebrow">START A CONVERSATION</span>
              <h2>Create a ticket</h2>
            </div>
            <button
              className="icon-button"
              onClick={() => setCreating(false)}
              aria-label="Close new ticket"
            >
              <X size={20} />
            </button>
          </div>
          <form className="new-form" onSubmit={create}>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-row">
              <label>
                Customer name
                <input
                  name="requester_name"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="e.g. Morgan Ellis"
                />
              </label>
              <label>
                Email address
                <input
                  name="requester_email"
                  type="email"
                  required
                  maxLength={254}
                  placeholder="morgan@example.com"
                />
              </label>
            </div>
            <label>
              Subject
              <input
                name="subject"
                required
                minLength={3}
                maxLength={140}
                placeholder="A short description of the issue"
              />
            </label>
            <label>
              Description
              <textarea
                name="body"
                required
                minLength={10}
                maxLength={5000}
                rows={4}
                placeholder="What happened, and what would help?"
              />
            </label>
            <div className="form-row">
              <label>
                Category
                <select name="category">
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select name="priority" defaultValue="normal">
                  {PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-footer">
              <span>Use fictional customer details in this demo.</span>
              <button className="primary" disabled={busy}>
                {busy ? "Creating…" : "Create ticket"}
                <ArrowRight size={15} />
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {help && (
        <Dialog title="Quick guide" onClose={() => setHelp(false)}>
          <div className="modal-heading">
            <h2>A quick look around</h2>
            <button
              className="icon-button"
              aria-label="Close guide"
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="guide">
            <p>
              This is your own demo workspace, with fictional customers and
              saved ticket records.
            </p>
            <ol>
              <li>
                <strong>Triage the inbox.</strong> Search, filter by status or
                priority, and open a ticket.
              </li>
              <li>
                <strong>Move the work forward.</strong> Change the assignee,
                update the priority or resolve an issue.
              </li>
              <li>
                <strong>Leave context.</strong> Add an internal note and see
                each update in the history.
              </li>
              <li>
                <strong>Make it your own.</strong> Create a ticket using
                fictional details, or export your filtered list.
              </li>
            </ol>
            <p className="muted">
              Targets: urgent 2 hours, high 24 hours, normal and low 72 hours.
              Closing this browser retains your workspace on this device for up
              to 30 days.
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}
