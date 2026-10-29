import { useState } from "react";
import FormFailure from "@/domains/shared/projects/FormFailure";
import { toast } from "@/shared/components/Feedback/toast";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import { FieldError } from "@/shared/components/Forms/Field";
import NumberField from "@/shared/components/Forms/NumberField";
import { MARKUP_PERCENT } from "@/shared/format/limits";
import Modal from "@/shared/components/Overlays/Modal";
import { plural } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import { cx } from "@/shared/utils/cx";
import { PAYMENT_DESCRIPTION_MAX } from "../../shared/projects/paymentApi";
import type { Project } from "../../shared/projects/projectsApi";
import PercentField from "../../shared/projects/PercentField";
import TvaField from "../../shared/projects/TvaField";
import { useAllMaterials } from "../materials/materialsApi";
import { useSetPricing } from "./siteApi";
import { siteMoneyOf } from "./siteMoney";

const MARKUPS = [0, 5, 10, 15, 25];
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The supervision rate, the TVA and the default material profit (the prototype's EX.MoneyModal), and why they change,
 * which joins the payment history. The work price isn't here: it is set when a bill of quantities is agreed. A new
 * default re-prices every material still on it; one with a price of its own, or already on a client statement,
 * keeps its price.
 */
export default function PricingModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved?: () => void }) {
    const x = siteMoneyOf(project.money!);
    const materials = useAllMaterials(project.id).data?.items;
    const save = useSetPricing(project.id);
    const [pct, setPct] = useState<number | "">(Math.round(x.markup * 1000) / 10);
    const [description, setDescription] = useState("");
    const currentSupervision = project.money!.supervisionRate ?? 0;
    const [supervisionPct, setSupervisionPct] = useState<number | "">(Math.round(currentSupervision * 10000) / 100);
    const supervision = Math.round((+supervisionPct || 0) * 100) / 10000;
    const currentTva = project.money!.tvaRate;
    const [tvaPct, setTvaPct] = useState<number | "">(Math.round(currentTva * 10000) / 100);
    const tva = Math.round((+tvaPct || 0) * 100) / 10000;
    const errors = useFormErrors();
    const markup = pct === "" ? 0 : pct;
    const valid = markup >= 0 && markup <= 500;
    const unchanged = supervision === currentSupervision && Math.round(markup * 100) / 10000 === x.markup && tva === currentTva
        && "Change the supervision, the TVA or the material profit, or cancel.";
    const descriptionError = !description.trim() ? "Say why the supervision, the TVA or the material profit changes."
        : description.trim().length > PAYMENT_DESCRIPTION_MAX && `At most ${PAYMENT_DESCRIPTION_MAX} characters.`;

    const list = materials ?? [];
    const auto = list.filter((m) => m.priceSource === "auto").length;
    const own = list.filter((m) => m.priceSource === "manual").length;
    const stated = list.filter((m) => m.priceSource === "stated").length;
    const charge = materials
        ? r2(list.reduce((t, m) => t + (m.priceSource === "auto" ? r2(m.cost * (1 + markup / 100)) : m.clientPrice ?? m.cost), 0))
        : x.materialCharge;
    const changedMarkup = markup / 100 !== x.markup;
    const keep = [own > 0 && `${own} with a price of their own`, stated > 0 && `${stated} already on a client statement`].filter(Boolean).join(" and ");

    function submit() {
        if (!valid || save.isPending) return;
        if (unchanged || descriptionError) return errors.tried();
        save.mutate({ supervisionRate: supervision, materialMarkup: Math.round(markup * 100) / 10000, tvaRate: tva, description: description.trim() }, {
            onSuccess: (saved) => {
                const m = saved.money;
                toast({
                    text: "Pricing saved",
                    sub: m ? `Agreed so far ${money.exact(m.revenue)} · expected profit ${money.exact(m.profit)}` : undefined,
                    icon: "checkCircle",
                });
                (onSaved ?? onClose)();
            },
        });
    }

    return (
        <Modal surfaceId="site_pricing" title="Pricing" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>
                        {save.error ? <FormFailure error={save.error} onForced={onSaved ?? onClose} /> : <>Agreed so far {money.exact(x.agreed)}</>}
                    </div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={!valid || save.isPending} onClick={submit}>{save.isPending ? "Saving…" : "Save"}</button>
                </>
            }>
            <div className="field">
                <div className="label">Work price</div>
                <div>{x.fee > 0 ? <b className="mono">{money.exact(x.fee)}</b> : <span className="muted">Set when a BOQ is agreed</span>}</div>
                <div className="hint">It comes from the bills of quantities agreed with the client, so it isn't typed in here.</div>
            </div>
            <div className="mt">
                <PercentField id="xm-supervision" label="Supervision" value={supervisionPct} onChange={setSupervisionPct} />
                <div className="hint">A percentage of the work price, charged on top. Now {money.pct(currentSupervision)}.</div>
            </div>
            <div className="mt">
                <TvaField id="xm-tva" value={tvaPct} onChange={setTvaPct} />
                <div className="hint">Charged on the work price only, never on supervision. The client only sees totals with it included. Now {money.pct(currentTva)}.</div>
            </div>
            <div className="field mt">
                <label className="label required" htmlFor="xm-markup">Default material profit</label>
                <div className="row wrap" style={{ gap: 6, alignItems: "center" }}>
                    {MARKUPS.map((v) => (
                        <button key={v} type="button" className={cx("chip", markup === v && pct !== "" && "on")} onClick={() => setPct(v)}>{v ? `${v}%` : "As is"}</button>
                    ))}
                    <NumberField id="xm-markup" shape={MARKUP_PERCENT} style={{ width: 80 }} aria-label="Material profit percent"
                        value={pct} onChange={(text) => setPct(text === "" ? "" : +text)} />
                    <span className="muted">%</span>
                </div>
                <div className={cx("hint", !valid && "down")}>
                    {!valid ? "Between 0% and 500%."
                        : changedMarkup && auto === 0 ? `Applies to materials added from now on${keep ? `: the ${keep} keep their price.` : "."}`
                        : changedMarkup ? `Re-prices the ${plural(auto, "material")} on the default material profit${keep ? `; the ${keep} keep their price.` : "."}`
                            : "What new materials are charged at, over their cost. Any material can still get a price of its own."}
                </div>
            </div>
            <FieldError message={errors.show("unchanged", unchanged)} />
            <div className="field mt">
                <label className="label required" htmlFor="xm-why">Why it changes</label>
                <AutoGrowTextarea id="xm-why" className="input" minRows={3} maxRows={10} maxLength={PAYMENT_DESCRIPTION_MAX} value={description}
                    placeholder="e.g. The client asked for a second floor." onChange={(e) => setDescription(e.target.value)} onBlur={errors.touch("description")} />
                <div className="hint">Kept in the payment history, for the project report.</div>
                <FieldError message={errors.show("description", descriptionError)} />
            </div>
            <div className="xm-owed mt">
                <div><span>Materials charged</span><b className="mono">{money.exact(charge)}</b><em>on {money.exact(x.materialCost)} cost</em></div>
            </div>
        </Modal>
    );
}
