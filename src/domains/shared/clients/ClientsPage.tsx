import { useState } from "react";
import { useNavigate } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useDomain } from "@/app/routing/domainContext";
import { RankBars } from "@/shared/components/Charts/Bars";
import Columns from "@/shared/components/Charts/Columns";
import Figure from "@/shared/components/Charts/Figure";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import { PageHead } from "@/shared/components/Data/Panel";
import { MarginPill } from "@/shared/components/Data/Pills";
import DataTable, { type Column, type SortState } from "@/shared/components/Data-Tables/DataTable";
import Pager from "@/shared/components/Data-Tables/Pager";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { ChipGroup, SearchInput } from "@/shared/components/Forms/Filters";
import useDebounce from "@/shared/hooks/useDebounce";
import { money } from "@/shared/format/money";
import { companyToday, fmtH, fmtMonthY, MONTHS, partsOf, relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useFinanceClients, useFinanceSummary } from "../finance/financeApi";
import { ClientBadge } from "./ClientBits";
import ClientModal from "./ClientModal";
import { secondaryLine, useClientOverview, useClients, type ClientFilter, type ClientSort, type ClientSummary } from "./clientsApi";
import { clickable } from "@/shared/utils/clickable";

const PAGE_SIZE = 50;

/** The domain's clients (the prototype's P.AdminClients). */
export default function ClientsPage() {
    const domain = useDomain();
    const navigate = useNavigate();
    const permissions = usePermissions();
    const seesMoney = permissions.has(P.FINANCIAL_VIEW);
    // the API gives a client's hours and last work only to people who see everyone's work
    const seesWork = permissions.has(P.WORK_ENTRY_VIEW_ALL);
    const [q, setQ] = useState("");
    const [filter, setFilter] = useState<"all" | ClientFilter>("all");
    const [sort, setSort] = useState<SortState>({ key: seesMoney ? "revenue" : "name", dir: seesMoney ? "desc" : "asc" });
    const [showArchived, setShowArchived] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [page, setPage] = useState(1);
    const search = useDebounce({ value: q, debounceTimeMs: 250 });

    const list = useClients({
        domain, search: search.trim() || undefined, filter: filter === "all" ? undefined : filter,
        // names run A to Z on the server and the rest highest first; the other way is asked for as reverse
        includeArchived: showArchived, sort: sort.key as ClientSort, reverse: sort.key === "name" ? sort.dir === "desc" : sort.dir === "asc", page, pageSize: PAGE_SIZE,
    });
    const overview = useClientOverview(domain);
    const today = companyToday();
    const summary = useFinanceSummary(domain, { from: `${today.slice(0, 7)}-01`, to: today }, seesMoney);
    const financeClients = useFinanceClients(domain, seesMoney);

    const o = overview.data;
    const s = summary.data;
    const revenue = s?.allTimeClientRevenue ?? 0;
    const top = financeClients.data?.[0];
    const concentration = top && revenue > 0 ? top.money.revenue / revenue : 0;
    // the figures fail as one: a strip of skeletons that never fills in says nothing
    const figuresFailed = overview.isError && !o ? overview : seesMoney && summary.isError && !s ? summary : null;
    const rows = list.data?.items;

    const onSort = (next: SortState) => { setSort(next); setPage(1); };
    const columns: Column<ClientSummary>[] = [
        {
            key: "client", header: "Client", sortKey: "name",
            cell: (c) => (
                <div className="row" style={{ gap: 8 }}>
                    <ClientBadge link={false} client={{ id: c.id, displayName: c.displayName, secondary: secondaryLine(c) }} />
                    {c.isArchived && <span className="badge badge-archived">Archived</span>}
                </div>
            ),
        },
        { key: "label", header: "Label", cell: (c) => (c.label ? <span className="badge">{c.label}</span> : null) },
        {
            key: "projects", header: "Projects", right: true, sortKey: "projects",
            cell: (c) => {
                const active = c.money?.activeProjects ?? 0;
                return c.projectCount ? <span className="num">{c.projectCount}{active ? ` · ${active} open` : ""}</span> : <span className="muted">-</span>;
            },
        },
        ...(seesWork ? [{
            key: "hours", header: "Hours", right: true, mono: true, sortKey: "hours",
            cell: (c: ClientSummary) => (c.work?.totalMinutes ? fmtH(c.work.totalMinutes) : <span className="muted">-</span>),
        }] : []),
        ...(seesMoney ? [
            { key: "revenue", header: "Revenue", right: true, mono: true, sortKey: "revenue", cell: (c: ClientSummary) => (c.money?.revenue ? money.short(c.money.revenue) : <span className="muted">-</span>) },
            { key: "cost", header: "Cost", right: true, mono: true, cell: (c: ClientSummary) => (c.money?.cost.total ? money.short(c.money.cost.total) : <span className="muted">-</span>) },
            {
                key: "profit", header: "Profit", right: true, sortKey: "profit",
                cell: (c: ClientSummary) => (c.money?.revenue
                    ? <span className={cx("mono", c.money.profit >= 0 ? "up" : "down")}>{money.short(c.money.profit)}</span>
                    : <span className="muted">-</span>),
            },
            { key: "margin", header: "Margin", sortKey: "margin", cell: (c: ClientSummary) => (c.money?.revenue ? <MarginPill value={c.money.marginKnown ? c.money.margin : null} label={false} /> : <span className="muted">-</span>) },
            {
                key: "outstanding", header: "Outstanding", right: true, sortKey: "outstanding",
                cell: (c: ClientSummary) => {
                    const b = c.money?.billing;
                    return b && b.outstanding > 0 ? <span className={cx("mono", b.overdue > 0 && "down")}>{money.short(b.outstanding)}</span> : <span className="muted">-</span>;
                },
            },
        ] : []),
        ...(seesWork ? [{
            key: "activity", header: "Last activity", sortKey: "activity", nowrap: true,
            cell: (c: ClientSummary) => <span className="muted">{c.work?.lastStartedAt ? relDay(c.work.lastStartedAt) : "no work yet"}</span>,
        }] : []),
    ];

    return (
        <div className="page">
            <PageHead
                title="Clients"
                sub="Who the work is for. Clients are records only - they never sign in to ID InDetails."
                actions={permissions.has(P.CLIENT_CREATE) && <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Icon name="plus" />Add client</button>}
            />

            {figuresFailed ? (
                <div className="panel"><div className="panel-body"><LoadError error={figuresFailed.error} retry={() => figuresFailed.refetch()} what="the client figures" /></div></div>
            ) : <KpiStrip loading={!o || (seesMoney && !s)} items={[
                { key: "clients", label: "Clients", value: o?.clients ?? 0, sub: <span>{o?.withActiveWork ?? 0} with active work · {o?.withoutProjects ?? 0} without projects</span> },
                { key: "added", label: "Added this month", value: o?.addedThisMonth ?? 0, sub: <span>newest {o?.newest?.name ?? "-"}</span> },
                ...(seesMoney ? [
                    { key: "revenue", label: "Client revenue", value: money.short(revenue), sub: <span>contracted, all time</span> },
                    { key: "profit", label: "Client profit", value: money.short(s?.allTimeClientProfit ?? 0), sub: <span>{money.pct(revenue ? (s?.allTimeClientProfit ?? 0) / revenue : null)} margin</span> },
                    {
                        key: "outstanding", label: "Outstanding", value: money.short(s?.billing.outstanding ?? 0),
                        sub: <span className="link" {...clickable(() => navigate(`/${domain}/financials?tab=billing`), "link")}>cash owed, not revenue</span>,
                    },
                    { key: "largest", label: "Largest client", value: top ? money.pct(concentration) : "-", sub: <span>{top ? `${top.name} of all revenue` : "no revenue yet"}</span> },
                ] : []),
            ]} />}

            <div className="grid g-7-5 mt">
                <Figure title="Client growth" sub="Clients on the books at the end of each month."
                    table={o && { cols: [{ label: "Month" }, { label: "Added", right: true }, { label: "Total", right: true }], rows: o.growth.map((g) => [fmtMonthY(g.month), g.added.length, g.total]) }}>
                    {overview.isError && !o ? <LoadError error={overview.error} retry={() => overview.refetch()} what="the growth" />
                        : !o ? <SkeletonLines lines={5} />
                            : <Columns height={180} labelEvery={2} format={(v) => String(Math.round(v))} seriesLabel="Clients"
                                data={o.growth.map((g) => ({
                                    label: MONTHS[partsOf(`${g.month.slice(0, 7)}-01`).month], tip: fmtMonthY(g.month), value: g.total,
                                    note: g.added.length ? `+${g.added.length} added: ${g.added.map((a) => a.name).join(", ")}` : "no new clients",
                                }))} />}
                </Figure>
                {seesMoney && (
                    <Figure title="Revenue by client" sub="Contracted payments across all their projects.">
                        {financeClients.isError && !financeClients.data ? <LoadError error={financeClients.error} retry={() => financeClients.refetch()} what="client revenue" />
                            : !financeClients.data ? <SkeletonLines lines={5} />
                                : (
                                    <>
                                        <RankBars format={(v) => money.short(v)} unit="Revenue" showPct
                                            onClick={(it) => navigate(`/${domain}/clients/${it.id}`)}
                                            items={financeClients.data.filter((c) => c.money.revenue > 0).map((c) => ({ id: c.clientId, label: c.name, value: c.money.revenue }))} />
                                        {concentration > 0.4 && top && (
                                            <div className="chart-note">{top.name} is {money.pct(concentration)} of contracted revenue - worth watching as concentration risk.</div>
                                        )}
                                    </>
                                )}
                    </Figure>
                )}
            </div>

            <div className="filters mt">
                <SearchInput width={260} value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, organisation, email or phone" />
                <ChipGroup value={filter} onChange={(v) => { setFilter(v); setPage(1); }} aria-label="Filter" options={[
                    { value: "all", label: "All" }, { value: "active", label: "Active work" },
                    ...(seesMoney ? [{ value: "owing" as const, label: "Owing us" }] : []),
                    { value: "empty", label: "No projects" },
                ]} />
                <div className="grow" />
                <button className={cx("btn btn-sm", showArchived && "btn-primary")} onClick={() => { setShowArchived(!showArchived); setPage(1); }}>
                    <Icon name="archive" />{showArchived ? "Hiding nothing" : "Show archived"}
                </button>
            </div>

            <div className="panel">
                <DataTable columns={columns} rows={rows} rowKey={(c) => c.id} loading={list.isPending} error={list.error} onRetry={() => list.refetch()}
                    what="the clients" minWidth="tbl-min" sort={sort} onSort={onSort} onRowClick={(c) => navigate(`/${domain}/clients/${c.id}`)} />
                {rows && rows.length === 0 && (
                    <Empty art="search" title="No clients match" text="Try another search, or add the client you are looking for."
                        action={permissions.has(P.CLIENT_CREATE) && <button className="btn btn-primary" onClick={() => setShowAdd(true)}>Add client</button>} />
                )}
                {rows && rows.length > 0 && (
                    <div className="panel-foot">
                        <span>{list.data!.totalCount} of {o?.clients ?? list.data!.totalCount} clients</span>
                        <div className="grow" />
                        {list.data!.totalCount > PAGE_SIZE
                            ? <Pager page={page} pageSize={PAGE_SIZE} total={list.data!.totalCount} onPage={setPage} />
                            : <span className="muted">Internal projects have no client and never appear here.</span>}
                    </div>
                )}
            </div>

            {showAdd && <ClientModal domain={domain} onClose={() => setShowAdd(false)} />}
        </div>
    );
}
