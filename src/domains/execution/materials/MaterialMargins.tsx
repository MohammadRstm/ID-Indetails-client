import { useState } from "react";
import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Select from "@/shared/components/Forms/Select";
import Icon from "@/shared/icons/Icon";
import { money } from "@/shared/format/money";
import { fmtDate } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../shared/projects/projectsApi";
import { pctOf } from "../projects/siteMoney";
import { useAllMaterials, type Material } from "./materialsApi";

/** Client price − supplier cost, and that as a share of the cost. */
const marginOf = (m: Material) => {
    const price = m.clientPrice ?? 0;
    return { amount: price - m.cost, share: m.cost > 0 ? (price - m.cost) / m.cost : null };
};

/** The profit filter's choices: how much a material earns, or that it loses. */
const PROFITS: Record<string, [string, (profit: number) => boolean]> = {
    over200: ["Profit over $200", (p) => p > 200],
    over500: ["Profit over $500", (p) => p > 500],
    some: ["Any profit", (p) => p > 0.005],
    none: ["Charged as is", (p) => Math.abs(p) <= 0.005],
    loss: ["At a loss", (p) => p < -0.005],
};

/**
 * What each material earns or loses: its supplier cost against the price the client is charged. For people who see money.
 */
export default function MaterialMargins({ project }: { project: Project }) {
    const query = useAllMaterials(project.id);
    const priced = (query.data?.items ?? []).filter((m) => m.clientPrice != null);
    const [q, setQ] = useState("");
    const [supplier, setSupplier] = useState("");
    const [profit, setProfit] = useState("");
    const suppliers = [...new Set(priced.map((m) => m.supplier).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b));
    const words = q.trim().toLowerCase();
    const filtering = !!words || !!supplier || !!profit;
    const items = priced.filter((m) =>
        (!words || [m.name, m.supplier, m.note].some((t) => t?.toLowerCase().includes(words)))
        && (!supplier || m.supplier === supplier)
        && (!profit || PROFITS[profit][1](marginOf(m).amount)));
    const clear = () => { setQ(""); setSupplier(""); setProfit(""); };
    const total = (list: Material[]) => list.reduce((t, m) => ({ cost: t.cost + m.cost, price: t.price + (m.clientPrice ?? 0) }), { cost: 0, price: 0 });
    const all = total(items);

    return (
        <div className="panel mt">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Material margins</div>
                    <div className="panel-sub">What the supplier charged against what the client is charged, material by material.</div>
                </div>
            </div>
            {loadFailed(query) ? <div className="panel-body"><LoadError error={query.error} retry={() => query.refetch()} what="the materials" /></div>
                : !query.data ? <div className="panel-body"><SkeletonLines lines={4} /></div>
                    : priced.length === 0 ? <div className="panel-body"><p className="muted">No materials yet.</p></div> : (
                        <>
                        <div className="panel-body mat-filters" style={{ paddingBottom: 10 }}>
                            <div className="mat-search">
                                <Icon name="search" />
                                <input className="input sm" type="search" placeholder="Search material, supplier, note…" aria-label="Search material margins"
                                    value={q} onChange={(e) => setQ(e.target.value)} />
                            </div>
                            {suppliers.length > 0 && (
                                <Select className="select sm" aria-label="Margins by supplier" value={supplier} onChange={setSupplier}
                                    options={[{ value: "", label: "All suppliers" }, ...suppliers.map((s) => ({ value: s, label: s }))]} />
                            )}
                            <Select className="select sm" aria-label="Margins by profit" value={profit} onChange={setProfit}
                                options={[{ value: "", label: "Any profit or none" }, ...Object.entries(PROFITS).map(([k, [label]]) => ({ value: k, label }))]} />
                            {filtering && <button className="btn btn-sm btn-quiet" onClick={clear}><Icon name="x" />Clear</button>}
                            <span className="grow" />
                            {filtering && <span className="muted" style={{ fontSize: 12 }}>{items.length} of {priced.length} shown</span>}
                        </div>
                        {items.length === 0 ? <div className="panel-body"><p className="muted">No materials match these filters.</p></div> : (
                        <div className="tbl-wrap">
                            <table className="tbl tbl-min-sm">
                                <thead>
                                    <tr>
                                        <th>Material</th><th>Supplier</th><th className="r">Supplier cost</th><th className="r">Client price</th>
                                        <th className="r">Profit</th><th className="r">%</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((m) => {
                                        const margin = marginOf(m);
                                        return (
                                            <tr key={m.id}>
                                                <td>
                                                    <b>{m.name}</b>
                                                    <div className="muted" style={{ fontSize: "11.5px" }}>
                                                        {m.quantity != null ? `${m.quantity}${m.unit ? ` ${m.unit}` : ""} · ` : ""}added {fmtDate(m.addedOn)}
                                                    </div>
                                                </td>
                                                <td className="muted">{m.supplier ?? "-"}</td>
                                                <td className="r mono">{money.exact(m.cost)}</td>
                                                <td className="r mono">{money.exact(m.clientPrice ?? 0)}</td>
                                                <td className={cx("r mono", margin.amount < 0 ? "down" : margin.amount > 0 && "up")}>{margin.amount >= 0 ? "+" : "−"}{money.exact(Math.abs(margin.amount))}</td>
                                                <td className={cx("r mono", margin.amount < 0 && "down")}>{margin.share == null ? "-" : pctOf(margin.share)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="tfoot-row">
                                        <td colSpan={2}><b>{filtering ? "The materials shown" : "Every material"}</b></td>
                                        <td className="r mono">{money.exact(all.cost)}</td>
                                        <td className="r mono">{money.exact(all.price)}</td>
                                        <td className={cx("r mono", all.price < all.cost && "down")} style={{ fontWeight: 700 }}>{money.exact(all.price - all.cost)}</td>
                                        <td className="r mono">{all.cost > 0 ? pctOf((all.price - all.cost) / all.cost) : "-"}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        )}
                        </>
                    )}
        </div>
    );
}
