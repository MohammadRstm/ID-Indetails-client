import { useState } from "react";
import { useNavigate } from "react-router";
import type { Schemas } from "@/api/types";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useDomain } from "@/app/routing/domainContext";
import { canOpen } from "@/app/routing/routeTable";
import { Delta, ProfitBars, RankBars, StatusBar } from "@/shared/components/Charts/Bars";
import Columns from "@/shared/components/Charts/Columns";
import Figure from "@/shared/components/Charts/Figure";
import { ProjectTile, Signal } from "@/shared/components/Data/Bits";
import { Money } from "@/shared/components/Data/Money";
import { MarginPill } from "@/shared/components/Data/Pills";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { Avatars } from "@/shared/components/Identity/People";
import { money } from "@/shared/format/money";
import { companyToday, daysBetween, fmtDate, fmtDateY, fmtDur, fmtH, fmtMonthY, fmtNumber, isoWeek, MONTHS, pct } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { BillingMeter } from "../../shared/billing/BillingBits";
import type { FinanceBilling, FinanceClient, FinanceMonth, FinanceProjects } from "../../shared/finance/financeApi";
import { DeadlineTag, NameList } from "../../shared/requirements/Requirements";
import type { Followup } from "./followups";
import type { Overview } from "./overviewApi";
import { clickable } from "@/shared/utils/clickable";

export type ProjectInfo = { icon: string | null; tint: string | null; activity: number; targetDate: string | null };

/** Opens a page of the domain when the viewer may; otherwise leaves the row still. */
function useOpener() {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const domain = useDomain();
    return (path: string) => (canOpen(permissions, domain, path) ? () => navigate(`/${domain}/${path}`) : undefined);
}

const Tile = ({ info }: { info: ProjectInfo | undefined }) => <ProjectTile icon={info?.icon} tint={info?.tint} size="sm" />;
const monthLabel = (m: string) => MONTHS[+m.slice(5, 7) - 1];

/** "Hours logged per week": this period's weeks against the same weeks of the one before. */
export function HoursCard({ overview, label, prevLabel }: { overview: Overview | undefined; label: string; prevLabel: string }) {
    const o = overview;
    const weekly = o?.weekly ?? [];
    const data = weekly.map((w, i) => ({
        label: fmtDate(w.weekStart), tip: `Week of ${fmtDateY(w.weekStart)} (W${isoWeek(w.weekStart)})`,
        value: w.minutes / 60, ghost: (o?.previousWeekly[i]?.minutes ?? 0) / 60,
    }));
    return (
        <Figure title="Hours logged per week" sub={`Is the studio's output holding up? ${label} against ${prevLabel}.`}
            table={{ cols: [{ label: "Week of" }, { label: "Hours", right: true }, { label: prevLabel, right: true }], rows: data.map((w) => [w.tip.replace("Week of ", ""), w.value.toFixed(1), w.ghost.toFixed(1)]) }}>
            {!o ? <SkeletonLines lines={6} /> : (
                <>
                    <div className="row" style={{ alignItems: "flex-end", gap: 16, marginBottom: 6, flexWrap: "wrap" }}>
                        <div>
                            <div className="hero-val">{fmtNumber(Math.round(o.minutes / 60))}<small>h</small></div>
                            <div className="row" style={{ gap: 8 }}><Delta value={o.minutes} prev={o.previousMinutes} label={`vs ${prevLabel}`} /></div>
                        </div>
                        <div className="grow" />
                        <div className="muted" style={{ fontSize: "11.5px", textAlign: "right" }}>
                            {fmtNumber(o.entries)} entries · {o.peopleCount} people · {o.projectCount} projects
                        </div>
                    </div>
                    <Columns data={data} height={186} seriesLabel="Hours" ghostLabel={prevLabel}
                        labelEvery={Math.max(1, Math.ceil(data.length / 7))} format={(v) => `${Math.round(v)}h`} />
                </>
            )}
        </Figure>
    );
}

const FOLLOWUPS_KEY = "hl-overview-followups";
const DEADLINE_DAYS = 14;
const TONE = {
    warn: { background: "var(--warn-soft)", color: "var(--warn)" },
    ok: { background: "var(--ok-soft)", color: "var(--ok)" },
    info: { background: "var(--surface-3)", color: "var(--ink-2)" },
};

function readOpen() {
    try {
        return localStorage.getItem(FOLLOWUPS_KEY) !== "closed";
    } catch {
        return true;
    }
}

/** "Needs attention" and "Upcoming deadlines" in one card that folds away, remembered in this browser. */
type FollowupsCardProps = {
    items: Followup[];
    deadlines: Schemas["UpcomingDeadlinesResponse"] | undefined;
    /** Why the deadlines didn't load, with a retry. */
    deadlinesFailed?: { error: unknown; retry: () => void } | null;
    loading: boolean;
};

export function FollowupsCard({ items, deadlines, deadlinesFailed, loading }: FollowupsCardProps) {
    const open = useOpener();
    const [expanded, setExpanded] = useState(readOpen);
    function toggle() {
        const next = !expanded;
        setExpanded(next);
        try {
            localStorage.setItem(FOLLOWUPS_KEY, next ? "open" : "closed");
        } catch {
            // private window: this session only
        }
    }
    const total = deadlines?.total ?? 0;
    const summary = `${items.length} need${items.length === 1 ? "s" : ""} attention · ${total} deadline${total === 1 ? "" : "s"} in ${DEADLINE_DAYS} days${deadlines?.overdue ? ` (${deadlines.overdue} overdue)` : ""}`;
    const shown = deadlines?.items.slice(0, 8) ?? [];

    return (
        <div className={cx("panel fu-panel", !expanded && "fu-closed")}>
            <button type="button" className="panel-head fu-head" aria-expanded={expanded} aria-controls="fu-body" onClick={toggle}>
                <span className="grow fu-titles">
                    <span className="panel-title">Needs attention &amp; deadlines</span>
                    <span className="panel-sub">{expanded ? "Derived from project status, logging activity and requirement deadlines." : summary}</span>
                </span>
                <span className="fu-chev"><Icon name="chevronDown" /></span>
            </button>
            {expanded && (
                <div id="fu-body" className="panel-body fu-body" style={{ paddingTop: 4 }}>
                    {loading ? <SkeletonLines lines={4} /> : items.map((a) => {
                        const go = a.projectId != null ? open(`projects/${a.projectId}`) : undefined;
                        return (
                            <div key={a.key} className="mini-row" style={{ alignItems: "flex-start", cursor: go ? "pointer" : "default" }} {...clickable(go, "button")}>
                                <span className="feed-ic" style={TONE[a.tone]}><Icon name={a.icon} /></span>
                                <div className="grow">
                                    <div style={{ fontSize: "12.5px" }}>{a.text}</div>
                                    <div className="muted" style={{ fontSize: "11.5px" }}>{a.sub}</div>
                                </div>
                            </div>
                        );
                    })}
                    {!loading && items.length === 0 && <Empty art="done" title="Nothing needs attention" text="Every active project has had work logged this week." />}

                    <div className="fu-section">
                        <div className="fu-section-head">
                            <div className="fu-section-title">Upcoming deadlines</div>
                            <div className="panel-sub">
                                Open requirements due in the next {DEADLINE_DAYS} days{deadlines?.overdue ? <> · <span className="down">{deadlines.overdue} overdue</span></> : ""}.
                            </div>
                        </div>
                        {!deadlines ? (deadlinesFailed ? <LoadError error={deadlinesFailed.error} retry={deadlinesFailed.retry} what="the deadlines" /> : <SkeletonLines lines={3} />)
                            : shown.length ? shown.map((r) => (
                            <div key={r.requirementId} className={cx("req", open(`projects/${r.project.id}`) && "click")} {...clickable(open(`projects/${r.project.id}?tab=requirements`), "button")}>
                                <ProjectTile icon={r.project.icon} tint={r.project.tint} size="sm" />
                                <div className="grow" style={{ minWidth: 0 }}>
                                    <div className="req-text">{r.text}</div>
                                    <div className="req-meta">
                                        <span>{r.project.title}</span>
                                        {r.assignees.length
                                            ? <span className="row" style={{ gap: 5 }}><Avatars people={r.assignees} max={3} size={16} link /><NameList people={r.assignees} /></span>
                                            : <span className="down">Not assigned</span>}
                                    </div>
                                </div>
                                <DeadlineTag deadline={r.deadline} done={false} />
                            </div>
                        )) : <Empty art="done" title="Nothing due soon" text={`No open requirement is overdue or due in the next ${DEADLINE_DAYS} days.`} />}
                        {deadlines && deadlines.total > shown.length && (
                            <div className="hint mt-s">+ {deadlines.total - shown.length} more due in the next {DEADLINE_DAYS} days - see each project's Requirements.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

/** "Where the time went": hours by project in the period. */
export function TimeCard({ overview, label, projects }: { overview: Overview | undefined; label: string; projects: Map<number, ProjectInfo> }) {
    const open = useOpener();
    const rows = overview?.byProject ?? [];
    const total = rows.reduce((t, x) => t + x.minutes, 0);
    return (
        <Figure title="Where the time went" sub={`Hours by project · ${label}`}
            table={{ cols: [{ label: "Project" }, { label: "Hours", right: true }, { label: "Share", right: true }], rows: rows.map((x) => [x.title, fmtH(x.minutes), `${pct(x.minutes, total)}%`]) }}>
            {!overview ? <SkeletonLines lines={6} /> : (
                <RankBars showPct onClick={(it) => open(`projects/${it.id}`)?.()}
                    items={rows.map((x) => ({
                        id: x.projectId, label: x.title, value: x.minutes,
                        node: <><Tile info={projects.get(x.projectId)} /><span className="trunc">{x.title}</span><Signal level={projects.get(x.projectId)?.activity ?? 0} /></>,
                    }))} />
            )}
        </Figure>
    );
}

/** "Projects by status", with the longest-running and busiest projects. */
export function StatusCard({ overview, dashboard, execution }: { overview: Overview | undefined; dashboard: Schemas["DashboardResponse"] | undefined; execution?: boolean }) {
    // Execution has no work overview: its counts come from the dashboard
    const counts = overview?.projectsByStatus ?? dashboard?.projectsByStatus;
    const count = (status: string) => counts?.find((s) => s.status === status)?.count ?? 0;
    const longest = dashboard?.longestRunning[0];
    const busiest = overview?.busiestProjectThisWeek;
    const rows: [string, string][] = [
        ["Longest running", longest ? `${longest.title} · ${longest.days} days` : "-"],
        ["Busiest project this week", busiest ? `${busiest.title} · ${fmtH(busiest.minutes)}` : "-"],
        ["Average entry length", overview?.entries ? fmtDur(overview.averageEntryMinutes) : "-"],
    ];
    return (
        <div className="panel">
            <div className="panel-head"><div><div className="panel-title">Projects by status</div></div></div>
            <div className="panel-body">
                {!counts ? <SkeletonLines lines={4} /> : (
                    <>
                        <StatusBar segments={[
                            { label: "Active", value: count("active"), color: "var(--ok)" },
                            { label: "On hold", value: count("hold"), color: "var(--warn-mark)" },
                            { label: "Completed", value: count("completed"), color: "var(--done)" },
                            { label: "Archived", value: count("archived"), color: "var(--arch)" },
                        ]} />
                        <div className="divider mt" />
                        <div className="mt-s">
                            {rows.filter(([k]) => !execution || k === "Longest running").map(([k, v]) => (
                                <div key={k} className="mini-row">
                                    <div className="grow muted" style={{ fontSize: 12 }}>{k}</div>
                                    <div style={{ fontWeight: 600, fontSize: "12.5px", textAlign: "right" }}>{v}</div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/** "Revenue against cost", month by month. */
export function RevenueCostCard({ months, error, retry }: { months: FinanceMonth[] | undefined; error: unknown; retry: () => void }) {
    const open = useOpener();
    const financials = open("financials");
    const list = months ?? [];
    return (
        <Figure title="Revenue against cost" sub="Revenue is the money received from clients, in the month it arrived."
            tools={financials && <button className="btn btn-sm btn-quiet" onClick={financials}>Open financials</button>}
            table={{ cols: [{ label: "Month" }, { label: "Revenue", right: true }, { label: "Cost", right: true }, { label: "Profit", right: true }], rows: list.map((m) => [fmtMonthY(m.month), money.fmt(m.revenue), money.fmt(m.cost), money.fmt(m.profit)]) }}>
            {error ? <LoadError error={error} retry={retry} what="the months" /> : !months ? <SkeletonLines lines={6} /> : (
                <Columns height={190} labelEvery={Math.max(1, Math.ceil(list.length / 6))} seriesLabel="Revenue received" ghostLabel="Total cost" format={(v) => money.short(v)}
                    data={list.map((m) => ({ label: monthLabel(m.month), tip: fmtMonthY(m.month), value: m.revenue, ghost: m.cost, note: `profit ${money.fmt(m.profit)}` }))} />
            )}
        </Figure>
    );
}

/** "Profit by project": client work, losses to the left. */
export function ProfitCard({ finance, projects }: { finance: FinanceProjects | undefined; projects: Map<number, ProjectInfo> }) {
    const open = useOpener();
    const rows = (finance?.projects ?? []).filter((f) => f.billingType !== "internal").sort((a, b) => b.profit - a.profit).slice(0, 8);
    return (
        <Figure title="Profit by project" sub="Client work only - losses point left.">
            {!finance ? <SkeletonLines lines={6} /> : (
                <ProfitBars onClick={(it) => open(`projects/${it.id}`)?.()}
                    items={rows.map((f) => ({
                        id: f.projectId, label: f.title, value: f.profit, note: `${money.pct(f.margin)} margin`,
                        node: <><Tile info={projects.get(f.projectId)} /><span className="trunc">{f.title}</span></>,
                    }))} />
            )}
        </Figure>
    );
}

/** "Invoiced against collected", month by month: cash, not revenue. */
export function InvoicedCard({ billing }: { billing: FinanceBilling | undefined }) {
    const open = useOpener();
    const billingPage = open("financials?tab=billing");
    const months = billing?.monthly ?? [];
    return (
        <Figure title="Invoiced against collected" sub="Cash only: what we asked the clients for, and what actually arrived."
            tools={billingPage && <button className="btn btn-sm btn-quiet" onClick={billingPage}>Open billing</button>}
            table={{ cols: [{ label: "Month" }, { label: "Invoiced", right: true }, { label: "Collected", right: true }], rows: months.map((m) => [fmtMonthY(m.month), money.fmt(m.invoiced), money.fmt(m.collected)]) }}>
            {!billing ? <SkeletonLines lines={6} /> : (
                <>
                    <Columns height={190} labelEvery={Math.max(1, Math.ceil(months.length / 6))} seriesLabel="Invoiced" ghostLabel="Collected" format={(v) => money.short(v)}
                        data={months.map((m) => ({ label: monthLabel(m.month), tip: fmtMonthY(m.month), value: m.invoiced, ghost: m.collected }))} />
                    <div className="chart-note">Neither bar is revenue: revenue is earned as the work is done, cash arrives whenever the client pays.</div>
                </>
            )}
        </Figure>
    );
}

/** "Money owed to us": the outstanding balance and the oldest open invoices. */
export function OwedCard({ billing }: { billing: FinanceBilling | undefined }) {
    const open = useOpener();
    const today = companyToday();
    const b = billing?.position;
    return (
        <div className="panel">
            <div className="panel-head"><div><div className="panel-title">Money owed to us</div><div className="panel-sub">Outstanding balances, oldest first.</div></div></div>
            <div className="panel-body" style={{ paddingTop: 6 }}>
                {!b ? <SkeletonLines lines={5} /> : (
                    <>
                        <div className="row wrap" style={{ gap: 10, alignItems: "baseline", marginBottom: 8 }}>
                            <Money value={b.outstanding} size="lg" />
                            <span className="muted" style={{ fontSize: "11.5px" }}><Money short value={b.received} /> collected of <Money short value={b.invoiced} /> invoiced</span>
                        </div>
                        <BillingMeter value={b.value} invoiced={b.invoiced} paid={b.received} outstanding={b.outstanding} notYetInvoiced={b.notYetInvoiced} height={16} />
                        <div className="mt">
                            {billing.openInvoices.slice(0, 4).map((inv) => (
                                <div key={inv.id} className="mini-row" style={{ cursor: open(`projects/${inv.projectId}`) ? "pointer" : "default" }} {...clickable(open(`projects/${inv.projectId}`), "button")}>
                                    <span className="feed-ic"><Icon name={inv.isOverdue ? "alert" : "file"} /></span>
                                    <div className="grow" style={{ minWidth: 0 }}>
                                        <div className="trunc" style={{ fontWeight: 600, fontSize: "12.5px" }}>{inv.number} · {inv.clientName}</div>
                                        <div className="muted trunc" style={{ fontSize: 11 }}>
                                            {inv.isOverdue ? `${inv.daysOverdue} days overdue` : `due in ${inv.dueOn ? daysBetween(today, inv.dueOn) : "-"} days`} · {inv.projectTitle}
                                        </div>
                                    </div>
                                    <div className={inv.isOverdue ? "mono down" : "mono"} style={{ fontSize: 12 }}><Money short value={inv.balance} /></div>
                                </div>
                            ))}
                            {billing.openInvoices.length === 0 && <p className="muted">Every invoice has been paid.</p>}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/** "Top clients" by contracted revenue. */
export function TopClientsCard({ clients }: { clients: FinanceClient[] | undefined }) {
    const open = useOpener();
    const all = open("clients");
    const rows = [...(clients ?? [])].filter((c) => c.money.revenue > 0).sort((a, b) => b.money.revenue - a.money.revenue).slice(0, 4);
    return (
        <div className="panel">
            <div className="panel-head">
                <div><div className="panel-title">Top clients</div><div className="panel-sub">By contracted revenue.</div></div>
                {all && <div className="panel-tools"><button className="btn btn-sm btn-quiet" onClick={all}>All clients</button></div>}
            </div>
            <div className="panel-body" style={{ paddingTop: 4 }}>
                {!clients ? <SkeletonLines lines={4} /> : rows.map((c) => (
                    <div key={c.clientId} className="mini-row" style={{ cursor: open(`clients/${c.clientId}`) ? "pointer" : "default" }} {...clickable(open(`clients/${c.clientId}`), "button")}>
                        <span className="client-mark">{c.name.slice(0, 1).toUpperCase()}</span>
                        <div className="grow" style={{ minWidth: 0 }}>
                            <div className="trunc" style={{ fontWeight: 600, fontSize: "12.5px" }}>{c.name}</div>
                            <div className="muted" style={{ fontSize: 11 }}>{c.money.projects} projects · {c.money.activeProjects} active</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div className="mono" style={{ fontSize: 12 }}><Money short value={c.money.revenue} /></div>
                            <MarginPill value={c.money.marginKnown ? c.money.margin : null} label={false} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
