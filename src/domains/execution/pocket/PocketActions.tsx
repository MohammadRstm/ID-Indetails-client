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
import type { Project } from "../../shared/projects/projectsApi";
import { POCKET_NOTE_MAX, useAskPocket, useContributeToPocket } from "./pocketApi";

/** The site's profit, as the API checks it. */
function profitOf(project: Project) {
    return project.money?.profit ?? 0;
}

/** Part of a site's money moved into the pocket money: less than its profit, so it stays above zero. */
export function MoveToPocketModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const move = useContributeToPocket();
    const profit = profitOf(project);
    const [amount, setAmount] = useState(0);
    const [note, setNote] = useState("");
    const errors = useFormErrors();
    const amountError = amount <= 0 ? "Enter an amount."
        : amount >= profit ? (profit > 0 ? `Move less than ${money.exact(profit)}, so the site's profit stays above zero.` : "The site has no profit to move.") : false;
    const noteError = note.trim().length > POCKET_NOTE_MAX && `At most ${POCKET_NOTE_MAX} characters.`;

    function submit() {
        if (move.isPending) return;
        if (amountError || noteError) return errors.tried();
        move.mutate({ projectId: project.id, amount, note: note.trim() || undefined }, {
            onSuccess: () => {
                toast({ text: `${money.fmt(amount)} moved to the pocket money`, sub: project.title, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal size="sm" title="Move to pocket money" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{move.error && <FieldError message={errorMessage(move.error)} />}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={move.isPending} onClick={submit}><Icon name="send" />Move to pocket</button>
                </>
            }>
            <div className="field">
                <label className="label required" htmlFor="to-pocket-amount">Amount</label>
                <AmountField id="to-pocket-amount" value={amount} currency="USD" currencies={false} onChange={setAmount} onBlur={errors.touch("amount")} />
                <div className="hint">
                    The site's profit is {money.exact(profit)}, counting materials not sent to the client yet. What you move lowers it; what the client owes doesn't change.
                </div>
                <FieldError message={errors.show("amount", amountError)} />
            </div>
            <div className="field mt">
                <label className="label" htmlFor="to-pocket-note">Note</label>
                <AutoGrowTextarea id="to-pocket-note" className="input" minRows={2} maxRows={6} maxLength={POCKET_NOTE_MAX} value={note}
                    placeholder="e.g. Set aside after the second payment." onChange={(e) => setNote(e.target.value)} onBlur={errors.touch("note")} />
                <FieldError message={errors.show("note", noteError)} />
            </div>
        </Modal>
    );
}

/** Asks the pocket money for money for this site; super admins decide how much. */
export function AskPocketModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const ask = useAskPocket();
    const [note, setNote] = useState("");
    function submit() {
        if (ask.isPending || note.trim().length > POCKET_NOTE_MAX) return;
        ask.mutate({ projectId: project.id, note: note.trim() || undefined }, {
            onSuccess: () => {
                toast({ text: "Pocket money requested", sub: "Super admins decide how much to pay.", icon: "checkCircle" });
                onClose();
            },
        });
    }
    return (
        <Modal size="sm" title="Ask the pocket money" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{ask.error && <FieldError message={errorMessage(ask.error)} />}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={ask.isPending} onClick={submit}><Icon name="send" />Send the request</button>
                </>
            }>
            <p className="muted" style={{ marginTop: 0 }}>The request suggests what brings the site back to a 10% margin. Whoever approves it chooses the amount.</p>
            <div className="field">
                <label className="label" htmlFor="ask-pocket-note">Why (optional)</label>
                <AutoGrowTextarea id="ask-pocket-note" className="input" minRows={2} maxRows={6} maxLength={POCKET_NOTE_MAX} value={note}
                    placeholder="e.g. The tiles came in dearer than priced." onChange={(e) => setNote(e.target.value)} />
            </div>
        </Modal>
    );
}
