import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import Modal from "@/shared/components/Overlays/Modal";
import { plural } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../shared/projects/projectsApi";
import { useAllMaterials } from "../materials/materialsApi";
import { useSetPricing } from "./siteApi";
import { siteMoneyOf } from "./siteMoney";

const MARKUPS = [0, 5, 10, 15, 25];
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The project fee and the default material profit (the prototype's EX.MoneyModal). A new default re-prices
 * every material still on it; one with a price of its own, or already on a client statement, keeps its price.
 */
export default function PricingModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const x = siteMoneyOf(project.money!);
    const materials = useAllMaterials(project.id).data?.items;
    const save = useSetPricing(project.id);
    const [fee, setFee] = useState(x.fee);
    const [pct, setPct] = useState<number | "">(Math.round(x.markup * 1000) / 10);
    const markup = pct === "" ? 0 : pct;
    const valid = markup >= 0 && markup <= 500;

    const list = materials ?? [];
    const auto = list.filter((m) => m.priceSource === "auto").length;
    const own = list.filter((m) => m.priceSource === "manual").length;
    const stated = list.filter((m) => m.priceSource === "stated").length;
    const charge = materials
        ? r2(list.reduce((t, m) => t + (m.priceSource === "auto" ? r2(m.cost * (1 + markup / 100)) : m.clientPrice ?? m.cost), 0))
        : x.materialCharge;
    const agreed = r2(charge + fee);
    const changedMarkup = markup / 100 !== x.markup;
    const keep = [own > 0 && `${own} with a price of their own`, stated > 0 && `${stated} already on a client statement`].filter(Boolean).join(" and ");

    function submit() {
        if (!valid) return;
        save.mutate({ projectFee: fee, materialMarkup: Math.round(markup * 100) / 10000 }, {
            onSuccess: (saved) => {
                const m = saved.money;
                toast({
                    text: "Fee & material profit saved",
                    sub: m ? `Agreed so far ${money.exact(m.revenue)} · expected profit ${money.exact(m.profit)}` : undefined,
                    icon: "checkCircle",
                });
                onClose();
            },
        });
    }

    return (
        <Modal title="Fee & material profit" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>
                        {save.error ? <span className="err"><Icon name="alert" />{errorMessage(save.error)}</span> : (
                            <>Agreed so far {money.exact(x.agreed)} → <b className="mono" style={{ color: "var(--ink)" }}>{money.exact(agreed)}</b></>
                        )}
                    </div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={!valid || save.isPending} onClick={submit}>{save.isPending ? "Saving…" : "Save"}</button>
                </>
            }>
            <div className="field">
                <label className="label" htmlFor="xm-fee">Project fee</label>
                <AmountField id="xm-fee" value={fee} currencies={false} onChange={setFee} />
                <div className="hint">A fixed amount for doing the job, on top of what materials earn. Ground labour is paid out of it.</div>
            </div>
            <div className="field mt">
                <label className="label" htmlFor="xm-markup">Default material profit</label>
                <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
                    {MARKUPS.map((v) => (
                        <button key={v} type="button" className={cx("chip", markup === v && pct !== "" && "on")} onClick={() => setPct(v)}>{v}%</button>
                    ))}
                    <input id="xm-markup" className="input mono" type="number" min={0} max={500} step={0.5} style={{ width: 80 }} aria-label="Material profit percent"
                        value={pct} onChange={(e) => setPct(e.target.value === "" ? "" : +e.target.value)} />
                    <span className="muted">%</span>
                </div>
                <div className={cx("hint", !valid && "down")}>
                    {!valid ? "Between 0% and 500%."
                        : changedMarkup && auto === 0 ? `Applies to materials added from now on${keep ? `: the ${keep} keep their price.` : "."}`
                        : changedMarkup ? `Re-prices the ${plural(auto, "material")} on the default material profit${keep ? `; the ${keep} keep their price.` : "."}`
                            : "What new materials are charged at, over their cost. Any material can still get a price of its own."}
                </div>
            </div>
            <div className="xm-owed mt">
                <div><span>Materials charged</span><b className="mono">{money.exact(charge)}</b><em>on {money.exact(x.materialCost)} cost</em></div>
                <div><span>Expected profit</span><b className="mono">{money.exact(r2(agreed - x.spent))}</b><em>after labour and expenses so far</em></div>
            </div>
        </Modal>
    );
}
