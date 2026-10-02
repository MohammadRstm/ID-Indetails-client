import { tip } from "@/shared/components/Overlays/tip";
import { money } from "@/shared/format/money";
import { companyToday, daysBetween, fmtDate } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { INVOICE_STATUS, invoiceStateOf, type InvoiceLike } from "./invoiceStatus";
import { clickable } from "@/shared/utils/clickable";

/** An invoice's state; overdue ones say by how many days (the prototype's BL.StatusPill). */
export function InvoiceStatusPill({ invoice, days = true }: { invoice: InvoiceLike; days?: boolean }) {
    const key = invoiceStateOf(invoice);
    const meta = INVOICE_STATUS[key];
    const late = invoice.dueOn ? daysBetween(invoice.dueOn, companyToday()) : 0;
    const title = key === "overdue" ? `${late} days past the due date` : key === "void" ? "Voided" : key === "draft" ? "Not issued yet" : "";
    return (
        <span className={cx("badge", meta.cls)} title={title}>
            <Icon name={meta.icon} />{meta.label}{key === "overdue" && days ? ` · ${late}d` : ""}
        </span>
    );
}

const COLOURS = { paid: "var(--heat-3)", out: "var(--warn-mark)" };

type MeterProps = {
    /** The agreed value (revenue). */
    value: number;
    invoiced: number;
    paid: number;
    outstanding: number;
    notYetInvoiced: number;
    height?: number;
    legend?: boolean;
};

/** Paid, outstanding and not yet invoiced, against the agreed value (the prototype's BL.Meter). */
export function BillingMeter({ value, invoiced, paid, outstanding, notYetInvoiced, height = 16, legend = true }: MeterProps) {
    const total = Math.max(1, value || invoiced);
    const segments = [
        { label: "Paid", value: paid, color: COLOURS.paid, ghost: false },
        { label: "Outstanding", value: outstanding, color: COLOURS.out, ghost: false },
        { label: "Not yet invoiced", value: notYetInvoiced, color: "transparent", ghost: true },
    ].filter((s) => s.value > 0.5);
    return (
        <div>
            <div className="meter3" style={{ height }}>
                {segments.map((s, i) => (
                    <div key={i} className={cx("m3", s.ghost && "ghost")} style={{ width: `${(s.value / total) * 100}%`, background: s.ghost ? undefined : s.color }}
                        onMouseMove={(e) => tip.show(e, [{ big: s.label }, { k: "Amount", v: money.fmt(s.value) }, { k: "Share of value", v: `${Math.round((s.value / total) * 100)}%` }])}
                        onMouseLeave={tip.hide} />
                ))}
            </div>
            {legend && (
                <div className="legend mt-s">
                    {segments.map((s, i) => (
                        <span key={i}><i className={cx(s.ghost && "hatch")} style={{ background: s.ghost ? undefined : s.color }} />{s.label} <span className="muted">{money.short(s.value)}</span></span>
                    ))}
                </div>
            )}
        </div>
    );
}

/** One invoice on a list: number, dates, state, amount and what is still due (the prototype's BL.InvoiceLine). */
export function InvoiceLine({ invoice, onOpen }: {
    invoice: InvoiceLike & { id: number; number: string | null; total: number; issuedAt: string | null; balance?: number | null; sendOn?: string | null };
    onOpen?: () => void;
}) {
    const state = invoiceStateOf(invoice);
    const balance = invoice.balance ?? 0;
    return (
        <div className={cx("cost-row", onOpen && "click")} {...clickable(onOpen, "button")}>
            <span className="mono nowrap" style={{ fontWeight: 600, fontSize: 12 }}>{invoice.number ?? "Draft"}</span>
            <span className="grow muted trunc" style={{ fontSize: "11.5px" }}>
                {state === "draft" ? (invoice.sendOn ? `goes out ${fmtDate(invoice.sendOn)}` : "not issued") : `${invoice.issuedAt ? fmtDate(invoice.issuedAt) : ""}${invoice.dueOn ? ` · due ${fmtDate(invoice.dueOn)}` : ""}`}
            </span>
            <InvoiceStatusPill invoice={invoice} />
            <span className="mono" style={{ minWidth: 72, textAlign: "right" }}>{money.fmt(invoice.total)}</span>
            {balance > 0.5 && state !== "draft" && (
                <span className="mono muted" style={{ minWidth: 72, textAlign: "right", fontSize: "11.5px" }} title="Still owed on this invoice">{money.fmt(balance)} due</span>
            )}
        </div>
    );
}
