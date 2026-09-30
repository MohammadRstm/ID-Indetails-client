import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import Icon from "@/shared/icons/Icon";
import { useClient } from "../clients/clientsApi";
import type { Project } from "../projects/projectsApi";
import { useBillingSettings, useSaveInvoice, type Invoice } from "./billingApi";
import InvoiceDoc, { ScaledDoc } from "./InvoiceDoc";
import { billToContactOf, type DocFlash } from "./invoiceDocData";

type Line = { description: string; amount: number };

const TERMS = [
    { value: "0", label: "Due on receipt" }, { value: "15", label: "Net 15 - due in 15 days" },
    { value: "30", label: "Net 30 - due in 30 days" }, { value: "45", label: "Net 45 - due in 45 days" },
];

type InvoiceEditorProps = {
    project: Project;
    /** A draft to change; a new one when left out. */
    invoice?: Invoice | null;
    onClose: () => void;
    /** Save and send: the saved draft goes on to the send window. */
    onSend: (invoice: Invoice) => void;
};

/** A new invoice or a draft, written beside what the client will receive (the prototype's P.InvoiceEditor). */
export default function InvoiceEditor({ project, invoice: existing = null, onClose, onSend }: InvoiceEditorProps) {
    const permissions = usePermissions();
    const settings = useBillingSettings(project.domain).data;
    const client = useClient(project.client?.id).data;
    const save = useSaveInvoice(project.id, existing?.id ?? null);
    const m = project.money;
    const value = m?.revenue ?? 0;
    const remaining = Math.max(0, (m?.billing.notYetInvoiced ?? 0) - (existing ? 0 : m?.billing.drafts ?? 0));

    const [lines, setLines] = useState<Line[]>(existing ? existing.lines.map((l) => ({ description: l.description, amount: l.amount }))
        : [{ description: "", amount: remaining > 0 ? Math.round(remaining) : 0 }]);
    const [terms, setTerms] = useState<number | null>(existing ? existing.termsDays : null);
    const [notes, setNotes] = useState(existing?.notes ?? "");
    const [flash, setFlash] = useState<DocFlash>({ key: null, n: 0 });
    const termsDays = terms ?? settings?.defaultTermsDays ?? 0;
    const touched = (key: string) => setFlash((f) => ({ key, n: f.n + 1 }));

    const total = lines.reduce((t, l) => t + (Number(l.amount) || 0), 0);
    const valid = total > 0 && lines.some((l) => l.description.trim());
    const over = total > remaining + 0.5;
    const termOptions = TERMS.some((t) => +t.value === termsDays) ? TERMS : [...TERMS, { value: String(termsDays), label: `Net ${termsDays} - due in ${termsDays} days` }];
    const clientName = client?.displayName ?? project.client?.displayName ?? "the client";

    function setLine(i: number, patch: Partial<Line>) {
        setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
        touched("amount" in patch ? "total" : `line-${i}`);
    }
    function suggest(amount: number, label: string) {
        setLines([{ description: lines[0].description || label, amount: Math.round(amount) }, ...lines.slice(1)]);
        touched("total");
    }
    function submit(send: boolean) {
        if (!valid) return;
        save.mutate({
            lines: lines.filter((l) => l.description.trim() && l.amount > 0).map((l) => ({ description: l.description.trim(), amount: l.amount })),
            notes: notes.trim() || null,
            termsDays,
        }, {
            onSuccess: (saved) => {
                onClose();
                if (send) onSend(saved);
                else toast({ text: `${saved.number ?? "Draft"} saved as a draft`, sub: `${money.exact(saved.total)} · nothing has been sent yet`, icon: "file" });
            },
        });
    }

    const draft = {
        number: existing?.number ?? null, lines, total, paid: 0, balance: total, notes: notes.trim() || null, termsDays,
        issuedAt: null, dueOn: null, voided: false, billToName: clientName, billToContact: billToContactOf(client?.contacts), projectTitle: project.title,
    };

    return (
        <Modal size="xl inv-editor" flush onClose={onClose}
            title={existing ? `Edit ${existing.number ?? "draft"}` : "New invoice"}
            sub={`${project.title} · ${project.client?.displayName ?? "no client"}`}
            foot={
                <>
                    <div className="grow mono" style={{ fontSize: "12.5px", fontWeight: 650 }}>
                        {save.error ? <span className="err"><Icon name="alert" />{errorMessage(save.error)}</span> : money.exact(total)}
                    </div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn" disabled={!valid || save.isPending} onClick={() => submit(false)}>Save draft</button>
                    {permissions.has(P.INVOICE_SEND) && (
                        <button className="btn btn-primary" disabled={!valid || save.isPending} onClick={() => submit(true)}><Icon name="send" />Save and send…</button>
                    )}
                </>
            }>
            <div className="inv-edit">
                <div className="inv-edit-form">
                    <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
                        <span className="u" style={{ alignSelf: "center" }}>Suggested</span>
                        {remaining > 0 && <button className="chip" onClick={() => suggest(remaining, "Balance of the agreed fee")}>Remaining {money.short(remaining)}</button>}
                        {value > 0 && <button className="chip" onClick={() => suggest(value * 0.5, "50% milestone")}>50% {money.short(value * 0.5)}</button>}
                        {value > 0 && <button className="chip" onClick={() => suggest(value * 0.3, "Deposit - 30% of the agreed fee")}>30% {money.short(value * 0.3)}</button>}
                    </div>

                    <div className="u" style={{ marginBottom: 4 }}>Line items</div>
                    {lines.map((l, i) => (
                        <div key={i} className="line-row">
                            <input className="input" placeholder="What is being billed" aria-label={`Line ${i + 1}`} value={l.description}
                                onChange={(e) => setLine(i, { description: e.target.value })} />
                            <AmountField value={l.amount} currency="USD" currencies={false} onChange={(amount) => setLine(i, { amount })} />
                            <button className="icon-btn" aria-label="Remove line" disabled={lines.length < 2} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                                <Icon name="minus" />
                            </button>
                        </div>
                    ))}
                    <button className="btn btn-sm mt-s" onClick={() => { setLines([...lines, { description: "", amount: 0 }]); touched(`line-${lines.length}`); }}>
                        <Icon name="plus" />Add line
                    </button>

                    <div className="grid g-2 mt">
                        <div className="field">
                            <label className="label" htmlFor="inv-terms">Payment terms</label>
                            <Select id="inv-terms" value={String(termsDays)} onChange={(v) => { setTerms(+v); touched("terms"); }} options={termOptions} />
                            <div className="hint">The due date is set when the invoice is sent.</div>
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="inv-notes">Note on the invoice</label>
                            <input id="inv-notes" className="input" placeholder="e.g. PO 44-1182" value={notes} onChange={(e) => { setNotes(e.target.value); touched("notes"); }} />
                            <div className="hint">Visible to the client.</div>
                        </div>
                    </div>

                    {over && (
                        <div className="banner hold mt">
                            <Icon name="alert" />
                            <div className="grow">
                                <b>More than the value left on this project.</b> {money.exact(total)} against {money.exact(remaining)} not yet invoiced.
                                That is allowed - change orders and rebilled costs do it - but it is worth a second look.
                            </div>
                        </div>
                    )}

                    <p className="hint mt">No tax is applied: these are milestones of an agreed project value. Invoicing never changes the project's revenue, profit or margin.</p>
                </div>
                <div className="inv-edit-preview">
                    <div className="inv-edit-cap">
                        <Icon name="file" />What {clientName.split(" ")[0]} will receive
                        <span className="grow" /><span className="mono">{(existing?.number ?? "draft").toLowerCase()}.pdf</span>
                    </div>
                    <ScaledDoc><InvoiceDoc invoice={draft} settings={settings} preview flash={flash} /></ScaledDoc>
                </div>
            </div>
        </Modal>
    );
}
