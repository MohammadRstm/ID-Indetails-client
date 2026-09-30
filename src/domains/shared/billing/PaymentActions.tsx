import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { toast } from "@/shared/components/Feedback/toast";
import Select from "@/shared/components/Forms/Select";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { fmtDate } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useApplyPayment, useInvoices, useVoidPayment, type Payment } from "./billingApi";

/**
 * Correcting a payment, which the prototype couldn't do: putting money received on account against one of the
 * project's issued invoices (payment:record), or voiding one recorded in error (payment:void). A voided
 * payment stays in the register with its reason.
 */
export default function PaymentActions({ payment }: { payment: Payment }) {
    const permissions = usePermissions();
    const [dialog, setDialog] = useState<"apply" | "void" | null>(null);
    const canApply = !payment.voidedAt && payment.invoiceId == null && permissions.has(P.PAYMENT_RECORD);
    const canVoid = !payment.voidedAt && permissions.has(P.PAYMENT_VOID);
    if (!canApply && !canVoid) return null;
    return (
        <span onClick={(e) => e.stopPropagation()}>
            <MenuButton icon="dots" label={`Payment of ${fmtDate(payment.receivedOn)} actions`} width={210}>
                {(close) => (
                    <div>
                        {canApply && <button className="pop-item" onClick={() => { close(); setDialog("apply"); }}><Icon name="file" />Apply to an invoice…</button>}
                        {canVoid && <button className="pop-item" onClick={() => { close(); setDialog("void"); }}><Icon name="x" />Void payment…</button>}
                    </div>
                )}
            </MenuButton>
            {dialog === "apply" && <ApplyModal payment={payment} onClose={() => setDialog(null)} />}
            {dialog === "void" && <VoidModal payment={payment} onClose={() => setDialog(null)} />}
        </span>
    );
}

function ApplyModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
    const apply = useApplyPayment();
    const invoices = useInvoices({ projectId: payment.project.id, pageSize: 100 });
    const open = (invoices.data?.items ?? []).filter((i) => i.issuedAt && i.status !== "void" && (i.balance ?? 0) > 0.5);
    const [invoiceId, setInvoiceId] = useState("");
    const chosen = open.find((i) => String(i.id) === invoiceId);

    function go() {
        if (!chosen) return;
        apply.mutate({ id: payment.id, invoiceId: chosen.id }, {
            onSuccess: () => { toast({ text: `${money.fmt(payment.amountUsd)} applied to ${chosen.number}`, sub: payment.project.title, icon: "checkCircle" }); onClose(); },
        });
    }

    return (
        <Modal title="Apply to an invoice" sub={`${money.fmt(payment.amountUsd)} received ${fmtDate(payment.receivedOn)} · ${payment.project.title}`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{apply.error ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(apply.error)}</span> : null}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={!chosen || apply.isPending} onClick={go}>Apply</button>
                </>
            }>
            {invoices.data && open.length === 0 ? <p className="muted">This project has no issued invoice with anything left to pay.</p> : (
                <div className="field">
                    <label className="label" htmlFor="apply-invoice">Invoice</label>
                    <Select id="apply-invoice" value={invoiceId} onChange={setInvoiceId}
                        options={[{ value: "", label: invoices.data ? "Choose an invoice" : "Loading…", disabled: true },
                            ...open.map((i) => ({ value: String(i.id), label: `${i.number} · ${money.fmt(i.balance ?? 0)} left` }))]} />
                </div>
            )}
            <p className="hint mt">The money moves from the project's account onto that invoice; it was already counted as received, so nothing else changes.</p>
        </Modal>
    );
}

function VoidModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
    const voidIt = useVoidPayment();
    const [reason, setReason] = useState("");

    function go() {
        voidIt.mutate({ id: payment.id, reason: reason.trim() }, {
            onSuccess: () => { toast({ text: "Payment voided", sub: `${money.fmt(payment.amountUsd)} · ${payment.project.title}. It stays in the register with its reason.`, icon: "x" }); onClose(); },
        });
    }

    return (
        <Modal title="Void payment" sub={`${money.fmt(payment.amountUsd)} received ${fmtDate(payment.receivedOn)} · ${payment.project.title}`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{voidIt.error ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(voidIt.error)}</span> : null}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-danger" disabled={!reason.trim() || voidIt.isPending} onClick={go}>Void payment</button>
                </>
            }>
            <div className="field">
                <label className="label" htmlFor="void-reason">Reason</label>
                <input id="void-reason" className="input" autoFocus placeholder="e.g. Recorded twice" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <p className="hint mt">{payment.invoiceNumber ? `${payment.invoiceNumber} goes back to owing this amount. ` : ""}Collections drop by it; profit is unchanged.</p>
        </Modal>
    );
}
