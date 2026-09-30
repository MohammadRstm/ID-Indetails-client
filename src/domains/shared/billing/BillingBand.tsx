import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { CostRow, Money } from "@/shared/components/Data/Money";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { plural } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import { fmtDate } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../projects/projectsApi";
import { useInvoices } from "./billingApi";
import { BillingMeter, InvoiceLine, InvoiceStatusPill } from "./BillingBits";
import { useBillingLinks } from "./billingLinks";

const COLOURS = { paid: "var(--heat-3)", out: "var(--warn-mark)" };

/**
 * A project's client payments (the prototype's BL.BillingBand): what was received of its value, what is
 * owed, its invoices, and New invoice and Record payment. Cash only: it never changes profit or margin.
 */
export default function BillingBand({ project }: { project: Project }) {
    const permissions = usePermissions();
    const links = useBillingLinks();
    const invoices = useInvoices({ projectId: project.id, pageSize: 100 }).data?.items;
    const m = project.money;
    if (!m) return null;
    const b = m.billing;
    const closed = project.status === "completed" || project.status === "archived";

    if (!project.client) {
        return (
            <div className="panel mt">
                <div className="panel-body row" style={{ gap: 12 }}>
                    <span className="feed-ic"><Icon name="briefcase" /></span>
                    <div className="grow">
                        <b style={{ fontSize: "12.5px" }}>No client attached</b>
                        <div className="muted" style={{ fontSize: "11.5px" }}>A project can only be invoiced once it belongs to a client.</div>
                    </div>
                </div>
            </div>
        );
    }

    const live = (invoices ?? []).filter((i) => i.status !== "void");
    const voided = (invoices ?? []).filter((i) => i.status === "void");
    const oldest = live.filter((i) => i.issuedAt && (i.balance ?? 0) > 0.5 && i.dueOn).sort((a, c) => a.dueOn!.localeCompare(c.dueOn!))[0];
    const site = project.domain === "execution";
    const canInvoice = b.notYetInvoiced - b.drafts > 0.5;
    // an Execution site takes payments on account, without an invoice
    const canPay = site || b.invoiced > 0 || b.drafts > 0;

    return (
        <div className="panel mt bill-panel">
            <div className="money-band">
                <div>
                    <div className="money-head">
                        <span className="u">Client payments</span>
                        <span className="muted" style={{ fontSize: "11.5px" }}>cash received - does not change profit or margin</span>
                    </div>
                    <div className="row wrap" style={{ gap: 12, alignItems: "baseline", margin: "2px 0 10px" }}>
                        <Money value={b.received} size="xl" />
                        <span className="muted" style={{ fontSize: 12 }}>of {money.fmt(m.revenue)} project value</span>
                        {b.overdue > 0.5 ? <span className="badge inv-overdue"><Icon name="alert" />{money.fmt(b.overdue)} overdue</span>
                            : b.outstanding > 0.5 ? <span className="badge">{money.fmt(b.outstanding)} outstanding</span>
                                : b.invoiced > 0.5 ? <span className="badge inv-paid"><Icon name="checkCircle" />Fully paid</span>
                                    : <span className="badge">Not invoiced yet</span>}
                    </div>
                    <BillingMeter height={18} value={m.revenue} invoiced={b.invoiced} paid={b.received} outstanding={b.outstanding} notYetInvoiced={b.notYetInvoiced} />
                    <div className="mt">
                        <CostRow label="Invoiced" value={money.fmt(b.invoiced)} meta={plural(b.issuedCount, "invoice")} />
                        <CostRow label="Paid" swatch={COLOURS.paid} value={money.fmt(b.received)} meta={plural(b.paymentCount, "payment")} />
                        <CostRow label="Outstanding" swatch={COLOURS.out} value={money.fmt(b.outstanding)} tone={b.overdue > 0.5 ? "down" : ""}
                            meta={oldest ? `oldest due ${fmtDate(oldest.dueOn!)}` : ""} />
                        <CostRow label="Not yet invoiced" value={money.fmt(b.notYetInvoiced)} meta={b.drafts > 0.5 ? `${money.fmt(b.drafts)} in draft` : ""} />
                    </div>
                    {closed && b.outstanding > 0.5 && (
                        <div className="banner hold mt">
                            <Icon name="info" />
                            <div className="grow">The project is closed, but {money.fmt(b.outstanding)} is still owed. Completion and payment are tracked separately - invoices and payments stay open here.</div>
                        </div>
                    )}
                </div>

                <div>
                    <div className="spread" style={{ marginBottom: 6 }}>
                        <span className="u">Invoices</span>
                        <span className="muted" style={{ fontSize: "11.5px" }}>{project.client.displayName}</span>
                    </div>
                    {!invoices ? <SkeletonLines lines={3} /> : live.length ? live.map((inv) => (
                        <InvoiceLine key={inv.id} invoice={inv} onOpen={() => links.openInvoice(inv.id)} />
                    )) : (
                        <p className="muted" style={{ padding: "6px 0 10px" }}>
                            No invoice yet. Invoices are documents that request payment - the client pays outside Hourline and an admin records it here.
                        </p>
                    )}
                    {voided.length > 0 && (
                        <div className="mt-s">
                            {voided.map((inv) => (
                                <div key={inv.id} className="cost-row voided click" onClick={() => links.openInvoice(inv.id)}>
                                    <span className="mono nowrap" style={{ fontSize: 12 }}>{inv.number}</span>
                                    <span className="grow muted trunc" style={{ fontSize: "11.5px" }}>Voided</span>
                                    <InvoiceStatusPill invoice={inv} />
                                    <span className="mono" style={{ minWidth: 72, textAlign: "right" }}>{money.fmt(inv.total)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="row wrap mt" style={{ gap: 8 }}>
                        {permissions.has(P.INVOICE_CREATE) && (
                            <button className="btn btn-sm btn-primary" disabled={!canInvoice} onClick={links.newInvoice}><Icon name="file" />New invoice</button>
                        )}
                        {permissions.has(P.PAYMENT_RECORD) && (
                            <button className="btn btn-sm" disabled={!canPay} onClick={() => links.recordPayment()}><Icon name="card" />Record payment</button>
                        )}
                    </div>
                    {site && <p className="hint mt-s">Payments can be recorded on account, without an invoice - the initial payment usually is.</p>}
                    <div className="alloc-total mt">
                        <Icon name="info" />
                        <div className="grow">
                            <b>Paid outside Hourline</b>
                            <div className="muted" style={{ fontSize: "11.5px" }}>
                                Invoices go out by email or WhatsApp; the money arrives by transfer, cheque or cash and an admin records it here. Nothing is charged or collected by this platform.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
