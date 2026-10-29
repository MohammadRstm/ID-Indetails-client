import { useState } from "react";
import { toApiError } from "@/api/errors";
import FormFailure from "@/domains/shared/projects/FormFailure";
import { toast } from "@/shared/components/Feedback/toast";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import { PAYMENT_DESCRIPTION_MAX } from "../../shared/projects/paymentApi";
import type { Project } from "../../shared/projects/projectsApi";
import PercentField from "../../shared/projects/PercentField";
import TvaField from "../../shared/projects/TvaField";
import { useSetPricing } from "./siteApi";
import { siteMoneyOf } from "./siteMoney";

/**
 * The supervision rate and the TVA (the prototype's EX.MoneyModal), and why they change, which joins the payment
 * history. The work price isn't here: it is set when a bill of quantities is agreed. Site expenses are costs and carry
 * no markup, so nothing else is priced.
 */
export default function PricingModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved?: () => void }) {
    const x = siteMoneyOf(project.money!);
    const save = useSetPricing(project.id);
    const [description, setDescription] = useState("");
    const currentSupervision = project.money!.supervisionRate ?? 0;
    const [supervisionPct, setSupervisionPct] = useState<number | "">(Math.round(currentSupervision * 10000) / 100);
    const supervision = Math.round((+supervisionPct || 0) * 100) / 10000;
    const currentTva = project.money!.tvaRate;
    const [tvaPct, setTvaPct] = useState<number | "">(Math.round(currentTva * 10000) / 100);
    const tva = Math.round((+tvaPct || 0) * 100) / 10000;
    const errors = useFormErrors();
    // what the API refused, beside what it was about; it goes as soon as something is changed
    const refused = toApiError(save.error).fieldErrors;
    const edited = () => { if (save.error) save.reset(); };
    const unchanged = supervision === currentSupervision && tva === currentTva && "Change the supervision or the TVA, or cancel.";
    const descriptionError = !description.trim() ? "Say why the supervision or the TVA changes."
        : description.trim().length > PAYMENT_DESCRIPTION_MAX && `At most ${PAYMENT_DESCRIPTION_MAX} characters.`;

    function submit() {
        if (save.isPending) return;
        if (unchanged || descriptionError) return errors.tried();
        save.mutate({ supervisionRate: supervision, tvaRate: tva, description: description.trim() }, {
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
                    <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>{save.isPending ? "Saving…" : "Save"}</button>
                </>
            }>
            <div className="field">
                <div className="label">Work price</div>
                <div>{x.fee > 0 ? <b className="mono">{money.exact(x.fee)}</b> : <span className="muted">Set when a BOQ is agreed</span>}</div>
                <div className="hint">It comes from the bills of quantities agreed with the client, so it isn't typed in here.</div>
            </div>
            <div className="mt">
                <PercentField id="xm-supervision" label="Supervision" value={supervisionPct} onChange={(v) => { edited(); setSupervisionPct(v); }} />
                <div className="hint">A percentage of the work price, charged on top. Now {money.pct(currentSupervision)}.</div>
                <FieldError message={refused.supervisionRate} />
            </div>
            <div className="mt">
                <TvaField id="xm-tva" value={tvaPct} onChange={(v) => { edited(); setTvaPct(v); }} />
                <div className="hint">Charged on the work price only, never on supervision. The client only sees totals with it included. Now {money.pct(currentTva)}.</div>
                <FieldError message={refused.tvaRate} />
            </div>
            <FieldError message={errors.show("unchanged", unchanged)} />
            <div className="field mt">
                <label className="label required" htmlFor="xm-why">Why it changes</label>
                <AutoGrowTextarea id="xm-why" className="input" minRows={3} maxRows={10} maxLength={PAYMENT_DESCRIPTION_MAX} value={description}
                    placeholder="e.g. The client asked for a second floor." onChange={(e) => { edited(); setDescription(e.target.value); }} onBlur={errors.touch("description")} />
                <div className="hint">Kept in the payment history, for the project report.</div>
                <FieldError message={errors.show("description", descriptionError) ?? refused.description} />
            </div>
        </Modal>
    );
}
