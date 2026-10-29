import { useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { errorMessage, toApiError } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { CostRow } from "@/shared/components/Data/Money";
import Pager from "@/shared/components/Data-Tables/Pager";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import Select from "@/shared/components/Forms/Select";
import useDebounce from "@/shared/hooks/useDebounce";
import { plural } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import { addDays, companyToday, startOfWeek } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../shared/projects/projectsApi";
import { isSiteOpen } from "../projects/siteMoney";
import MaterialGrid, { type GridRow } from "./MaterialGrid";
import MaterialSheet from "./MaterialSheet";
import { COLS, entryOf, link, problems, rowOf, STATED_KEYS, TOTAL_AT, type ColKey, type Row } from "./materialRules";
import { useDeleteMaterial, useMaterials, useUpdateMaterial, type Material, type MaterialQuery } from "./materialsApi";
import { loadFailed } from "@/api/queryState";

const PER_PAGE = 30;
const NUMBERS: ColKey[] = ["quantity", "unitCost", "amount"];

function periods(today: string): Record<string, [string, string]> {
    return {
        week: ["This week", startOfWeek(today)],
        month: ["This month", `${today.slice(0, 8)}01`],
        "30d": ["Last 30 days", addDays(today, -30)],
        "90d": ["Last 3 months", addDays(today, -90)],
    };
}

/**
 * What has been delivered or used on site and what it cost (the prototype's EX.MaterialsPanel), shared by the
 * admin's project page and the employee's. The recorded materials are the same spreadsheet as the Add
 * materials sheet, edited in place: each change is saved when the cell is left.
 */
export default function MaterialsPanel({ project }: { project: Project }) {
    const [type, setType] = useState("");
    const [q, setQ] = useState("");
    const [supplier, setSupplier] = useState("");
    const [by, setBy] = useState("");
    const [period, setPeriod] = useState("");
    const [page, setPage] = useState(1);
    const [adding, setAdding] = useState(false);
    // what a cell was left with, shown until the save settles; a refused change goes back to what is saved
    const [pending, setPending] = useState<Record<string, string>>({});
    const topRef = useRef<HTMLDivElement>(null);
    const search = useDebounce({ value: q.trim(), debounceTimeMs: 250 });
    const today = companyToday();
    const PERIODS = periods(today);
    const query: MaterialQuery = {
        type: type || undefined, supplier: supplier || undefined, addedById: by ? +by : undefined,
        from: PERIODS[period]?.[1], search: search || undefined, page, pageSize: PER_PAGE,
    };
    const list = useMaterials(project.id, query);
    const update = useUpdateMaterial(project.id);
    const remove = useDeleteMaterial(project.id);

    const open = isSiteOpen(project);
    // what the client is charged, and the profit on it, are in Material margins under this table and on statements
    const cols = COLS;
    const d = list.data;
    const filtering = !!(type || supplier || by || period || q.trim());
    const onlyType = type && !supplier && !by && !period && !q.trim() ? d?.types.find((t) => t.key === type)?.label : null;
    const filterLabel = onlyType ?? "filtered";
    const canAdd = d?.canAdd ?? false;
    // ?materials=add opens the sheet (Proton fills it there)
    const [params, setParams] = useSearchParams();
    const linked = canAdd && params.get("materials") === "add";
    const closeAdding = () => {
        setAdding(false);
        if (params.has("materials")) { params.delete("materials"); setParams(params, { replace: true }); }
    };
    const items = d?.items ?? [];
    // a page emptied by a deletion or a filter falls back to the last one there is
    const pages = Math.max(1, Math.ceil((d?.matching.count ?? 0) / PER_PAGE));
    if (d && !list.isPlaceholderData && page > pages) setPage(pages);

    function filter(set: (v: string) => void) {
        return (v: string) => { set(v); setPage(1); };
    }
    function clearFilters() {
        setType(""); setQ(""); setSupplier(""); setBy(""); setPeriod(""); setPage(1);
    }
    const keyOf = (m: Material, k: ColKey) => `${m.id}:${k}`;
    /** Shows these cells' new values until the save settles, and returns what ends that. */
    function hold(m: Material, cells: Partial<Row>) {
        const held = Object.entries(cells).map(([k, v]) => [keyOf(m, k as ColKey), v] as const);
        setPending((p) => ({ ...p, ...Object.fromEntries(held) }));
        return () => setPending((p) => { const next = { ...p }; held.forEach(([key]) => delete next[key]); return next; });
    }
    const canForce = usePermissions().has(P.FINANCIAL_VIEW);
    const notSaved = (e: unknown) => {
        const failure = toApiError(e);
        if (failure.code === "profit_floor" && failure.blockedChangeId != null && canForce) {
            params.set("blocked", String(failure.blockedChangeId));
            setParams(params);
            return;
        }
        toast({ text: "Not saved", sub: failure.message, icon: "alert" });
    };

    // A cell left with a new value saves the material. A change that would leave it without a type or a
    // cost is refused here, and the cell shows what is saved again.
    function save(r: number, k: ColKey, v: string) {
        const m = items[r];
        // what the row shows, with any change still being saved
        const row = shownRow(m);
        if (v === row[k]) return;
        if (NUMBERS.includes(k) && !(+v > 0) && !(+row[k] > 0)) return;
        let next = { ...row, [k]: NUMBERS.includes(k) && !(+v > 0) ? "" : v };
        // a quantity cleared takes its unit with it
        if (k === "quantity" && !next.quantity) next.unit = "";
        next = link(next, k);
        const bad = problems(next);
        if (bad) {
            toast({ text: "Not saved", sub: bad.name ?? bad.amount ?? bad.quantity ?? bad.unitCost, icon: "alert" });
            return;
        }
        const release = hold(m, Object.fromEntries((Object.keys(next) as ColKey[]).filter((c) => next[c] !== row[c]).map((c) => [c, next[c]])));
        update.mutate({ id: m.id, body: entryOf(next) }, { onSettled: release, onError: notSaved });
    }
    function del(m: Material) {
        remove.mutate(m.id, {
            onSuccess: () => toast({ text: `${m.name} removed`, sub: `${money.exact(m.cost)} no longer counts toward material cost`, icon: "trash" }),
            onError: (e) => toast({ text: `${m.name} wasn't removed`, sub: errorMessage(e), icon: "alert" }),
        });
    }

    function shownRow(m: Material) {
        const row = rowOf(m);
        for (const k of Object.keys(row) as ColKey[]) row[k] = pending[keyOf(m, k)] ?? row[k];
        return row;
    }
    const rows: GridRow[] = items.map((m) => ({
        ...shownRow(m), id: m.id, by: m.addedBy.name, title: m.isStated ? "On a client statement: its type, cost and price are fixed" : undefined,
    }));
    const locked = (r: number, k: ColKey) => {
        const m = items[r];
        return !m.canEdit || (m.isStated && STATED_KEYS.includes(k));
    };

    return (
        <div className="panel mt">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Materials</div>
                    <div className="panel-sub">What has been delivered or used on site, and what it cost. Click any cell to change it.</div>
                </div>
                <div className="panel-tools">
                    {canAdd ? <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}><Icon name="plus" />Add materials</button>
                        : !open && <span className="badge">Closed to new entries</span>}
                </div>
            </div>
            <div className="panel-body">
                {loadFailed(list) ? <LoadError error={list.error} retry={() => list.refetch()} what="the materials" />
                    : !d ? <SkeletonLines lines={6} />
                        : d.all.count === 0 ? (
                            <Empty art="search" title="No materials logged yet"
                                text="Every delivery or on-site purchase belongs here - it is the main cost driver for this project."
                                action={canAdd ? <button className="btn btn-primary" onClick={() => setAdding(true)}>Add materials</button> : undefined} />
                        ) : (
                            <div>
                                <div className="mat-filters">
                                    <div className="mat-search">
                                        <Icon name="search" />
                                        <input className="input sm" type="search" placeholder="Search type, supplier, note…" aria-label="Search materials" value={q}
                                            onChange={(e) => { setQ(e.target.value); setPage(1); }} />
                                    </div>
                                    <Select className="select sm" aria-label="Filter by type" value={type} onChange={filter(setType)}
                                        options={[{ value: "", label: `All types (${d.types.length})` }, ...d.types.map((t) => ({ value: t.key, label: `${t.label} (${t.count})` }))]} />
                                    {d.suppliers.length > 0 && (
                                        <Select className="select sm" aria-label="Filter by supplier" value={supplier} onChange={filter(setSupplier)}
                                            options={[{ value: "", label: "All suppliers" }, ...d.suppliers.map((s) => ({ value: s.key, label: s.label }))]} />
                                    )}
                                    <Select className="select sm" aria-label="Filter by who added it" value={by} onChange={filter(setBy)}
                                        options={[{ value: "", label: "Anyone" }, ...d.addedBy.map((p) => ({ value: String(p.id), label: p.name }))]} />
                                    <Select className="select sm" aria-label="Filter by date added" value={period} onChange={filter(setPeriod)}
                                        options={[{ value: "", label: "Any time" }, ...Object.entries(PERIODS).map(([k, [label]]) => ({ value: k, label }))]} />
                                    {filtering && <button className="btn btn-sm btn-quiet" onClick={clearFilters}><Icon name="x" />Clear</button>}
                                    <span className="grow" />
                                    {filtering && <span className="muted" style={{ fontSize: 12 }}>{d.matching.count} of {d.all.count} shown</span>}
                                </div>
                                {filtering ? (
                                    <CostRow strong label={`Material cost · ${filterLabel}`} value={money.fmt(d.matching.cost)}
                                        meta={`${d.matching.count} of ${d.all.count} items · ${money.exact(d.all.cost)} for everything`} />
                                ) : (
                                    <CostRow strong label="Material cost" value={money.fmt(d.all.cost)} meta={`${d.all.count} items · ${plural(d.types.length, "type")}`} />
                                )}
                                {filtering && d.matching.count === 0 && (
                                    <div className="banner mt-s">
                                        <Icon name="search" />
                                        <div className="grow">No materials match these filters.</div>
                                        <button className="btn btn-sm" onClick={clearFilters}>Clear filters</button>
                                    </div>
                                )}
                                <div ref={topRef} className={cx("mt-s pg-anchor", filtering && d.matching.count === 0 && "hide")}>
                                    <MaterialGrid cols={cols} rows={rows} offset={(page - 1) * PER_PAGE} showBy dash locked={locked}
                                        canDelete={(r) => items[r].canEdit && !items[r].isStated}
                                        onCell={(r, k, v, typing) => { if (!typing) save(r, k, v); }}
                                        onDelete={(r) => del(items[r])}
                                        foot={
                                            <tfoot>
                                                <tr>
                                                    <td />
                                                    <td colSpan={TOTAL_AT} className="r"><b>{filtering ? `Material cost · ${filterLabel}` : "Material cost"}</b></td>
                                                    <td className="r mono"><b>{money.exact(d.matching.cost)}</b></td>
                                                    <td colSpan={COLS.length - TOTAL_AT - 1 + 2}>
                                                        {filtering && <span className="muted">of {money.exact(d.all.cost)} for everything</span>}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        } />
                                    <Pager page={page} pageSize={PER_PAGE} total={d.matching.count} onPage={setPage} anchor={topRef} />
                                </div>
                            </div>
                        )}
            </div>
            {(adding || linked) && <MaterialSheet project={project} onClose={closeAdding} />}
        </div>
    );
}
