import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { PAYMENT_DESCRIPTION_MAX, useSetPayment } from "../../../shared/projects/paymentApi";
import type { Project } from "../../../shared/projects/projectsApi";

/**
 * A client project's customer payment and why it changes (the prototype's PF.PaymentModal, with the reason the
 * project report needs). Both are required; the change joins the payment history.
 */
export default function PaymentModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const save = useSetPayment(project.id);
    const current = project.money?.revenue ?? 0;
    const [amount, setAmount] = useState(current);
    const [description, setDescription] = useState("");
    const errors = useFormErrors();
    const amountError = amount === current && `The payment is already ${money.exact(current)}: enter the new amount.`;
    const descriptionError = !description.trim() ? "Say why the payment changes."
        : description.trim().length > PAYMENT_DESCRIPTION_MAX && `At most ${PAYMENT_DESCRIPTION_MAX} characters.`;

    function submit() {
        if (save.isPending) return;
        if (amountError || descriptionError) return errors.tried();
        save.mutate({ revenue: amount, description: description.trim() }, {
            onSuccess: () => {
                toast({ text: `Payment set to ${money.fmt(amount)}`, sub: project.title, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal surfaceId="project_payment_terms" title="Customer payment" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{save.error ? <span className="err"><Icon name="alert" />{errorMessage(save.error)}</span> : "The payment can be changed until the project is completed."}</div>
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
