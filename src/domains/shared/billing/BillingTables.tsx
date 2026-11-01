import { ProjectTile } from "@/shared/components/Data/Bits";
import { PAYMENT_METHODS } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import { fmtDate, fmtDateY, fmtNumber } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import type { InvoiceSummary, Payment } from "./billingApi";
import { InvoiceStatusPill } from "./BillingBits";
import PaymentActions from "./PaymentActions";
import { invoiceStateOf } from "./invoiceStatus";
import { clickable } from "@/shared/utils/clickable";

export type Tile = { icon: string | null; tint: string | null };

type InvoiceTableProps = {
    invoices: InvoiceSummary[];
    showProject?: boolean;
    showClient?: boolean;
    tiles?: Map<number, Tile>;
    onOpen: (invoice: InvoiceSummary) => void;
};

/** Invoices with their dates, amounts, what was paid and what is left (the prototype's BL.InvoiceTable). */
export function InvoiceTable({ invoices, showProject, showClient, tiles, onOpen }: InvoiceTableProps) {
    return (
        <div className="tbl-wrap">
            <table className="tbl tbl-min-sm">
                <thead>
                    <tr>
                        <th>Invoice</th>
                        {showProject && <th>Project</th>}
                        {showClient && <th>Client</th>}
                        <th className="nowrap">Issued</th><th className="nowrap">Due</th>
                        <th className="r">Amount</th><th className="r">Paid</th><th className="r">Balance</th><th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {invoices.map((inv) => {
                        const voided = inv.status === "void";
                        const paid = inv.paid ?? 0, balance = inv.balance ?? 0;
                        return (
                            <tr key={inv.id} className={cx("click", voided && "voided")} {...clickable(() => onOpen(inv))}>
                                <td className="mono nowrap" style={{ fontWeight: 600 }}>{inv.number ?? "Draft"}</td>
                                {showProject && (
                                    <td><div className="pname"><ProjectTile icon={tiles?.get(inv.project.id)?.icon} tint={tiles?.get(inv.project.id)?.tint} size="sm" /><span className="trunc">{inv.project.title}</span></div></td>
                                )}
                                {showClient && <td className="trunc">{inv.client.displayName}</td>}
                                <td className="muted nowrap">{inv.issuedAt ? fmtDate(inv.issuedAt) : "-"}</td>
                                <td className={cx("nowrap", invoiceStateOf(inv) === "overdue" ? "down" : "muted")}>{inv.dueOn ? fmtDate(inv.dueOn) : "-"}</td>
                                <td className="r mono">{money.fmt(inv.total)}</td>
                                <td className="r mono">{paid > 0.5 ? money.fmt(paid) : <span className="muted">-</span>}</td>
                                <td className="r mono">{balance > 0.5 && !voided && inv.issuedAt ? money.fmt(balance) : <span className="muted">-</span>}</td>
                                <td><InvoiceStatusPill invoice={inv} /></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {invoices.length === 0 && <p className="muted" style={{ padding: 14 }}>No invoices here yet.</p>}
        </div>
    );
}

type PaymentTableProps = {
    payments: Payment[];
    showProject?: boolean;
    tiles?: Map<number, Tile>;
    /** Opens the invoice a payment was against. */
    onOpen?: (invoiceId: number) => void;
    /** A menu on each row to apply, label or void it, for those who may. */
    actions?: boolean;
};

/** Payments with how they arrived and what they were against (the prototype's BL.PaymentTable). */
export function PaymentTable({ payments, showProject, tiles, onOpen, actions }: PaymentTableProps) {
    return (
        <div className="tbl-wrap">
            <table className="tbl tbl-min-sm">
                <thead>
                    <tr>
                        <th className="nowrap">Received</th>
                        {showProject && <th>Project</th>}
                        <th>Invoice</th><th>Method</th><th>Reference</th><th>Account label</th><th className="r">Amount</th>
                        {actions && <th />}
                    </tr>
                </thead>
                <tbody>
                    {payments.map((p) => {
                        const open = p.invoiceId != null && onOpen ? () => onOpen(p.invoiceId!) : undefined;
                        return (
                            <tr key={p.id} className={cx(p.voidedAt && "voided", open && "click")} {...clickable(open)}>
                                <td className="nowrap">{fmtDateY(p.receivedOn)}</td>
                                {showProject && (
                                    <td><div className="pname"><ProjectTile icon={tiles?.get(p.project.id)?.icon} tint={tiles?.get(p.project.id)?.tint} size="sm" /><span className="trunc">{p.project.title}</span></div></td>
                                )}
                                <td className="mono">{p.invoiceNumber ?? <span className="badge">On account</span>}</td>
                                <td className="muted">{PAYMENT_METHODS[p.method] ?? p.method}</td>
                                <td className="muted trunc">
                                    {p.reference || "-"}
                                    {p.currency !== "USD" && (
                                        <span className="badge cur-chip" style={{ marginLeft: 6 }} title={`Received as ${money.fmt(p.amount, p.currency)} at ${fmtNumber(p.fxRate)}/$`}>{p.currency}</span>
                                    )}
                                </td>
                                <td className="muted trunc">{p.accountLabel?.name ?? "-"}</td>
                                <td className="r mono">{money.fmt(p.amountUsd)}</td>
                                {actions && <td className="r"><PaymentActions payment={p} /></td>}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {payments.length === 0 && <p className="muted" style={{ padding: 14 }}>No payments recorded yet.</p>}
        </div>
    );
}
