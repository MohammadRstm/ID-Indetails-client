import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import { money } from "@/shared/format/money";
import { addMonths, companyToday, fmtDateY, fmtMonthY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useOneOffs, useRemoveOneOff, type OneOff } from "./companyApi";

/** How far back the stepper goes. */
const MONTHS_BACK = 36;

/**
 * The company's one-off expenses of a month, newest day first, under the recurring ones. This month's can be
 * changed; a past month is read-only. Totals are per currency, as the API gives them.
 */
export default function OneOffPanel({ onEdit }: { onEdit: (item: OneOff) => void }) {
    const thisMonth = companyToday().slice(0, 7);
    const [month, setMonth] = useState(thisMonth);
    const list = useOneOffs(month);
    const remove = useRemoveOneOff();
    const data = list.data;

    function removeItem(item: OneOff) {
        if (!window.confirm(`Remove ${item.name}? It will no longer count against the company's profit.`)) return;
        remove.mutate(item.id, {
            onSuccess: () => toast({ text: `${item.name} removed`, icon: "trash" }),
            onError: (e) => toast({ text: `${item.name} wasn't removed`, sub: errorMessage(e), icon: "alert" }),
        });
    }

    return (
        <div className="panel mt">
            <div className="panel-head">
                <div>
                    <div className="panel-title">One-off expenses</div>
                    <div className="panel-sub">Costs paid once, such as a refrigerator or a repair. Each counts in full on the day it was spent and comes out of the company's net profit.</div>
                </div>
                <div className="panel-tools row" style={{ gap: 4 }}>
                    <button className="icon-btn" aria-label="Previous month" disabled={month <= addMonths(thisMonth, -MONTHS_BACK)} onClick={() => setMonth((m) => addMonths(m, -1))}><Icon name="chevronLeft" /></button>
                    <b style={{ minWidth: 116, textAlign: "center" }}>{fmtMonthY(`${month}-01`)}</b>
                    <button className="icon-btn" aria-label="Next month" disabled={month >= thisMonth} onClick={() => setMonth((m) => addMonths(m, 1))}><Icon name="chevronRight" /></button>
                </div>
            </div>
            {loadFailed(list) ? <div className="panel-body"><LoadError error={list.error} retry={() => list.refetch()} what="the one-off expenses" /></div>
                : !data ? <div className="panel-body"><SkeletonLines lines={3} /></div> : (
                    <div className="tbl-wrap">
                        {data.items.length === 0 ? <p className="muted" style={{ padding: 14 }}>No one-off expenses in {fmtMonthY(`${month}-01`)}.</p> : (
                            <table className="tbl tbl-min-sm">
                                <thead><tr><th>Name</th><th>Category</th><th>Day</th><th className="r">Amount</th>{data.items.some((i) => i.canEdit) && <th />}</tr></thead>
                                <tbody>
                                    {data.items.map((item) => (
                                        <tr key={item.id}>
                                            <td><b>{item.name}</b></td>
                                            <td className="muted">{item.group.name}</td>
                                            <td className="muted nowrap">{fmtDateY(item.spentOn)}</td>
                                            <td className="r mono">{money.fmt(item.amount, item.currency)}</td>
                                            {data.items.some((i) => i.canEdit) && (
                                                <td className="r">
                                                    {item.canEdit && (
                                                        <MenuButton icon="dots" label={`${item.name} actions`} width={170}>
                                                            {(close) => (
                                                                <div>
                                                                    <button className="pop-item" onClick={() => { close(); onEdit(item); }}><Icon name="edit" />Edit</button>
                                                                    <button className="pop-item" onClick={() => { close(); removeItem(item); }}><Icon name="trash" />Remove</button>
                                                                </div>
                                                            )}
                                                        </MenuButton>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            <div className="panel-foot">
                <span className="muted grow">
                    {data && !data.isOpen ? "This month has closed, so its one-off expenses can't be changed." : "A one-off expense can be changed until its month closes."}
                </span>
                {data && data.totals.length > 0 && <b className="mono">{data.totals.map((t) => money.fmt(t.total, t.currency)).join(" + ")}</b>}
            </div>
        </div>
    );
}
