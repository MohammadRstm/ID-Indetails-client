import { useState } from "react";
import { downloadFile } from "@/api/download";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { CostRow } from "@/shared/components/Data/Money";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { PAYMENT_METHODS } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import { companyToday, daysBetween, fmtDate, fmtDateY, fmtNumber } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import PaymentActions from "./PaymentActions";
import { useBillingSettings, useDiscardInvoice, useInvoice, usePayments, useVoidInvoice, type Invoice } from "./billingApi";
import { InvoiceStatusPill } from "./BillingBits";
import InvoiceDoc from "./InvoiceDoc";
import { docOf } from "./invoiceDocData";
import { invoiceStateOf } from "./invoiceStatus";
import { loadFailed } from "@/api/queryState";

type InvoiceModalProps = {
    invoiceId: number;
    onClose: () => void;
    onSend: (invoice: Invoice) => void;
    onEdit: (invoice: Invoice) => void;
    onPayment: (invoice: Invoice) => void;
};

const DELIVERED: Record<string, string> = { whatsapp: "Sent on WhatsApp", email: "Emailed", download: "Downloaded" };

/** One invoice: the document, its history and payments, and how to correct it (the prototype's P.InvoiceModal). */
export default function InvoiceModal({ invoiceId, onClose, onSend, onEdit, onPayment }: InvoiceModalProps) {
    const permissions = usePermissions();
    const query = useInvoice(invoiceId);
    const inv = query.data;
    const settings = useBillingSettings(inv?.domain ?? "", !!inv).data;
    const paymentQuery = usePayments({ invoiceId, pageSize: 100 }, !!inv);
    const payments = paymentQuery.data?.items ?? [];
    const voidIt = useVoidInvoice();
    const discard = useDiscardInvoice();
    const [confirmVoid, setConfirmVoid] = useState(false);
    const [reason, setReason] = useState("");
    const [voidTried, setVoidTried] = useState(false);

    if (!inv) {
        return (
            <Modal size="xl" onClose={onClose} title="Invoice">
                {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the invoice" /> : <SkeletonLines lines={8} />}
            </Modal>
        );
    }

    const state = invoiceStateOf(inv);
    const balance = inv.balance ?? 0;
    const late = inv.dueOn ? daysBetween(inv.dueOn, companyToday()) : 0;
    const live = payments.filter((p) => !p.voidedAt);
    const fileName = `${(inv.number ?? "draft").toLowerCase()}.pdf`;
    const error = voidIt.error ?? discard.error;

    async function pdf() {
        try {
            await downloadFile(`/invoices/${inv!.id}/pdf`, fileName);
        } catch (e) {
            toast({ text: "The PDF wasn't downloaded", sub: errorMessage(e), icon: "alert" });
        }
    }

    return (
        <Modal size="xl" flush onClose={onClose} title={inv.number ?? "Draft invoice"} sub={`${inv.project.title} · ${inv.client.displayName}`}
            foot={
                <>
                    <div className="grow row" style={{ gap: 10 }}>
                        <InvoiceStatusPill invoice={inv} />
                        <span className="mono" style={{ fontSize: "12.5px" }}>{money.fmt(inv.total)}{balance > 0.5 && state !== "draft" ? ` · ${money.fmt(balance)} due` : ""}</span>
                        {error && <span className="err"><Icon name="alert" />{errorMessage(error)}</span>}
                    </div>
                    <button className="btn" onClick={pdf}><Icon name="download" />PDF</button>
                    <button className="btn" onClick={onClose}>Close</button>
                    {state === "draft" ? permissions.has(P.INVOICE_SEND) && <button className="btn btn-primary" onClick={() => onSend(inv)}><Icon name="send" />Send invoice…</button>
                        : state === "paid" || state === "void" ? null
                            : permissions.has(P.PAYMENT_RECORD) && <button className="btn btn-primary" onClick={() => onPayment(inv)}><Icon name="card" />Record payment</button>}
                </>
            }>
            <div className="rep-split" style={{ display: "flex", minHeight: 460, maxHeight: "68vh" }}>
                <div className="rep-shell"><InvoiceDoc invoice={docOf(inv)} settings={settings} /></div>
                <div className="rep-opts">
                    <div className="u">Status</div>
                    <div className="mt-s"><InvoiceStatusPill invoice={inv} /></div>
                    {state === "overdue" && <p className="hint" style={{ color: "var(--now)" }}>{late} days past the due date of {fmtDateY(inv.dueOn!)}.</p>}
                    {state === "draft" && <p className="hint">Not issued. A draft can still be edited - once it is sent the figures are fixed and a correction means voiding it and reissuing.</p>}

                    <div className="u mt">History</div>
                    <div className="mt-s">
                        <CostRow label="Created" meta={inv.createdBy?.name.split(" ")[0] ?? ""} value={fmtDate(inv.createdAt)} />
                        {inv.deliveries.map((d) => <CostRow key={d.id} label={DELIVERED[d.channel] ?? d.channel} meta={d.recipient ?? ""} value={fmtDate(d.sentAt)} />)}
                        {inv.dueOn && (
                            <CostRow label="Due" value={fmtDate(inv.dueOn)}
                                meta={state === "paid" ? "settled" : state === "overdue" ? `${late}d late` : `in ${-late}d`} />
                        )}
                        {inv.voidedAt && <CostRow label="Voided" value={fmtDate(inv.voidedAt)} meta={inv.voidReason ?? ""} />}
                    </div>

                    <div className="u mt">Payments</div>
                    <div className="mt-s">
                        {live.length ? live.map((p) => (
                            <div key={p.id} className="row" style={{ gap: 4 }}>
                                <div className="grow"><CostRow label={PAYMENT_METHODS[p.method] ?? p.method} meta={`${fmtDate(p.receivedOn)}${p.reference ? ` · ${p.reference}` : ""}`} value={money.fmt(p.amountUsd)} /></div>
                                <PaymentActions payment={p} />
                            </div>
                        )) : loadFailed(paymentQuery) ? <LoadError error={paymentQuery.error} retry={() => paymentQuery.refetch()} what="the payments" />
                            : paymentQuery.data ? <p className="muted" style={{ fontSize: "11.5px" }}>Nothing received against this invoice yet.</p> : <SkeletonLines lines={1} />}
                        {live.length > 0 && <CostRow strong label="Balance" value={money.fmt(balance)} />}
                        {live.filter((p) => p.currency !== "USD").map((p) => (
                            <p key={p.id} className="hint">Received as {money.fmt(p.amount, p.currency)} at {fmtNumber(p.fxRate)}/$ on {fmtDate(p.receivedOn)}.</p>
                        ))}
                    </div>

                    {state !== "void" && (
                        <div className="mt">
                            <div className="u">Correcting this invoice</div>
                            {state === "draft" ? permissions.has(P.INVOICE_CREATE) && (
                                <div className="row mt-s" style={{ gap: 6 }}>
                                    <button className="btn btn-sm" onClick={() => onEdit(inv)}><Icon name="edit" />Edit draft</button>
                                    <button className="btn btn-sm" disabled={discard.isPending} onClick={() => discard.mutate(inv.id, {
                                        onSuccess: () => { toast({ text: "Draft discarded", icon: "trash" }); onClose(); },
                                    })}><Icon name="trash" />Discard</button>
                                </div>
                            ) : !permissions.has(P.INVOICE_VOID) ? null : confirmVoid ? (
                                <div className="mt-s">
                                    <input className="input" autoFocus placeholder="Why is it being voided?" aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                                    <FieldError message={voidTried && !reason.trim() ? "Say why it is being voided: the reason stays in the register." : undefined} />
                                    <div className="row mt-s" style={{ gap: 6 }}>
                                        <button className="btn btn-sm" onClick={() => setConfirmVoid(false)}>Cancel</button>
                                        <button className="btn btn-sm btn-danger" disabled={voidIt.isPending} onClick={() => !reason.trim() ? setVoidTried(true) : voidIt.mutate({ id: inv.id, reason: reason.trim() }, {
                                            onSuccess: () => { toast({ text: `${inv.number} voided`, sub: "The number stays in the register with its reason.", icon: "x" }); onClose(); },
                                        })}>Void {inv.number}</button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <p className="hint">A sent invoice cannot be edited. Void it - the number and the reason stay in the register - then issue a replacement.</p>
                                    <button className="btn btn-sm mt-s" disabled={live.length > 0} onClick={() => setConfirmVoid(true)}><Icon name="x" />Void invoice</button>
                                    {live.length > 0 && <p className="hint">Void the {live.length} payment{live.length === 1 ? "" : "s"} first.</p>}
                                </div>
                            )}
                        </div>
                    )}

                    <p className="hint mt">This document shows the client what they owe. It never carries hours, rates, costs, profit or margin - that is the internal project report.</p>
                </div>
            </div>
        </Modal>
    );
}
