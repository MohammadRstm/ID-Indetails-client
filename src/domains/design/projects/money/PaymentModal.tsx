import { useState } from "react";
import FormFailure from "@/domains/shared/projects/FormFailure";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import { PAYMENT_DESCRIPTION_MAX, useSetPayment } from "../../../shared/projects/paymentApi";
import type { Project } from "../../../shared/projects/projectsApi";
import TvaField from "../../../shared/projects/TvaField";

/**
 * A client project's customer payment and why it changes (the prototype's PF.PaymentModal, with the reason the
 * project report needs). Both are required; the change joins the payment history.
 */
/** <paramref name="onSaved"/> follows a save, instead of closing: the page offers to send the quote. */
export default function PaymentModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved?: () => void }) {
    const save = useSetPayment(project.id);
    const current = project.money?.revenue ?? 0;
    const currentTva = project.money?.tvaRate ?? 0;
    const [amount, setAmount] = useState(current);
    const [tvaPct, setTvaPct] = useState<number | "">(Math.round(currentTva * 10000) / 100);
    const tva = Math.round((+tvaPct || 0) * 100) / 10000;
    const [description, setDescription] = useState("");
    const errors = useFormErrors();
    const amountError = amount === current && tva === currentTva && `The payment is already ${money.exact(current)} with ${money.pct(currentTva)} TVA: change one of them.`;
    const descriptionError = !description.trim() ? "Say why the payment changes."
        : description.trim().length > PAYMENT_DESCRIPTION_MAX && `At most ${PAYMENT_DESCRIPTION_MAX} characters.`;

    function submit() {
        if (save.isPending) return;
        if (amountError || descriptionError) return errors.tried();
        save.mutate({ revenue: amount, tvaRate: tva, description: description.trim() }, {
            onSuccess: () => {
                toast({ text: `Payment set to ${money.fmt(amount)}`, sub: project.title, icon: "checkCircle" });
                (onSaved ?? onClose)();
            },
        });
    }

    return (
        <Modal surfaceId="project_payment_terms" title="Customer payment" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{save.error ? <FormFailure error={save.error} onForced={onSaved ?? onClose} /> : "The payment can be changed until the project is completed."}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>{save.isPending ? "Saving…" : "Save"}</button>
                </>
            }>
            <div className="field">
                <label className="label required" htmlFor="pay-amount">Customer payment</label>
                <AmountField id="pay-amount" value={amount} currency="USD" currencies={false} onChange={setAmount} />
                <div className="hint">Total amount the company is paid for this project. Now {money.exact(current)}.</div>
                <FieldError message={errors.show("amount", amountError)} />
            </div>
            <div className="mt">
                <TvaField id="pay-tva" value={tvaPct} onChange={setTvaPct} />
                <div className="hint">On everything the client pays. They only see totals with it included. Now {money.pct(currentTva)}.</div>
            </div>
            <div className="field mt">
                <label className="label required" htmlFor="pay-why">Why it changes</label>
                <AutoGrowTextarea id="pay-why" className="input" minRows={3} maxRows={10} maxLength={PAYMENT_DESCRIPTION_MAX} value={description}
                    placeholder="e.g. The client added a guest house to the brief." onChange={(e) => setDescription(e.target.value)} onBlur={errors.touch("description")} />
                <div className="hint">Kept in the payment history, for the project report.</div>
                <FieldError message={errors.show("description", descriptionError)} />
            </div>
        </Modal>
    );
}
