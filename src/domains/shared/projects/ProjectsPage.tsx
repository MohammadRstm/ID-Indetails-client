import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useDomain } from "@/app/routing/domainContext";
import { Spark } from "@/shared/components/Charts/Bars";
import { activityLevelOf } from "@/shared/components/Data/activity";
import { Bar, ProjectTile, Signal } from "@/shared/components/Data/Bits";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import { PageHead } from "@/shared/components/Data/Panel";
import { MarginPill, StatusBadge } from "@/shared/components/Data/Pills";
import DataTable, { type Column } from "@/shared/components/Data-Tables/DataTable";
import Pager from "@/shared/components/Data-Tables/Pager";
import Empty from "@/shared/components/Feedback/Empty";
import { ChipGroup, FilterSep, SearchInput } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import { Avatars } from "@/shared/components/Identity/People";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import useDebounce from "@/shared/hooks/useDebounce";
import { money } from "@/shared/format/money";
import { companyToday, fmtH, relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { ClientBadge } from "../clients/ClientBits";
import { useClients } from "../clients/clientsApi";
import { useDomainPeople, personName } from "../people/peopleApi";
import CreateProjectModal from "./CreateProjectModal";
import ProjectStatusItems from "./ProjectStatusItems";
import { useProjects, useProjectStatusCounts, useProjectTotals, type ProjectListParams, type ProjectSort, type ProjectStatus, type ProjectSummary } from "./projectsApi";

// Sorting and filtering by money stay on the server's list of what it can sort by (decision M7).
const SORTS: { value: ProjectSort; label: string }[] = [
    { value: "activity", label: "Recent activity" },
    { value: "hours", label: "Total hours" },
    { value: "progress", label: "Progress" },
    { value: "start", label: "Start date" },
    { value: "name", label: "Name" },
    { value: "client", label: "Client" },
];
const PAGE_SIZE = 50;

/** The domain's projects (the prototype's P.AdminProjects). */
export default function ProjectsPage() {
    const domain = useDomain();
    const navigate = useNavigate();
    const permissions = usePermissions();
    const [params, setParams] = useSearchParams();
    const site = domain === "execution";
    const seesMoney = permissions.has(P.FINANCIAL_VIEW);
    // Hours and activity come from logged work, so only for people who may see everyone's.
    const seesWork = permissions.has(P.WORK_ENTRY_VIEW_ALL);

    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<ProjectStatus | "all">("all");
    const [quarter, setQuarter] = useState<number | null>(null);
    const thisYear = +companyToday().slice(0, 4);
    const [year, setYear] = useState(thisYear);
    const [type, setType] = useState<"all" | "client" | "internal">("all");
    const [client, setClient] = useState(params.get("client") ?? "all");
    const [owner, setOwner] = useState("all");
    const [sort, setSort] = useState<ProjectSort>("activity");
    const [page, setPage] = useState(1);
    const debounced = useDebounce({ value: search, debounceTimeMs: 250 });

    const filters: ProjectListParams = {
        domain,
        search: debounced.trim() || undefined,
        status: status === "all" ? undefined : status,
        clientId: client !== "all" && client !== "internal" ? +client : undefined,
        billingType: client === "internal" ? "internal" : type === "all" ? undefined : type,
        ownerId: owner === "all" ? undefined : +owner,
        year: quarter ? year : undefined,
        quarter: quarter ?? undefined,
        sort,
    };
    const list = useProjects({ ...filters, page, pageSize: PAGE_SIZE });
    const totals = useProjectTotals(filters, seesMoney);
    const counts = useProjectStatusCounts(domain);
    const clients = useClients({ domain, includeArchived: true, sort: "name", pageSize: 100 }, permissions.has(P.CLIENT_VIEW));
    const people = useDomainPeople(domain, permissions.has(P.EMPLOYEE_VIEW), { status: "active" });
    const showNew = params.get("new") === "1";

    const reset = (fn: () => void) => { fn(); setPage(1); };
    const clearFilters = () => reset(() => { setSearch(""); setStatus("all"); setQuarter(null); setOwner("all"); setType("all"); setClient("all"); });
    const closeNew = () => { params.delete("new"); params.delete("client"); setParams(params, { replace: true }); };

    const columns: Column<ProjectSummary>[] = [
        {
            key: "project", header: "Project", width: "22%",
            cell: (p) => (
                <div className="pname">
                    <ProjectTile icon={p.icon} tint={p.tint} />
                    <div style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 6 }}>
                            <span className="trunc" style={{ fontWeight: 650, fontSize: 13 }}>{p.title}</span>
                            {p.startDate === companyToday() && <span className="badge badge-new">New</span>}
                        </div>
                        <div className="muted trunc" style={{ fontSize: "11.5px", maxWidth: 340 }}>{p.description || "No description"}</div>
                    </div>
                </div>
            ),
        },
        { key: "client", header: "Client", cell: (p) => <ClientBadge client={p.client && { id: p.client.id, displayName: p.client.displayName }} sub={false} /> },
        { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
        { key: "progress", header: "Progress", width: 110, cell: (p) => <Bar value={p.progressPct} tone={p.status === "completed" ? "ok" : p.status === "hold" ? "warn" : ""} /> },
        ...(seesWork ? [{ key: "hours", header: "Hours", right: true, mono: true, cell: (p: ProjectSummary) => fmtH(p.work?.totalMinutes ?? 0) }] : []),
        ...(seesMoney ? [
            { key: "revenue", header: "Revenue", right: true, mono: true, cell: (p: ProjectSummary) => (p.billingType === "internal" ? <span className="muted">-</span> : money.short(p.money?.revenue ?? 0)) },
            { key: "cost", header: "Cost", right: true, mono: true, cell: (p: ProjectSummary) => money.short(p.money?.cost ?? 0) },
            {
                key: "profit", header: "Profit", right: true,
                cell: (p: ProjectSummary) => {
                    const internal = p.billingType === "internal";
                    const profit = p.money?.profit ?? 0;
                    return <span className={cx("mono", internal ? "muted" : profit >= 0 ? "up" : "down")}>{money.short(internal ? -(p.money?.cost ?? 0) : profit)}</span>;
                },
            },
            { key: "margin", header: "Margin", cell: (p: ProjectSummary) => <MarginPill value={p.money?.marginKnown ? p.money.margin : null} internal={p.billingType === "internal"} label={false} /> },
        ] : []),
        ...(seesWork ? [{
            key: "activity", header: "Activity", width: 110,
            cell: (p: ProjectSummary) => {
                const level = activityLevelOf(p.work?.activityLevel);
                return (
                    <>
                        <div className="row" style={{ gap: 7 }}>
                            <Signal level={level} />
                            <Spark values={p.work?.weekly ?? []} width={54} height={16} dim={level === 0} />
                        </div>
                        <div className="muted" style={{ fontSize: 11 }}>{p.work?.lastStartedAt ? relDay(p.work.lastStartedAt) : "no work yet"}</div>
                    </>
                );
            },
        }] : []),
        {
            key: "team", header: "Team",
            cell: (p) => {
                const team = p.work?.contributors ?? p.team?.people ?? [];
                return <Avatars people={team} max={4} link total={p.work?.contributorCount ?? p.team?.count} />;
            },
        },
        {
            key: "menu", header: "",
            cell: (p) => (
                <span onClick={(e) => e.stopPropagation()}>
                    <MenuButton icon="dots" label="Project actions">
                        {(close) => (
                            <div>
                                <button className="pop-item" onClick={() => { close(); navigate(`/${domain}/projects/${p.id}`); }}><Icon name="eye" />Open project</button>
                                {!site && seesMoney && permissions.has(P.WORK_ENTRY_VIEW_ALL) && (
                                    <button className="pop-item" onClick={() => { close(); navigate(`/${domain}/projects/${p.id}?report=1`); }}><Icon name="download" />Export report</button>
                                )}
                                {permissions.has(P.PROJECT_CHANGE_STATUS) && (
                                    <>
                                        <div className="pop-sep" />
                                        <ProjectStatusItems project={p} close={close} onComplete={() => navigate(`/${domain}/projects/${p.id}?complete=1`)} />
                                    </>
                                )}
                            </div>
                        )}
                    </MenuButton>
                </span>
            ),
        },
    ];

    const total = counts.all;
    const t = totals.data;
    return (
        <div className="page">
            <PageHead
                title="Projects"
                sub={total == null ? " " : `${total} project${total === 1 ? "" : "s"} · ${counts.active ?? 0} active`}
                actions={permissions.has(P.PROJECT_CREATE) && (
                    <button className="btn btn-primary" onClick={() => { params.set("new", "1"); setParams(params); }}><Icon name="plus" />New project</button>
                )}
            />

            {seesMoney && (
                <div style={{ marginBottom: 12 }}>
                    <KpiStrip loading={!t} items={[
                        { key: "revenue", label: "Revenue", value: money.short(t?.revenue ?? 0), sub: <span>{t?.clientProjects ?? 0} client projects</span> },
                        { key: "cost", label: "Cost", value: money.short(t?.cost ?? 0), sub: <span>labour and project expenses</span> },
                        { key: "profit", label: "Profit", value: money.short(t?.profit ?? 0), sub: <span>client work only</span> },
                        { key: "internal", label: "Internal cost", value: money.short(t?.internalCost ?? 0), sub: <span>{t?.internalProjects ?? 0} internal projects</span> },
                    ]} />
                </div>
            )}

            <div className="filters">
                <SearchInput value={search} onChange={(v) => reset(() => setSearch(v))} placeholder="Search projects" />
                <ChipGroup value={status} onChange={(v) => reset(() => setStatus(v))} aria-label="Status" options={[
                    { value: "all", label: "All", count: counts.all },
                    { value: "active", label: "Active", count: counts.active },
                    { value: "hold", label: "On hold", count: counts.hold },
                    { value: "completed", label: "Completed", count: counts.completed },
                    { value: "archived", label: "Archived", count: counts.archived },
                ]} />
                <FilterSep />
                <div className="chips">
                    {[1, 2, 3, 4].map((q) => (
                        <button key={q} className={cx("chip", quarter === q && "on")} onClick={() => reset(() => setQuarter(quarter === q ? null : q))}>Q{q}</button>
                    ))}
                    <Select className="select sm" style={{ width: 88 }} aria-label="Year" value={String(year)}
                        options={[thisYear, thisYear - 1].map((y) => ({ value: String(y), label: String(y) }))} onChange={(v) => reset(() => setYear(+v))} />
                </div>
                {seesMoney && !site && (
                    <>
                        <FilterSep />
                        <ChipGroup value={type} onChange={(v) => reset(() => setType(v))} aria-label="Type" options={[
                            { value: "all", label: "All work" }, { value: "client", label: "Client" }, { value: "internal", label: "Internal" },
                        ]} />
                    </>
                )}
                {permissions.has(P.CLIENT_VIEW) && (
                    <Select className="select sm" style={{ width: 175 }} aria-label="Client" value={client} onChange={(v) => reset(() => setClient(v))} options={[
                        { value: "all", label: "All clients" },
                        ...(site ? [] : [{ value: "internal", label: "Internal (no client)" }]),
                        ...(clients.data?.items ?? []).map((c) => ({ value: String(c.id), label: c.displayName })),
                    ]} />
                )}
                <div className="grow" />
                {permissions.has(P.EMPLOYEE_VIEW) && (
                    <Select className="select sm" style={{ width: 160 }} aria-label="Owner" value={owner} onChange={(v) => reset(() => setOwner(v))} options={[
                        { value: "all", label: "All owners" },
                        ...(people.data ?? []).map((p) => ({ value: String(p.id), label: personName(p) })),
                    ]} />
                )}
                <Select className="select sm" style={{ width: 165 }} aria-label="Sort" value={sort} onChange={(v) => reset(() => setSort(v))}
                    options={SORTS.filter((s) => seesWork || s.value !== "hours").map((s) => ({ value: s.value, label: `Sort: ${s.label}` }))} />
            </div>

            <div className="panel">
                <DataTable
                    columns={columns}
                    rows={list.data?.items}
                    rowKey={(p) => p.id}
                    loading={list.isPending}
                    error={list.error}
                    onRetry={() => list.refetch()}
                    what="the projects"
                    minWidth="tbl-min"
                    onRowClick={(p) => navigate(`/${domain}/projects/${p.id}`)}
                />
                {list.data && list.data.items.length === 0 && (
                    <Empty art="search" title="No projects match these filters" text="Try a different quarter or status, or clear the search."
                        action={<button className="btn" onClick={clearFilters}>Clear filters</button>} />
                )}
                {list.data && list.data.items.length > 0 && (
                    <div className="panel-foot">
                        <span>{list.data.totalCount} of {total ?? list.data.totalCount} projects</span>
                        <div className="grow" />
                        {list.data.totalCount > PAGE_SIZE
                            ? <Pager page={page} pageSize={PAGE_SIZE} total={list.data.totalCount} onPage={setPage} />
                            : <span className="muted">Quarter filter matches any project that was open during that quarter.</span>}
                    </div>
                )}
            </div>

            {showNew && permissions.has(P.PROJECT_CREATE) && <CreateProjectModal domain={domain} initialClient={params.get("client")} onClose={closeNew} />}
        </div>
    );
}
