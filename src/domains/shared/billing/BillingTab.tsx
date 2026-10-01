import { useState } from "react";
import { useNavigate } from "react-router";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { canOpen } from "@/app/routing/routeTable";
import { RankBars } from "@/shared/components/Charts/Bars";
import Columns from "@/shared/components/Charts/Columns";
import Figure from "@/shared/components/Charts/Figure";
import { KpiStrip } from "@/shared/components/Data/Kpi";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { Segmented } from "@/shared/components/Forms/Filters";
import { PAYMENT_METHODS, plural } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import { fmtMonthY, MONTHS } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useFinanceBilling } from "../finance/financeApi";
import { useInvoices, usePayments, type InvoiceSummary } from "./billingApi";
import { useBillingLinks } from "./billingLinks";
import { InvoiceTable, PaymentTable, type Tile } from "./BillingTables";
import { invoiceStateOf } from "./invoiceStatus";
import { loadFailed } from "@/api/queryState";

type Filter = "all" | "open" | "overdue" | "paid" | "draft";

const FILTERS: Record<Filter, (i: InvoiceSummary) => boolean> = {
    all: () => true,
    open: (i) => !!i.issuedAt && i.status !== "void" && (i.balance ?? 0) > 0.5,
    overdue: (i) => invoiceStateOf(i) === "overdue",
    paid: (i) => i.status === "paid",
    draft: (i) => i.status === "draft",
};

const ageLabel = (a: { fromDays: number; toDays: number | null }) =>
    a.fromDays <= 0 ? "Not yet due" : a.toDays == null ? `${a.fromDays - 1}+ days` : `${a.fromDays}–${a.toDays} days`;

/** Financials → Billing: collections, not profitability (the prototype's P.BillingTab). */
export default function BillingTab({ domain, tiles }: { domain: Domain; tiles: Map<number, Tile> }) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const links = useBillingLinks();
    const [filter, setFilter] = useState<Filter>("all");
    const billing = useFinanceBilling(domain, 12, true);
    const invoices = useInvoices({ domain, pageSize: 100 });
    const paymentQuery = usePayments({ domain, pageSize: 14 });
    const payments = paymentQuery.data?.items;
    const b = billing.data;
    const all = invoices.data?.items ?? [];
    const shown = all.filter(FILTERS[filter]);
    const issued = shown.filter((i) => i.issuedAt).reduce((t, i) => t + i.total, 0);
    const clientPath = (id: number) => (canOpen(permissions, domain, `clients/${id}`) ? () => navigate(`/${domain}/clients/${id}`) : undefined);

    if (loadFailed(billing)) return <div className="panel"><div className="panel-body"><LoadError error={billing.error} retry={() => billing.refetch()} what="the billing" /></div></div>;
    const p = b?.position;
    const collectedPct = p?.invoiced ? Math.round((p.received / p.invoiced) * 100) : 0;
    const owing = (b?.byClient ?? []).filter((c) => c.outstanding > 0).sort((x, y) => y.outstanding - x.outstanding);
    const oldest = b?.openInvoices.filter((i) => i.isOverdue).sort((x, y) => y.daysOverdue - x.daysOverdue)[0];

    return (
        <div>
            <div className="banner mt-s" style={{ marginBottom: 14 }}>
                <Icon name="info" />
                <div className="grow">
                    <b>Collections, not profitability.</b> Everything on this tab is cash: what has been invoiced, what has arrived and what is still owed.
                    Revenue, cost, profit and margin are unaffected by any of it - they live on the other tabs.
                </div>
            </div>

            <KpiStrip loading={!p} items={[
                { key: "value", label: "Project value", value: money.short(p?.value ?? 0), sub: <span>across {b?.byClient.length ?? 0} clients</span> },
                { key: "invoiced", label: "Invoiced", value: money.short(p?.invoiced ?? 0), sub: <span>{p?.issuedCount ?? 0} issued {p?.issuedCount === 1 ? "invoice" : "invoices"}</span> },
                { key: "collected", label: "Collected", value: money.short(p?.received ?? 0), sub: <span>{collectedPct}% of what was invoiced</span> },
                { key: "outstanding", label: "Outstanding", value: money.short(p?.outstanding ?? 0), sub: <span className={p?.overdue ? "down" : ""}>{money.short(p?.overdue ?? 0)} of it overdue</span> },
                { key: "uninvoiced", label: "Not yet invoiced", value: money.short(p?.notYetInvoiced ?? 0), sub: <span>{p?.drafts ? `${money.short(p.drafts)} sitting in draft` : "work still to bill"}</span> },
                { key: "overdue", label: "Overdue invoices", value: p?.overdueCount ?? 0, sub: <span>{p?.oldestOverdueDays ? `oldest ${p.oldestOverdueDays} days` : "nothing late"}</span> },
            ]} />

            <div className="grid g-8-4 mt">
                <Figure title="Invoiced against collected, month by month" sub="Are we billing the work, and is the money following?"
                    table={{ cols: [{ label: "Month" }, { label: "Invoiced", right: true }, { label: "Collected", right: true }], rows: (b?.monthly ?? []).map((m) => [fmtMonthY(m.month), money.fmt(m.invoiced), money.fmt(m.collected)]) }}>
                    {!b ? <SkeletonLines lines={7} /> : (
                        <>
                            <Columns height={210} labelEvery={Math.max(1, Math.ceil(b.monthly.length / 7))} seriesLabel="Invoiced" ghostLabel="Collected" format={(v) => money.short(v)}
                                data={b.monthly.map((m) => ({ label: MONTHS[+m.month.slice(5, 7) - 1], tip: fmtMonthY(m.month), value: m.invoiced, ghost: m.collected }))} />
                            <div className="chart-note">
                                The solid bar is what we asked for that month, the pale bar is what arrived. What arrived is the revenue the
                                Overview tab counts; an invoice is only a request.
                            </div>
                        </>
                    )}
                </Figure>
                <Figure title="How old is the money we are owed?" sub="Outstanding balances by how long they are past due."
                    table={{ cols: [{ label: "Age" }, { label: "Outstanding", right: true }, { label: "Invoices", right: true }], rows: (b?.aging ?? []).map((a) => [ageLabel(a), money.fmt(a.amount), a.count]) }}>
                    {!b ? <SkeletonLines lines={6} /> : (
                        <>
                            <Columns height={200} format={(v) => money.short(v)} seriesLabel="Outstanding"
                                data={b.aging.map((a) => ({ label: ageLabel(a).replace(" days", "d").replace("Not yet due", "Current"), tip: ageLabel(a), value: a.amount, note: plural(a.count, "invoice") }))} />
                            <div className="chart-note">
                                {(p?.overdue ?? 0) > 0.5 ? `${money.fmt(p!.overdue)} is past its due date.${oldest ? ` The oldest is ${oldest.number}, ${oldest.daysOverdue} days late.` : ""}` : "Nothing is past its due date."}
                            </div>
                        </>
                    )}
                </Figure>
            </div>

            <div className="grid g-2 mt">
                <Figure title="Who owes us money" sub="Outstanding balance by client - the chase list."
                    table={{ cols: [{ label: "Client" }, { label: "Invoiced", right: true }, { label: "Collected", right: true }, { label: "Outstanding", right: true }], rows: (b?.byClient ?? []).map((c) => [c.name, money.fmt(c.invoiced), money.fmt(c.received), money.fmt(c.outstanding)]) }}>
                    {!b ? <SkeletonLines lines={5} /> : owing.length ? (
                        <RankBars format={(v) => money.short(v)} unit="Outstanding" onClick={(it) => clientPath(Number(it.id))?.()}
                            items={owing.map((c) => ({
                                id: c.clientId, label: c.name, value: c.outstanding,
                                node: <><span className="client-mark">{c.name.slice(0, 1).toUpperCase()}</span><span className="trunc">{c.name}</span></>,
                            }))} />
                    ) : <p className="muted" style={{ padding: "10px 0" }}>Every client is square with us.</p>}
                </Figure>
                <Figure title="How clients pay" sub="Collected to date by method.">
                    {!b ? <SkeletonLines lines={4} /> : (
                        <>
                            <RankBars format={(v) => money.short(v)} unit="Collected" showPct items={b.byMethod.map((m) => ({ label: PAYMENT_METHODS[m.method] ?? m.method, value: m.amount }))} />
                            <div className="chart-note">ID InDetails never touches the money: it records what arrived, how it arrived, and against which invoice.</div>
                        </>
                    )}
                </Figure>
            </div>

            <div className="panel mt">
                <div className="panel-head">
                    <div className="grow">
                        <div className="panel-title">Invoice register</div>
                        <div className="panel-sub">Every invoice ever issued, including voided ones.</div>
                    </div>
                    <div className="panel-tools">
                        <Segmented value={filter} onChange={setFilter} aria-label="Invoices"
                            options={(Object.keys(FILTERS) as Filter[]).map((f) => ({
                                value: f,
                                label: <>{{ all: "All", open: "Open", overdue: "Overdue", paid: "Paid", draft: "Draft" }[f]} <span className="muted num">{all.filter(FILTERS[f]).length}</span></>,
                            }))} />
                    </div>
                </div>
                {loadFailed(invoices) ? <div className="panel-body"><LoadError error={invoices.error} retry={() => invoices.refetch()} what="the invoices" /></div>
                    : !invoices.data ? <div className="panel-body"><SkeletonLines lines={6} /></div>
                        : <InvoiceTable invoices={shown} showProject showClient tiles={tiles} onOpen={(inv) => links.openInvoice(inv.id)} />}
                <div className="panel-foot">
                    <span>{shown.length} invoices · {money.fmt(issued)} issued</span>
                    <div className="grow" />
                    <span className="muted">
                        {(invoices.data?.totalCount ?? 0) > all.length ? `The latest ${all.length} of ${invoices.data!.totalCount}. ` : ""}Invoices are created from a project, so every one has a client and a project behind it.
                    </span>
                </div>
            </div>

            <div className="panel mt">
                <div className="panel-head">
                    <div><div className="panel-title">Payments received</div><div className="panel-sub">Cash recorded by an admin after it arrived - bank, cheque or cash.</div></div>
                </div>
                {loadFailed(paymentQuery) ? <div className="panel-body"><LoadError error={paymentQuery.error} retry={() => paymentQuery.refetch()} what="the payments" /></div>
                    : !payments ? <div className="panel-body"><SkeletonLines lines={4} /></div>
                    : <PaymentTable payments={payments} showProject tiles={tiles} onOpen={links.openInvoice} actions />}
            </div>
        </div>
    );
}
