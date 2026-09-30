import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import DateInput from "@/shared/components/Forms/DateInput";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { PAYMENT_METHODS } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import { companyToday, fmtDateY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import type { Schemas } from "@/api/types";
import type { Project } from "../projects/projectsApi";
import { useInvoices, useRateOn, useRecordPayment } from "./billingApi";
import { invoiceStateOf } from "./invoiceStatus";
import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";

const cents = (usd: number) => Math.round(usd * 100);

type Method = Schemas["PaymentMethod"];

/**
 * Money a client sent, recorded after it arrived (the prototype's P.PaymentModal): against an open invoice
 * or on account, in dollars or in LBP at the day's rate. It changes what was collected, never the revenue.
 */
export default function RecordPaymentModal({ project, invoiceId: preset, onClose }: { project: Project; invoiceId?: number | null; onClose: () => void }) {
    const today = companyToday();
    const record = useRecordPayment(project.id);
    const invoiceQuery = useInvoices({ projectId: project.id, pageSize: 100 });
    const invoices = invoiceQuery.data?.items;
    // the API settles invoices to the cent, so a few cents left are still owed on the invoice
    const open = (invoices ?? []).filter((i) => i.issuedAt && i.status !== "void" && cents(i.balance ?? 0) > 0);
    const [picked, setPicked] = useState<string | null>(preset != null ? String(preset) : null);
    const invoiceId = picked ?? (invoices ? String(open[0]?.id ?? "") : "");
    const target = open.find((i) => String(i.id) === invoiceId) ?? null;
    const balance = target?.balance ?? 0;
    const [amount, setAmount] = useState<number | null>(null);
    const [currency, setCurrency] = useState("USD");
    const [rate, setRate] = useState<number | null>(null);
    const [date, setDate] = useState(today);
    // until one is typed, the rate of the day the money was received
    const rateOfDay = useRateOn("LBP", date)?.ratePerUsd;
    const [method, setMethod] = useState<Method>("bank");
    const [reference, setReference] = useState("");
    const fx = rate ?? rateOfDay ?? 0;
    // until it is typed, the amount is what the chosen invoice still owes
    const value = amount ?? (currency === "USD" ? cents(balance) / 100 : Math.round(balance * fx));
    // as the API counts it: in dollars, to the cent
    const usd = currency === "USD" ? value : fx > 0 ? cents(value / fx) / 100 : 0;
    const received = project.money?.billing.received ?? 0;
    const overInvoice = !!target && cents(usd) > cents(balance);
    const overProject = !target && usd + received > (project.money?.revenue ?? 0) + 0.5;
    // without the invoices it can't tell an invoice from money on account, so it waits for them
    const valid = !!invoices && usd > 0 && !overInvoice && (currency === "USD" || fx > 0);

    function pick(id: string) {
        setPicked(id);
        setAmount(null);
    }
    function submit() {
        if (!valid) return;
        record.mutate({
            amount: value, currency, fxRate: currency === "USD" ? null : fx, invoiceId: target?.id ?? null,
            method, receivedOn: date, reference: reference.trim() || null,
        }, {
            onSuccess: (pay) => {
                const left = balance - pay.amountUsd;
                toast({
                    text: `${money.exact(pay.amountUsd)} recorded${target ? ` against ${target.number}` : " on account"}`,
                    sub: target ? (cents(left) <= 0 ? `${target.number} is now fully paid` : `${money.exact(left, "USD", { cents: true })} still outstanding`) : "Held as a credit until it is applied to an invoice",
                    icon: "card",
                });
                onClose();
            },
        });
    }

    return (
        <Modal size="md" onClose={onClose} title="Record a client payment" sub={`${project.title} · ${project.client?.displayName ?? ""}`}
            foot={
                <>
                    <div className="grow mono" style={{ fontSize: "12.5px" }}>
                        {record.error ? <span className="err"><Icon name="alert" />{errorMessage(record.error)}</span>
                            : currency === "USD" ? money.exact(usd) : `${money.exact(value, "LBP")} = ${money.exact(usd)}`}
                    </div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={!valid || record.isPending} onClick={submit}><Icon name="check" />Record payment</button>
                </>
            }>
            <div className="field">
                <label className="label" htmlFor="pay-inv">Against which invoice?</label>
                <Select id="pay-inv" value={invoiceId} onChange={pick} options={[
                    ...open.map((i) => ({ value: String(i.id), label: `${i.number} - ${money.exact(i.balance ?? 0, "USD", { cents: true })} outstanding${invoiceStateOf(i) === "overdue" ? " · overdue" : ""}` })),
                    { value: "", label: "On account - no invoice yet" },
                ]} />
                {loadFailed(invoiceQuery) && <div className="mt-s"><LoadError error={invoiceQuery.error} retry={() => invoiceQuery.refetch()} what="the project's invoices" /></div>}
                <div className="hint">
                    {target ? `Balance on ${target.number}: ${money.exact(balance, "USD", { cents: true })}${target.dueOn ? `, due ${fmtDateY(target.dueOn)}` : ""}`
                        : "Money received before invoicing is held as a credit on the project until an invoice is raised."}
                </div>
            </div>

            <div className="grid g-2 mt">
                <div className="field">
                    <label className="label" htmlFor="pay-amt">Amount received</label>
                    <AmountField id="pay-amt" value={value} currency={currency} onChange={setAmount} onCurrency={(c) => { setCurrency(c); setAmount(null); }} />
                    {currency === "LBP" && <div className="hint">= {money.exact(usd)} at the rate below</div>}
                </div>
                <div className="field">
                    <label className="label" htmlFor="pay-date">Date received</label>
                    <DateInput id="pay-date" className="input mono" value={date} max={today} onChange={(v) => { if (v) setDate(v); }} />
                </div>
            </div>

            {currency === "LBP" && (
                <div className="field mt">
                    <label className="label" htmlFor="pay-fx">Exchange rate on the day</label>
                    <div className="row" style={{ gap: 8 }}>
                        <input id="pay-fx" className="input mono" style={{ maxWidth: 160 }} inputMode="numeric" value={fx ? String(fx) : ""}
                            onChange={(e) => setRate(Math.max(1, Number(e.target.value.replace(/[^0-9.]/g, "")) || 1))} />
                        <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>LBP per US dollar</span>
                    </div>
                    <div className="hint">Both amounts are kept: the LBP the client actually sent, and the dollar value at the moment it arrived. Collections totals are always in dollars.</div>
                </div>
            )}

            <div className="grid g-2 mt">
                <div className="field">
                    <label className="label" htmlFor="pay-method">How it arrived</label>
                    <Select id="pay-method" value={method} onChange={(v) => setMethod(v as Method)}
                        options={Object.entries(PAYMENT_METHODS).map(([k, label]) => ({ value: k, label }))} />
                </div>
                <div className="field">
                    <label className="label" htmlFor="pay-ref">Reference</label>
                    <input id="pay-ref" className="input" value={reference} onChange={(e) => setReference(e.target.value)}
                        placeholder={method === "cheque" ? "Cheque number" : method === "bank" ? "Transfer reference" : "Receipt number"} />
                </div>
            </div>

            {overInvoice && target && (
                <div className="banner attn mt">
                    <Icon name="alert" />
                    <div className="grow"><b>More than this invoice is owed.</b> {target.number} has {money.exact(balance, "USD", { cents: true })} outstanding. Record the balance here and the rest on account, or against another invoice.</div>
                </div>
            )}
            {overProject && (
                <div className="banner hold mt">
                    <Icon name="info" />
                    <div className="grow"><b>This takes the project above its value.</b> The extra sits as a credit on account - allowed, but worth checking.</div>
                </div>
            )}

            <p className="hint mt">
                Recording a payment changes what has been <b>collected</b>. It does not change the project's revenue, profit or margin - those were settled by the work, not by the cash.
            </p>
        </Modal>
    );
}
