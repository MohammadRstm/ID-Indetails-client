import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
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

/**
 * What each material earns or loses: its supplier cost against the price the client is charged, and whether it has
 * been sent to the client yet (only then is its price revenue). For people who see money.
 */
export default function MaterialMargins({ project }: { project: Project }) {
    const query = useAllMaterials(project.id);
    const items = (query.data?.items ?? []).filter((m) => m.clientPrice != null);
    const sent = items.filter((m) => m.sentOn);
    const total = (list: Material[]) => list.reduce((t, m) => ({ cost: t.cost + m.cost, price: t.price + (m.clientPrice ?? 0) }), { cost: 0, price: 0 });
    const all = total(items), sentTotal = total(sent);

    return (
        <div className="panel mt">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Material margins</div>
                    <div className="panel-sub">What the supplier charged against what the client is charged, material by material. A price becomes revenue once a statement sends it to the client.</div>
                </div>
            </div>
            {loadFailed(query) ? <div className="panel-body"><LoadError error={query.error} retry={() => query.refetch()} what="the materials" /></div>
                : !query.data ? <div className="panel-body"><SkeletonLines lines={4} /></div>
                    : items.length === 0 ? <div className="panel-body"><p className="muted">No materials yet.</p></div> : (
                        <div className="tbl-wrap">
                            <table className="tbl tbl-min-sm">
                                <thead>
                                    <tr>
                                        <th>Material</th><th>Supplier</th><th className="r">Supplier cost</th><th className="r">Client price</th>
                                        <th className="r">Margin</th><th className="r">%</th><th>Sent to client</th>
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
                                                <td>{m.sentOn ? <span className="badge badge-active">Sent {fmtDate(m.sentOn)}</span> : <span className="badge badge-hold">Not yet</span>}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="tfoot-row">
                                        <td colSpan={2}><b>Sent to the client</b><div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{sent.length} of {items.length} · counted in revenue</div></td>
                                        <td className="r mono">{money.exact(sentTotal.cost)}</td>
                                        <td className="r mono">{money.exact(sentTotal.price)}</td>
                                        <td className={cx("r mono", sentTotal.price < sentTotal.cost && "down")}>{money.exact(sentTotal.price - sentTotal.cost)}</td>
                                        <td className="r mono">{sentTotal.cost > 0 ? pctOf((sentTotal.price - sentTotal.cost) / sentTotal.cost) : "-"}</td>
                                        <td />
                                    </tr>
                                    <tr className="tfoot-row">
                                        <td colSpan={2}><b>Every material</b></td>
                                        <td className="r mono">{money.exact(all.cost)}</td>
                                        <td className="r mono">{money.exact(all.price)}</td>
                                        <td className={cx("r mono", all.price < all.cost && "down")} style={{ fontWeight: 700 }}>{money.exact(all.price - all.cost)}</td>
                                        <td className="r mono">{all.cost > 0 ? pctOf((all.price - all.cost) / all.cost) : "-"}</td>
                                        <td />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
        </div>
    );
}
