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
import { SearchInput } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import { Avatars } from "@/shared/components/Identity/People";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import useDebounce from "@/shared/hooks/useDebounce";
import { Money } from "@/shared/components/Data/Money";
import { companyToday, fmtH, fmtNumber, relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useOverview } from "../../design/dashboard/overviewApi";
import { MyActiveCount, MyLogButtons, MyProjectCards, MyWorkBand } from "../../design/work/EmployeeHome";
import { SiteActiveCount, SiteCards } from "../../execution/staff/SiteHome";
import { ClientBadge } from "../clients/ClientBits";
import { useClients } from "../clients/clientsApi";
import { useDomainPeople, personName } from "../people/peopleApi";
import CreateProjectModal from "./CreateProjectModal";
import GreetingHead from "./GreetingHead";
import ProjectFiltersDrawer from "./ProjectFilters";
import { activeFilters, type ProjectFilterValues } from "./projectFilters";
import ProjectStatusItems from "./ProjectStatusItems";
import { useProjects, useProjectStatusCounts, useProjectTotals, type ProjectListParams, type ProjectSort, type ProjectSummary } from "./projectsApi";
import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import HelpHint from "@/domains/shared/help/HelpHint";

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

/**
 * The projects page, for everyone, its parts by permission. Someone who logs work (work_entry:view_own) is
 * greeted and gets their week, today and overtime (the prototype's P.EmpProjects). Someone who oversees the
 * business - its money, everyone's work or project status - gets the table of all its projects (the prototype's
 * P.AdminProjects); anyone else gets the cards of the projects they work on.
 */
export default function ProjectsPage() {
    const domain = useDomain();
    const permissions = usePermissions();
    const [params, setParams] = useSearchParams();
    const design = domain === "design";
    const own = design && permissions.has(P.WORK_ENTRY_VIEW_OWN);
    const records = !design && permissions.hasAny(P.MATERIAL_CREATE, P.MATERIAL_MANAGE, P.LABOUR_REPORT_CREATE, P.LABOUR_REPORT_MANAGE);
    const oversees = permissions.hasAny(P.FINANCIAL_VIEW, P.WORK_ENTRY_VIEW_ALL, P.PROJECT_CHANGE_STATUS);
    // the cards list only what one works on, so they give way to the table once someone oversees more
    const cards = (design ? own : records) && !oversees;
    const greeting = design ? own : cards;
    const closeNew = () => { params.delete("new"); params.delete("client"); setParams(params, { replace: true }); };

    return (
        <div className="page">
            {greeting && (
                <GreetingHead sub={design ? <MyActiveCount /> : <SiteActiveCount />}
                    actions={own && permissions.has(P.WORK_ENTRY_CREATE) && <MyLogButtons />} />
            )}
            {own && <MyWorkBand />}
            {cards ? (design ? <MyProjectCards /> : <SiteCards />) : <ProjectTable section={greeting} />}
            {params.get("new") === "1" && permissions.has(P.PROJECT_CREATE) && <CreateProjectModal domain={domain} initialClient={params.get("client")} onClose={closeNew} />}
        </div>
    );
}

/**
 * All the business's projects in a table (the prototype's P.AdminProjects): the page's own head, or a section
 * under the greeting.
 */
function ProjectTable({ section }: { section: boolean }) {
    const domain = useDomain();
    const navigate = useNavigate();
    const permissions = usePermissions();
    const [params, setParams] = useSearchParams();
    const site = domain === "execution";
    const seesMoney = permissions.has(P.FINANCIAL_VIEW);
    // Hours and activity come from logged work, so only for people who may see everyone's.
    const seesWork = permissions.has(P.WORK_ENTRY_VIEW_ALL);

    const [search, setSearch] = useState("");
    const thisYear = +companyToday().slice(0, 4);
    // every filter but the search is chosen in the Filters panel
    const [filtered, setFiltered] = useState<ProjectFilterValues>({ status: "all", quarter: null, year: thisYear, type: "all", client: params.get("client") ?? "all", owner: "all" });
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [sort, setSort] = useState<ProjectSort>("activity");
    const [page, setPage] = useState(1);
    const debounced = useDebounce({ value: search, debounceTimeMs: 250 });

    const filters: ProjectListParams = {
        domain,
        search: debounced.trim() || undefined,
        status: filtered.status === "all" ? undefined : filtered.status,
        // archived projects show only once Archived is chosen
        excludeArchived: filtered.status === "all" ? true : undefined,
        clientId: filtered.client !== "all" && filtered.client !== "internal" ? +filtered.client : undefined,
        billingType: filtered.client === "internal" ? "internal" : filtered.type === "all" ? undefined : filtered.type,
        ownerId: filtered.owner === "all" ? undefined : +filtered.owner,
        year: filtered.quarter ? filtered.year : undefined,
        quarter: filtered.quarter ?? undefined,
        sort,
    };
    const list = useProjects({ ...filters, page, pageSize: PAGE_SIZE });
    const totals = useProjectTotals(filters, seesMoney);
    const counts = useProjectStatusCounts(domain);
    // the quarter's logged hours, from the dashboard's own query (Design work, report:view)
    const thisQuarter = useOverview("quarter", domain === "design" && permissions.has(P.REPORT_VIEW)).data;
    const clients = useClients({ domain, includeArchived: true, sort: "name", pageSize: 100 }, permissions.has(P.CLIENT_VIEW));
    const people = useDomainPeople(domain, permissions.has(P.EMPLOYEE_VIEW), { status: "active" });

    const reset = (fn: () => void) => { fn(); setPage(1); };
    const changeFilters = (patch: Partial<ProjectFilterValues>) => reset(() => setFiltered((current) => ({ ...current, ...patch })));
    const turnFiltersOff = () => changeFilters({ status: "all", quarter: null, type: "all", client: "all", owner: "all" });
    const clearAll = () => reset(() => { setSearch(""); setFiltered((current) => ({ ...current, status: "all", quarter: null, type: "all", client: "all", owner: "all" })); });
    const on = activeFilters(filtered, {
        client: (id) => clients.data?.items.find((c) => String(c.id) === id)?.displayName ?? "Client",
        owner: (id) => { const person = people.data?.find((p) => String(p.id) === id); return person ? personName(person) : "Owner"; },
    });
    // the choices of the long lists, for whoever may see clients or people
    const clientOptions = permissions.has(P.CLIENT_VIEW) ? [
        { value: "all", label: "All clients" },
        ...(site ? [] : [{ value: "internal", label: "Internal (no client)" }]),
        ...(clients.data?.items ?? []).map((c) => ({ value: String(c.id), label: c.displayName })),
    ] : null;
    const ownerOptions = permissions.has(P.EMPLOYEE_VIEW) ? [
        { value: "all", label: "All owners" },
        ...(people.data ?? []).map((p) => ({ value: String(p.id), label: personName(p) })),
    ] : null;

    const columns: Column<ProjectSummary>[] = [
        {
            key: "project", header: "Project", width: "22%",
            cell: (p) => (
                <div className="pname">
                    <ProjectTile icon={p.icon} tint={p.tint} photo={p.photoFileId} />
                    <div style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 6 }}>
                            <span className="trunc" style={{ fontWeight: 650, fontSize: 13 }}>{p.title}</span>
                            {p.startDate === companyToday() && <span className="badge badge-new">New</span>}
                        </div>
                        <div className="muted trunc" style={{ fontSize: "11.5px", maxWidth: 340 }}>{[p.location, p.description].filter(Boolean).join(" · ") || "No description"}</div>
                    </div>
                </div>
            ),
        },
        { key: "client", header: "Client", cell: (p) => <ClientBadge client={p.client && { id: p.client.id, displayName: p.client.displayName }} sub={false} link={permissions.has(P.CLIENT_VIEW)} /> },
        { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
        { key: "progress", header: "Progress", width: 110, cell: (p) => <Bar value={p.progressPct} tone={p.status === "completed" ? "ok" : p.status === "hold" ? "warn" : ""} /> },
        ...(seesWork ? [{ key: "hours", header: "Hours", right: true, mono: true, cell: (p: ProjectSummary) => fmtH(p.work?.totalMinutes ?? 0) }] : []),
        ...(seesMoney ? [
            { key: "revenue", header: "Revenue", right: true, mono: true, cell: (p: ProjectSummary) => (p.billingType === "internal" ? <span className="muted">-</span> : <Money short value={p.money?.revenue ?? 0} />) },
            { key: "cost", header: "Cost", right: true, mono: true, cell: (p: ProjectSummary) => <Money short value={p.money?.cost ?? 0} /> },
            {
                key: "profit", header: "Profit", right: true,
                cell: (p: ProjectSummary) => {
                    const internal = p.billingType === "internal";
                    const profit = p.money?.profit ?? 0;
                    return <span className={cx("mono", internal ? "muted" : profit >= 0 ? "up" : "down")}><Money short value={internal ? -(p.money?.cost ?? 0) : profit} /></span>;
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
    const sub = total == null ? " " : `${total} project${total === 1 ? "" : "s"} · ${counts.active ?? 0} active${thisQuarter ? ` · ${fmtNumber(Math.round(thisQuarter.minutes / 60))}h logged this quarter` : ""}`;
    const newProject = permissions.has(P.PROJECT_CREATE) && (
        <button className="btn btn-primary" onClick={() => { params.set("new", "1"); setParams(params); }}><Icon name="plus" />New project</button>
    );
    return (
        <>
            {section ? (
                <div className="row wrap" style={{ gap: 10, margin: "22px 0 10px", alignItems: "baseline" }}>
                    <h2 className="page-title" style={{ fontSize: 15 }}>All projects</h2>
                    <span className="muted" style={{ fontSize: 12 }}>{sub}</span>
                    <div className="grow" />
                    {newProject}
                </div>
            ) : <PageHead title="Projects" sub={sub} actions={newProject} />}

            {seesMoney && loadFailed(totals) && (
                <div className="panel" style={{ marginBottom: 12 }}><div className="panel-body"><LoadError error={totals.error} retry={() => totals.refetch()} what="the projects' money" /></div></div>
            )}
            {seesMoney && !loadFailed(totals) && (
                <div style={{ marginBottom: 12 }}>
                    <KpiStrip loading={!t} items={[
                        {
                            key: "revenue", value: <Money short value={t?.revenue ?? 0} />, sub: <span>{t?.clientProjects ?? 0} client projects</span>,
                            label: <>Revenue<HelpHint article="revenue" label="revenue">What was agreed with the clients of these projects, whether paid yet or not.</HelpHint></>,
                        },
                        {
                            key: "cost", value: <Money short value={t?.cost ?? 0} />, sub: <span>labour and project expenses</span>,
                            label: <>Cost<HelpHint article="project-cost" label="cost">The hours logged at each person's rate, a share of paid breaks, and the projects' expenses.</HelpHint></>,
                        },
                        { key: "profit", label: "Profit", value: <Money short value={t?.profit ?? 0} />, sub: <span>client work only</span> },
                        { key: "internal", label: "Internal cost", value: <Money short value={t?.internalCost ?? 0} />, sub: <span>{t?.internalProjects ?? 0} internal projects</span> },
                    ]} />
                </div>
            )}

            <div className="filters">
                <SearchInput value={search} onChange={(v) => reset(() => setSearch(v))} placeholder="Search projects" />
                {/* status, time, type, client and owner: all in one panel, grouped */}
                <button type="button" className={cx("btn", on.length > 0 && "btn-filtered")} aria-haspopup="dialog" onClick={() => setFiltersOpen(true)}
                    aria-label={on.length > 0 ? `Filters, ${on.length} on` : "Filters"}>
                    <Icon name="filter" />Filters{on.length > 0 && <span className="filter-count" aria-hidden="true">{on.length}</span>}
                </button>
                <div className="grow" />
                <Select className="select sm" style={{ width: 165 }} aria-label="Sort" value={sort} onChange={(v) => reset(() => setSort(v))}
                    options={SORTS.filter((s) => seesWork || s.value !== "hours").map((s) => ({ value: s.value, label: `Sort: ${s.label}` }))} />
            </div>
            {on.length > 0 && (
                <div className="filter-chips" role="group" aria-label="Filters that are on">
                    {on.map((filter) => (
                        <button key={filter.key} type="button" className="chip on" aria-label={`Remove filter: ${filter.label}`} onClick={() => changeFilters(filter.clear)}>
                            {filter.label}<Icon name="x" />
                        </button>
                    ))}
                    <button type="button" className="btn btn-quiet btn-sm" onClick={turnFiltersOff}>Clear all</button>
                </div>
            )}
            {filtersOpen && (
                <ProjectFiltersDrawer values={filtered} onChange={changeFilters} onClear={turnFiltersOff} onClose={() => setFiltersOpen(false)}
                    counts={counts} years={[thisYear, thisYear - 1]} showType={seesMoney && !site} clients={clientOptions} owners={ownerOptions}
                    matching={list.data?.totalCount} anyOn={on.length > 0} />
            )}

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
                        action={<button className="btn" onClick={clearAll}>Clear filters</button>} />
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
        </>
    );
}
