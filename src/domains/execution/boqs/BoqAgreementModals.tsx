import { useState } from "react";
import { toApiError } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../../shared/projects/projectsApi";
import BoqFailure from "./BoqFailure";
import { BOQ_REASON_MAX, useAgreeBoq, useWithdrawBoqAgreement, type Boq } from "./boqsApi";

const cents = (n: number) => money.exact(n, "USD", { cents: true });
const nameOf = (boq: Boq) => boq.number ?? boq.title;

/**
 * "Agree BQ-2026-001?": the confirmation names the BOQ and its total. Agreeing locks it and makes its total part
 * of the site's work price; the figures are the API's, from the BOQ as last saved. The profit floor can refuse it.
 */
export function AgreeBoqModal({ project, boq, onClose }: { project: Project; boq: Boq; onClose: () => void }) {
    const agree = useAgreeBoq(project.id);
    const vo = boq.kind === "vo";

    function submit() {
        agree.mutate(boq.id, {
            onSuccess: () => {
                toast({ text: `${nameOf(boq)} agreed`, sub: `${cents(boq.totalUsd)} · ${project.title}`, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal size="sm" title={`Agree ${nameOf(boq)}`} sub={project.title} onClose={agree.isPending ? undefined : onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>{agree.error && <BoqFailure error={agree.error} onForced={onClose} />}</div>
                    <button className="btn" disabled={agree.isPending} onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={agree.isPending} onClick={submit}><Icon name="checkCircle" />{agree.isPending ? "Agreeing…" : "Agree"}</button>
                </>
            }>
            <p style={{ margin: 0 }}>
                Agree <b>{nameOf(boq)}</b>{boq.number ? ` (${boq.title})` : ""} for <b className="mono">{cents(boq.totalUsd)}</b>?
            </p>
            <p className="hint mt-s">
                {vo ? "Its total is added to the site's work price" : "Its total becomes the site's work price"}, and it can no longer be changed or deleted.
                With supervision and TVA the client pays <span className="mono">{cents(boq.clientTotalUsd)}</span> for it.
                You can withdraw the agreement later, with a reason.
            </p>
        </Modal>
    );
}

/** Withdraws an agreement, with why: the BOQ is a draft again and its total leaves the work price. The profit floor can refuse it. */
export function WithdrawBoqModal({ project, boq, onClose }: { project: Project; boq: Boq; onClose: () => void }) {
    const withdraw = useWithdrawBoqAgreement(project.id);
    const [reason, setReason] = useState("");
    const errors = useFormErrors();
    const reasonError = !reason.trim() ? "Say why the agreement is withdrawn." : reason.trim().length > BOQ_REASON_MAX && `At most ${BOQ_REASON_MAX} characters.`;
    const said = errors.show("reason", reasonError || toApiError(withdraw.error).fieldErrors.reason);

    function submit() {
        if (withdraw.isPending) return;
        errors.tried();
        if (reasonError) return;
        withdraw.mutate({ id: boq.id, reason: reason.trim() }, {
            onSuccess: () => {
                toast({ text: `${nameOf(boq)} is a draft again`, sub: "Its agreement was withdrawn", icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal size="sm" title={`Withdraw the agreement of ${nameOf(boq)}`} sub={project.title} onClose={withdraw.isPending ? undefined : onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>{withdraw.error && !said && <BoqFailure error={withdraw.error} onForced={onClose} />}</div>
                    <button className="btn" disabled={withdraw.isPending} onClick={onClose}>Cancel</button>
                    <button className="btn btn-danger" disabled={withdraw.isPending} onClick={submit}>{withdraw.isPending ? "Withdrawing…" : "Withdraw agreement"}</button>
                </>
            }>
            <p style={{ margin: 0 }}>
                <b>{nameOf(boq)}</b>{boq.number ? ` (${boq.title})` : ""} of <b className="mono">{cents(boq.totalUsd)}</b> goes back to a draft, and its total
                comes off the site's work price.
            </p>
            <div className="field mt">
                <label className="label required" htmlFor="boq-why">Why is it withdrawn?</label>
                <AutoGrowTextarea id="boq-why" className="input" minRows={3} maxRows={8} value={reason}
                    placeholder="e.g. The client asked for a different scope." onChange={(e) => setReason(e.target.value)} onBlur={errors.touch("reason")} />
                <div className="hint">Kept in the site's activity.</div>
                <FieldError message={said} />
            </div>
        </Modal>
    );
}
