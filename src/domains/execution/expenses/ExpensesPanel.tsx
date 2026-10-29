import { useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { errorMessage, toApiError } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useAccountLabels } from "@/domains/shared/accountLabels/accountLabelsApi";
import { CostRow, MixedCurrency } from "@/shared/components/Data/Money";
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
import ExpenseGrid, { type GridRow } from "./ExpenseGrid";
import ExpenseSheet from "./ExpenseSheet";
import {
    CATEGORIES, COLS, CURRENCIES, entryOf, firstProblem, labelChoices, link, listTotals, problems, rowOf, TOTAL_AT, writeTotals, type Choices, type ColKey, type CurrencyTotal, type Row,
} from "./expenseRules";
import { useDeleteExpense, useExpenses, useUpdateExpense, type ExpenseQuery, type SiteExpense } from "./expensesApi";

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

/** The other currencies' totals, shown apart from the dollars: pounds are never added to them. */
const others = (totals: CurrencyTotal[]) => totals.filter((t) => t.currency !== "USD").map((t) => ({ currency: t.currency, amount: t.total }));

/**
 * What has been spent on site and what it cost (the prototype's EX.MaterialsPanel, now a list of expenses of every
 * kind: materials, a contractor, equipment, fees), shared by the admin's project page and the employee's. The recorded
 * expenses are the same spreadsheet as the Add expenses sheet, edited in place: each change is saved when the cell
 * is left. Nothing here is charged to the client.
 */
export default function ExpensesPanel({ project }: { project: Project }) {
    const [type, setType] = useState("");
    const [q, setQ] = useState("");
    const [supplier, setSupplier] = useState("");
    const [by, setBy] = useState("");
    const [category, setCategory] = useState("");
    const [label, setLabel] = useState("");
    const [period, setPeriod] = useState("");
    const [page, setPage] = useState(1);
    const [adding, setAdding] = useState(false);
    // what a cell was left with, shown until the save settles; a refused change goes back to what is saved
    const [pending, setPending] = useState<Record<string, string>>({});
    const topRef = useRef<HTMLDivElement>(null);
    const search = useDebounce({ value: q.trim(), debounceTimeMs: 250 });
    const today = companyToday();
    const PERIODS = periods(today);
    const permissions = usePermissions();
    // whoever sets the labels up sees the archived ones too, to find what is filed under them
    const labels = useAccountLabels(permissions.has(P.COMPANY_SETTINGS_MANAGE)).data;
    const query: ExpenseQuery = {
        type: type || undefined, supplier: supplier || undefined, addedById: by ? +by : undefined,
        category: CATEGORIES.find((c) => c.value === category)?.value, accountLabelId: label ? +label : undefined,
        from: PERIODS[period]?.[1], search: search || undefined, page, pageSize: PER_PAGE,
    };
    const list = useExpenses(project.id, query);
    const update = useUpdateExpense(project.id);
    const remove = useDeleteExpense(project.id);

    const open = isSiteOpen(project);
    const cols = COLS;
    const d = list.data;
    const filtering = !!(type || supplier || by || category || label || period || q.trim());
    const onlyType = type && !supplier && !by && !category && !label && !period && !q.trim() ? d?.types.find((t) => t.key === type)?.label : null;
    const filterLabel = onlyType ?? "filtered";
    const canAdd = d?.canAdd ?? false;
    // ?materials=add opens the sheet (Proton fills it there; its form is still called materials)
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
        setType(""); setQ(""); setSupplier(""); setBy(""); setCategory(""); setLabel(""); setPeriod(""); setPage(1);
    }
    const keyOf = (e: SiteExpense, k: ColKey) => `${e.id}:${k}`;
    /** Shows these cells' new values until the save settles, and returns what ends that. */
    function hold(e: SiteExpense, cells: Partial<Row>) {
        const held = Object.entries(cells).map(([k, v]) => [keyOf(e, k as ColKey), v] as const);
        setPending((p) => ({ ...p, ...Object.fromEntries(held) }));
        return () => setPending((p) => { const next = { ...p }; held.forEach(([key]) => delete next[key]); return next; });
    }
    const canForce = permissions.has(P.FINANCIAL_VIEW);
    const notSaved = (e: unknown) => {
        const failure = toApiError(e);
        if (failure.code === "profit_floor" && failure.blockedChangeId != null && canForce) {
            params.set("blocked", String(failure.blockedChangeId));
            setParams(params);
            return;
        }
        toast({ text: "Not saved", sub: failure.message, icon: "alert" });
    };

    // A cell left with a new value saves the expense. A change that would leave it without an item or a
    // cost is refused here, and the cell shows what is saved again.
    function save(r: number, k: ColKey, v: string) {
        const e = items[r];
        // what the row shows, with any change still being saved
        const row = shownRow(e);
        if (v === row[k]) return;
        if (NUMBERS.includes(k) && !(+v > 0) && !(+row[k] > 0)) return;
        let next = { ...row, [k]: NUMBERS.includes(k) && !(+v > 0) ? "" : v };
        // a quantity cleared takes its unit with it
        if (k === "quantity" && !next.quantity) next.unit = "";
        next = link(next, k);
        const bad = problems(next);
        if (bad) {
            toast({ text: "Not saved", sub: firstProblem(bad), icon: "alert" });
            return;
        }
        const release = hold(e, Object.fromEntries((Object.keys(next) as ColKey[]).filter((c) => next[c] !== row[c]).map((c) => [c, next[c]])));
        update.mutate({ id: e.id, body: entryOf(next) }, { onSettled: release, onError: notSaved });
    }
    function del(e: SiteExpense) {
        remove.mutate(e.id, {
            onSuccess: () => toast({ text: `${e.name} removed`, sub: `${money.exact(e.cost, e.currency)} no longer counts toward the site's cost`, icon: "trash" }),
            onError: (err) => toast({ text: `${e.name} wasn't removed`, sub: errorMessage(err), icon: "alert" }),
        });
    }

    function shownRow(e: SiteExpense) {
        const row = rowOf(e);
        for (const k of Object.keys(row) as (keyof Row)[]) row[k] = pending[keyOf(e, k as ColKey)] ?? row[k];
        return row;
    }
    const rows: GridRow[] = items.map((e) => ({
        ...shownRow(e), id: e.id, by: e.addedBy.name,
    }));
    const locked = (r: number) => !items[r].canEdit;
    const choices: Choices = { currency: CURRENCIES, category: CATEGORIES };
    const labelOptions = (e: SiteExpense) => labelChoices(labels, e.accountLabel);

    const matching = d ? listTotals(d.matching) : [];
    const all = d ? listTotals(d.all) : [];
    const footLabel = filtering ? `Expenses · ${filterLabel}` : "Expenses";

    return (
        <div className="panel mt">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Expenses</div>
                    <div className="panel-sub">What has been spent on site, and what it cost. Click any cell to change it.</div>
                </div>
                <div className="panel-tools">
                    {canAdd ? <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}><Icon name="plus" />Add expenses</button>
                        : !open && <span className="badge">Closed to new entries</span>}
                </div>
            </div>
            <div className="panel-body">
                {loadFailed(list) ? <LoadError error={list.error} retry={() => list.refetch()} what="the expenses" />
                    : !d ? <SkeletonLines lines={6} />
                        : d.all.count === 0 ? (
                            <Empty art="search" title="No expenses recorded yet"
                                text="Every delivery, contractor payment or on-site purchase belongs here - it is the main cost driver for this project."
                                action={canAdd ? <button className="btn btn-primary" onClick={() => setAdding(true)}>Add expenses</button> : undefined} />
                        ) : (
                            <div>
                                <div className="mat-filters">
                                    <div className="mat-search">
                                        <Icon name="search" />
                                        <input className="input sm" type="search" placeholder="Search item, supplier, note…" aria-label="Search expenses" value={q}
                                            onChange={(e) => { setQ(e.target.value); setPage(1); }} />
                                    </div>
                                    <Select className="select sm" aria-label="Filter by item" value={type} onChange={filter(setType)}
                                        options={[{ value: "", label: `All items (${d.types.length})` }, ...d.types.map((t) => ({ value: t.key, label: `${t.label} (${t.count})` }))]} />
                                    <Select className="select sm" aria-label="Filter by category" value={category} onChange={filter(setCategory)}
                                        options={[{ value: "", label: "All categories" }, ...CATEGORIES]} />
                                    {labels && labels.length > 0 && (
                                        <Select className="select sm" aria-label="Filter by account label" value={label} onChange={filter(setLabel)}
                                            options={[{ value: "", label: "All labels" }, ...labels.map((l) => ({ value: String(l.id), label: l.archived ? `${l.name} (archived)` : l.name }))]} />
                                    )}
                                    {d.suppliers.length > 0 && (
                                        <Select className="select sm" aria-label="Filter by supplier or payee" value={supplier} onChange={filter(setSupplier)}
                                            options={[{ value: "", label: "All suppliers / payees" }, ...d.suppliers.map((s) => ({ value: s.key, label: s.label }))]} />
                                    )}
                                    <Select className="select sm" aria-label="Filter by who added it" value={by} onChange={filter(setBy)}
                                        options={[{ value: "", label: "Anyone" }, ...d.addedBy.map((p) => ({ value: String(p.id), label: p.name }))]} />
                                    <Select className="select sm" aria-label="Filter by date spent" value={period} onChange={filter(setPeriod)}
                                        options={[{ value: "", label: "Any time" }, ...Object.entries(PERIODS).map(([k, [name]]) => ({ value: k, label: name }))]} />
                                    {filtering && <button className="btn btn-sm btn-quiet" onClick={clearFilters}><Icon name="x" />Clear</button>}
                                    <span className="grow" />
                                    {filtering && <span className="muted" style={{ fontSize: 12 }}>{d.matching.count} of {d.all.count} shown</span>}
                                </div>
                                {filtering ? (
                                    <CostRow strong label={footLabel} value={money.fmt(d.matching.cost)}
                                        meta={<>{d.matching.count} of {plural(d.all.count, "expense")} · {money.exact(d.all.cost)} for everything <MixedCurrency amounts={others(matching)} /></>} />
                                ) : (
                                    <CostRow strong label="Expenses" value={money.fmt(d.all.cost)}
                                        meta={<>{plural(d.all.count, "expense")} · {plural(d.types.length, "kind of item", "kinds of item")} <MixedCurrency amounts={others(all)} /></>} />
                                )}
                                {filtering && d.matching.count === 0 && (
                                    <div className="banner mt-s">
                                        <Icon name="search" />
                                        <div className="grow">No expenses match these filters.</div>
                                        <button className="btn btn-sm" onClick={clearFilters}>Clear filters</button>
                                    </div>
                                )}
                                <div ref={topRef} className={cx("mt-s pg-anchor", filtering && d.matching.count === 0 && "hide")}>
                                    <ExpenseGrid cols={cols} rows={rows} offset={(page - 1) * PER_PAGE} showBy dash locked={locked} minWidth={1240}
                                        canDelete={(r) => items[r].canEdit}
                                        choices={(r, k) => (k === "accountLabelId" ? labelOptions(items[r]) : choices[k] ?? [])}
                                        onCell={(r, k, v, typing) => { if (!typing) save(r, k, v); }}
                                        onDelete={(r) => del(items[r])}
                                        foot={
                                            <tfoot>
                                                {matching.map((t) => (
                                                    <tr key={t.currency}>
                                                        <td />
                                                        <td colSpan={TOTAL_AT} className="r"><b>{footLabel}{matching.length > 1 ? ` · ${t.currency}` : ""}</b></td>
                                                        <td className="r mono"><b>{money.exact(t.total, t.currency)}</b></td>
                                                        <td colSpan={COLS.length - TOTAL_AT - 1 + 2}>
                                                            {filtering && <span className="muted">of {writeTotals(all.filter((a) => a.currency === t.currency))} for everything</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tfoot>
                                        } />
                                    <Pager page={page} pageSize={PER_PAGE} total={d.matching.count} onPage={setPage} anchor={topRef} />
                                </div>
                            </div>
                        )}
            </div>
            {(adding || linked) && <ExpenseSheet project={project} onClose={closeAdding} />}
        </div>
    );
}
