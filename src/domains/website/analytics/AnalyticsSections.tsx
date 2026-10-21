import { useState } from "react";
import { CompositionBar, Delta, RankBars } from "@/shared/components/Charts/Bars";
import { Badge } from "@/shared/components/Data/Pills";
import Panel from "@/shared/components/Data/Panel";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import DataTable, { type Column, type SortState } from "@/shared/components/Data-Tables/DataTable";
import Pager from "@/shared/components/Data-Tables/Pager";
import { Segmented } from "@/shared/components/Forms/Filters";
import { fmtNumber } from "@/shared/format/time";
import type { AnalyticsEvent, AnalyticsPage, AnalyticsSource, WebsiteAnalytics } from "./analyticsApi";
import { CONTACT_EVENTS, eventLabel, flag, fmtRate, fmtSeconds, label } from "./analyticsFormat";

type Section = { data: WebsiteAnalytics };

const PALETTE = ["var(--heat-3)", "var(--now)", "var(--ok)", "var(--warn-mark)", "var(--cost)", "var(--heat-1)"];

/** Sorts a copy of the rows by the chosen column. */
function sortedBy<T>(rows: T[], sort: SortState, values: Record<string, (row: T) => number | string>): T[] {
    const value = values[sort.key];
    if (!value) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
        const x = value(a), y = value(b);
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
}

/** A sortable table a page at a time: the API sends a bounded list (the top 25 or 50), sorted and paged here. */
function useTable<T>(rows: T[], first: SortState, values: Record<string, (row: T) => number | string>, pageSize: number) {
    const [sort, setSort] = useState(first);
    const [page, setPage] = useState(1);
    const sorted = sortedBy(rows, sort, values);
    return {
        rows: sorted.slice((page - 1) * pageSize, page * pageSize),
        sort,
        onSort: (next: SortState) => { setSort(next); setPage(1); },
        pager: <Pager page={page} pageSize={pageSize} total={rows.length} onPage={setPage} />,
    };
}

/** Where visitors came from: Google's channels, then each source and campaign. */
export function AcquisitionPanels({ data }: Section) {
    const sources = useTable<AnalyticsSource>(data.sources, { key: "sessions", dir: "desc" }, {
        source: (s) => `${s.source} / ${s.medium}`, sessions: (s) => s.sessions, engagement: (s) => s.engagementRate, keyEvents: (s) => s.keyEvents,
    }, 8);
    const columns: Column<AnalyticsSource>[] = [
        { key: "source", header: "Source / medium", sortKey: "source", cell: (s) => <span className="trunc">{label(s.source)} / {label(s.medium)}</span> },
        { key: "campaign", header: "Campaign", cell: (s) => <span className="muted trunc">{label(s.campaign)}</span> },
        { key: "sessions", header: "Sessions", right: true, mono: true, sortKey: "sessions", cell: (s) => fmtNumber(s.sessions) },
        { key: "engagement", header: "Engaged", right: true, mono: true, sortKey: "engagement", cell: (s) => fmtRate(s.engagementRate) },
        { key: "keyEvents", header: "Key actions", right: true, mono: true, sortKey: "keyEvents", cell: (s) => fmtNumber(s.keyEvents) },
    ];
    return (
        <div className="grid g-2 mt">
            <Panel title="Where visitors come from" sub="Sessions by channel: search engines, links on other websites, social media, typed in">
                <RankBars showPct unit="Sessions" format={fmtNumber} empty="No visits in this period."
                    items={data.channels.map((c) => ({ id: c.channel, label: label(c.channel), value: c.sessions }))} />
            </Panel>
            <Panel title="Sources and campaigns" sub="The 25 that brought the most sessions" flush foot={sources.pager}>
                <DataTable rows={sources.rows} rowKey={(s) => `${s.source}|${s.medium}|${s.campaign}`} columns={columns}
                    sort={sources.sort} onSort={sources.onSort} minWidth="tbl-min-sm" empty={<p className="muted">No visits in this period.</p>} />
            </Panel>
        </div>
    );
}

/** The most viewed pages; a project's page is named by its website project while it has that address. */
export function TopPagesPanel({ data }: Section) {
    const pages = useTable<AnalyticsPage>(data.pages, { key: "views", dir: "desc" }, {
        page: (p) => p.projectTitle ?? p.title, views: (p) => p.views, visitors: (p) => p.visitors, time: (p) => p.averageEngagementSeconds, events: (p) => p.events,
    }, 10);
    const columns: Column<AnalyticsPage>[] = [
        {
            key: "page", header: "Page", sortKey: "page",
            cell: (p) => (
                <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                        <span className="trunc">{p.projectTitle ?? (p.title || p.path)}</span>
                        {p.projectTitle && <Badge icon="projects">Project</Badge>}
                    </div>
                    <div className="muted mono analytics-path trunc">{p.path}</div>
                </div>
            ),
        },
        { key: "views", header: "Views", right: true, mono: true, sortKey: "views", cell: (p) => fmtNumber(p.views) },
        { key: "visitors", header: "Visitors", right: true, mono: true, sortKey: "visitors", cell: (p) => fmtNumber(p.visitors) },
        { key: "time", header: "Engagement time", right: true, mono: true, sortKey: "time", cell: (p) => fmtSeconds(p.averageEngagementSeconds) },
        { key: "events", header: "Events", right: true, mono: true, sortKey: "events", cell: (p) => fmtNumber(p.events) },
    ];
    return (
        <Panel title="Top pages" sub="The 50 most viewed; engagement time is per visitor" flush className="mt" foot={pages.pager}>
            <DataTable rows={pages.rows} rowKey={(p) => `${p.path}|${p.title}`} columns={columns} sort={pages.sort} onSort={pages.onSort}
                minWidth="tbl-min-sm" empty={<p className="muted">No pages viewed in this period.</p>} />
        </Panel>
    );
}

/** Who the visitors are: their country, their device, and whether they came before. */
export function AudiencePanels({ data }: Section) {
    const parts = (shares: WebsiteAnalytics["devices"]) =>
        shares.map((s, i) => ({ label: label(s.key), value: s.visitors, color: PALETTE[i % PALETTE.length] }));
    return (
        <div className="grid g-3 mt">
            <Panel title="Countries" sub="Visitors by country">
                <RankBars unit="Visitors" format={fmtNumber} showPct empty="No visitors in this period."
                    items={data.countries.slice(0, 10).map((c) => ({
                        id: c.code, label: label(c.name), value: c.visitors,
                        node: <span className="trunc"><span aria-hidden="true">{flag(c.code)} </span>{label(c.name)}</span>,
                    }))} />
            </Panel>
            <Panel title="Devices" sub="Visitors by the device they used">
                {data.devices.length ? <CompositionBar height={18} format={fmtNumber} parts={parts(data.devices)} /> : <p className="muted">No visitors in this period.</p>}
            </Panel>
            <Panel title="New and returning" sub="Visitors who came for the first time, and those who came back">
                {data.visitorTypes.length ? <CompositionBar height={18} format={fmtNumber} parts={parts(data.visitorTypes)} /> : <p className="muted">No visitors in this period.</p>}
            </Panel>
        </div>
    );
}

/** The website's contact actions, then every event Google recorded. */
export function ActionsPanel({ data, compareLabel }: Section & { compareLabel: string }) {
    const [view, setView] = useState<"contact" | "all">("contact");
    const byName = new Map(data.events.map((e) => [e.name, e]));
    const events = useTable<AnalyticsEvent>(data.events, { key: "count", dir: "desc" }, {
        name: (e) => eventLabel(e.name), count: (e) => e.count, users: (e) => e.users,
    }, 10);
    const columns: Column<AnalyticsEvent>[] = [
        {
            key: "name", header: "Event", sortKey: "name",
            cell: (e) => (
                <div className="row" style={{ gap: 8 }}>
                    <span>{eventLabel(e.name)}</span>
                    <span className="muted mono analytics-path">{e.name}</span>
                    {e.isKeyEvent && <Badge icon="target">Key action</Badge>}
                </div>
            ),
        },
        { key: "count", header: "Times", right: true, mono: true, sortKey: "count", cell: (e) => fmtNumber(e.count) },
        { key: "users", header: "Visitors", right: true, mono: true, sortKey: "users", cell: (e) => fmtNumber(e.users) },
    ];

    return (
        <Panel title="Contact and key actions" sub="What visitors did that shows interest in working with the studio" className="mt"
            flush={view === "all"} foot={view === "all" ? events.pager : undefined}
            tools={<Segmented value={view} onChange={setView} aria-label="Events" options={[{ value: "contact", label: "Contact" }, { value: "all", label: "All events" }]} />}>
            {view === "contact" ? (
                <KpiStrip items={CONTACT_EVENTS.map((name) => {
                    const e = byName.get(name);
                    return {
                        key: name,
                        label: eventLabel(name),
                        value: fmtNumber(e?.count ?? 0),
                        sub: `${fmtNumber(e?.users ?? 0)} visitors`,
                        delta: data.previousTotals ? <Delta value={e?.count ?? 0} prev={e?.previousCount} label={compareLabel} /> : undefined,
                    };
                })} />
            ) : (
                <DataTable rows={events.rows} rowKey={(e) => e.name} columns={columns} sort={events.sort} onSort={events.onSort}
                    empty={<p className="muted">No events in this period.</p>} />
            )}
        </Panel>
    );
}
