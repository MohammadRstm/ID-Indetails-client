import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import { Segmented } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { companyToday, fmtDate } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { useClient } from "../clients/clientsApi";
import type { Project } from "../projects/projectsApi";
import { useBillingSettings, useBillingSetupMissing, useCreateInvoicePlan } from "./billingApi";
import BillingSetupNotice from "./BillingSetupNotice";
import { EVERY, leftToInvoice, planDays, splitEqually, termOptions, type Every } from "./invoicePlan";

type Row = { sendOn: string; amount: number; description: string };

const cents = (amount: number) => money.exact(amount, "USD", { cents: true });

const COUNTS = Array.from({ length: 23 }, (_, i) => ({ value: String(i + 2), label: `${i + 2} invoices` }));

/**
 * Auto invoice: what is left to bill, split into invoices that go out on their own days. Each stays a draft until
 * then; on its day it is numbered and emailed to the client from 9:00, and one dated today goes out at once.
 */
export default function AutoInvoiceModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const today = companyToday();
    const settings = useBillingSettings(project.domain).data;
    const notSetUp = useBillingSetupMissing(project.domain);
    const client = useClient(project.client?.id).data;
    const create = useCreateInvoicePlan(project.id);
    const left = leftToInvoice(project, project.money?.billing.drafts ?? 0);
    const emails = (client?.contacts ?? []).filter((c) => c.kind === "email");

    const layout = (total: number, count: number, first: string, every: Every): Row[] => {
        const amounts = splitEqually(total, count);
        return planDays(first, count, every).map((sendOn, i) => ({ sendOn, amount: amounts[i], description: `${project.title} - payment ${i + 1} of ${count}` }));
    };
    const [total, setTotal] = useState(left);
    const [count, setCount] = useState(3);
    const [first, setFirst] = useState(today);
    const [every, setEvery] = useState<Every>("month");
    const [custom, setCustom] = useState(false);
    const [rows, setRows] = useState<Row[]>(() => layout(left, 3, today, "month"));
    // the client's first email address until another is picked; "" is nobody
    const [picked, setPicked] = useState<string | null>(null);
    const sendTo = picked ?? emails[0]?.value ?? "";
    const [terms, setTerms] = useState<number | null>(null);
    const termsDays = terms ?? settings?.defaultTermsDays ?? 0;
    const [notes, setNotes] = useState("");
    const errors = useFormErrors();

    // a new count, first day or interval lays the invoices out again, split equally
    function relayout(next: { count?: number; first?: string; every?: Every }) {
        const n = next.count ?? count, f = next.first ?? first, e = next.every ?? every;
        setCount(n);
        setFirst(f);
        setEvery(e);
        setRows(layout(total, n, f, e));
    }
    function changeTotal(value: number) {
        setTotal(value);
        if (!custom) setRows(rows.map((r, i) => ({ ...r, amount: splitEqually(value, rows.length)[i] })));
    }
    function changeCustom(on: boolean) {
        setCustom(on);
        if (!on) setRows(rows.map((r, i) => ({ ...r, amount: splitEqually(total, rows.length)[i] })));
    }
    const setRow = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

    const sum = rows.reduce((t, r) => t + r.amount, 0);
    const totalError = !(total > 0) && "Enter the amount to split.";
    const sumError = custom && Math.abs(sum - total) > 0.004
        && `The invoices add up to ${cents(sum)}, ${cents(Math.abs(total - sum))} ${sum < total ? "short of" : "more than"} ${cents(total)}.`;
    const rowError = (r: Row) => (!r.description.trim() ? "Describe what it bills." : !(r.amount > 0) ? "Enter its amount." : r.sendOn < today ? "Pick today or a later day." : undefined);
    const firstError = rows.map(rowError).find(Boolean);
    const earliest = rows.map((r) => r.sendOn).sort()[0];
    const blocked = notSetUp || create.isPending;

    function submit() {
        if (blocked) return;
        if (totalError || sumError || firstError) return errors.tried();
        create.mutate({
            invoices: rows.map((r) => ({ sendOn: r.sendOn, amount: r.amount, description: r.description.trim() })),
            termsDays,
            notes: notes.trim() || null,
            sendTo: sendTo || null,
        }, {
            onSuccess: (made) => {
                const now = made.filter((i) => i.issuedAt).map((i) => i.number);
                toast({
                    text: `${made.length} invoices scheduled`,
                    sub: now.length ? `${now.join(", ")} emailed to ${sendTo} now · the rest go out on their days` : `The first goes out on ${fmtDate(earliest)}`,
                    icon: "calendar",
                });
                onClose();
            },
        });
    }

    return (
        <Modal size="lg" title="Auto invoice" sub={`${project.title} · ${money.exact(left)} left to invoice`} onClose={create.isPending ? undefined : onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: "11.5px" }}>
                        {create.error ? <span className="err"><Icon name="alert" />{errorMessage(create.error)}</span>
                            : sendTo ? `Each is numbered and emailed to ${sendTo} with its PDF from 9:00 on its day${rows.some((r) => r.sendOn === today) ? " - today's as soon as you schedule them" : ""}. Until then each is a draft you can still change.`
                                : "On each one's day you're reminded to send it yourself, on WhatsApp or as a PDF."}
                    </div>
                    <button className="btn" disabled={create.isPending} onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={blocked} onClick={submit}><Icon name="calendar" />{create.isPending ? "Scheduling…" : `Schedule ${rows.length} invoices`}</button>
                </>
            }>
            <div className="grid g-2">
                <div className="field">
                    <label className="label required" htmlFor="ai-total">Amount to split</label>
                    <AmountField id="ai-total" value={total} currencies={false} onChange={changeTotal} onBlur={errors.touch("total")} />
                    <FieldError message={errors.show("total", totalError)} />
                    {total > left + 0.5 && !totalError && <div className="hint">More than the {money.exact(left)} left to invoice - worth a second look.</div>}
                </div>
                <div className="field">
                    <label className="label required" htmlFor="ai-count">Split into</label>
                    <Select id="ai-count" value={String(count)} options={COUNTS} onChange={(v) => relayout({ count: +v })} />
                </div>
                <div className="field">
                    <label className="label required" htmlFor="ai-first">First one goes out</label>
                    <DateInput id="ai-first" className="input mono" value={first} min={today} onChange={(v) => { if (v) relayout({ first: v }); }} />
                </div>
                <div className="field">
                    <label className="label required" htmlFor="ai-every">Then</label>
                    <Select id="ai-every" value={every} options={EVERY} onChange={(v) => relayout({ every: v })} />
                </div>
            </div>

            <div className="spread mt" style={{ alignItems: "center" }}>
                <span className="u">The invoices</span>
                <Segmented aria-label="Amounts" value={custom ? "custom" : "equal"} onChange={(v) => changeCustom(v === "custom")}
                    options={[{ value: "equal", label: "Equal amounts" }, { value: "custom", label: "Custom amounts" }]} />
            </div>
            <div className="tbl-wrap mt-s">
                <table className="tbl">
                    <thead><tr><th>#</th><th>Goes out on</th><th className="r">Amount</th><th>On the invoice</th></tr></thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={i}>
                                <td className="muted mono">{i + 1}</td>
                                <td style={{ width: 150 }}>
                                    <DateInput className="input mono" aria-label={`Invoice ${i + 1} goes out on`} value={r.sendOn} min={today} onChange={(v) => { if (v) setRow(i, { sendOn: v }); }} />
                                </td>
                                <td className="r" style={{ width: 150 }}>
                                    {custom ? <AmountField aria-label={`Invoice ${i + 1} amount`} value={r.amount} currencies={false} onChange={(amount) => setRow(i, { amount })} />
                                        : <span className="mono">{cents(r.amount)}</span>}
                                </td>
                                <td>
                                    <input className="input" aria-label={`Invoice ${i + 1} description`} value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <FieldError message={sumError || errors.show("rows", firstError)} />

            <div className="grid g-2 mt">
                <div className="field">
                    <label className="label" htmlFor="ai-to">Email them to</label>
                    <Select id="ai-to" value={sendTo} onChange={setPicked} options={[
                        ...emails.map((c) => ({ value: c.value, label: c.label ? `${c.value} (${c.label})` : c.value })),
                        { value: "", label: "Nobody - remind me to send each one" },
                    ]} />
                    <div className="hint">{emails.length ? "The client's email addresses." : "The client has no email address: you're reminded to send each one yourself."}</div>
                </div>
                <div className="field">
                    <label className="label required" htmlFor="ai-terms">Payment terms</label>
                    <Select id="ai-terms" value={String(termsDays)} onChange={(v) => setTerms(+v)} options={termOptions(termsDays)} />
                    <div className="hint">Each one's due date counts from the day it goes out.</div>
                </div>
            </div>
            <div className="field mt">
                <label className="label" htmlFor="ai-notes">Note on each invoice</label>
                <input id="ai-notes" className="input" placeholder="Optional - e.g. PO 44-1182" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {(project.money?.billing.onAccount ?? 0) > 0.5 && (
                <div className="banner mt">
                    <Icon name="info" />
                    <div className="grow">
                        <b>{money.exact(project.money!.billing.onAccount)} was paid on account.</b> It pays the first invoices as they go out; one it pays in
                        full is issued but not emailed.
                    </div>
                </div>
            )}
            <BillingSetupNotice domain={project.domain} />
        </Modal>
    );
}
