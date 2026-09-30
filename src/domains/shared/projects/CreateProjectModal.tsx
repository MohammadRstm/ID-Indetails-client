import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { fullName, useCurrentUser } from "@/app/session/useSession";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { PAYMENT_METHODS } from "@/shared/format/labels";
import { companyToday } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import ClientModal from "../clients/ClientModal";
import ClientPicker from "../clients/ClientPicker";
import { useClient } from "../clients/clientsApi";
import { personName, useDomainPeople } from "../people/peopleApi";
import { useCreateProject } from "./projectsApi";

type CreateProjectModalProps = {
    domain: string;
    initialClient?: string | null;
    onClose: () => void;
};

/** A new project: a name, and optionally everything else (the prototype's P.CreateProject). */
export default function CreateProjectModal({ domain, initialClient, onClose }: CreateProjectModalProps) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const me = useCurrentUser();
    const create = useCreateProject();
    const execution = domain === "execution";
    const people = useDomainPeople(domain, permissions.has(P.EMPLOYEE_VIEW), { status: "active" });

    const [title, setTitle] = useState("");
    const [more, setMore] = useState(false);
    const [description, setDescription] = useState("");
    const [owner, setOwner] = useState(String(me.id));
    const [target, setTarget] = useState("");
    const [billing, setBilling] = useState<"client" | "internal">("client");
    const [revenue, setRevenue] = useState(0);
    const [clientId, setClientId] = useState<number | null>(initialClient ? +initialClient : null);
    const [newClient, setNewClient] = useState<string | null>(null);
    const [workers, setWorkers] = useState("");
    const [dailyPay, setDailyPay] = useState(0);
    const [initialPay, setInitialPay] = useState(0);
    const [payDate, setPayDate] = useState(companyToday());
    const [payMethod, setPayMethod] = useState("bank");
    const [fee, setFee] = useState(0);
    const [markupPct, setMarkupPct] = useState<number | "">(10);
    const client = useClient(clientId);
    const execMoney = execution && billing === "client";
    // the API refuses the whole project if the payment comes from someone who can't record payments
    const takesPayment = execMoney && permissions.has(P.PAYMENT_RECORD);
    const ok = title.trim() !== "" && (billing === "internal" || clientId != null) && !create.isPending;

    // Who can own it: the person creating it, and the people of this domain.
    const owners = [
        { value: String(me.id), label: `${fullName(me)} (you)` },
        ...(people.data ?? []).filter((p) => p.id !== me.id).map((p) => ({ value: String(p.id), label: personName(p) })),
    ];

    async function submit(e?: FormEvent) {
        e?.preventDefault();
        if (!ok) return;
        try {
            const project = await create.mutateAsync({
                title: title.trim(),
                description: description.trim() || null,
                domainCode: domain,
                billingType: execution ? "client" : billing,
                clientId: billing === "client" ? clientId : null,
                ownerId: +owner,
                targetDate: target || null,
                revenue: !execution && billing === "client" && revenue ? revenue : null,
                projectFee: execMoney ? fee || 0 : null,
                materialMarkup: execMoney ? (+markupPct || 0) / 100 : null,
                initialPayment: takesPayment && initialPay > 0
                    ? { amount: initialPay, currency: "USD", method: payMethod as "bank", receivedOn: payDate, note: "Initial payment", reference: null }
                    : null,
                labourDefaults: execution && (workers !== "" || dailyPay) ? { workers: +workers || 0, dailyPay: dailyPay || 0 } : null,
            });
            toast({
                text: `"${project.title}" created · active from today`,
                sub: takesPayment && initialPay > 0 ? `${money.exact(initialPay)} received · it is on everyone's active project list`
                    : "It is on everyone's active project list",
                icon: "checkCircle",
                actionLabel: "Open project",
                action: () => navigate(`/${domain}/projects/${project.id}`),
            });
            onClose();
            // Straight to Requirements: a new project's progress means nothing until it has some.
            navigate(`/${domain}/projects/${project.id}?tab=requirements`);
        } catch {
            // Shown in the foot.
        }
    }

    return (
        <Modal
            title="New project"
            sub="A project needs a name. Everything else is optional."
            onClose={onClose}
            foot={
                <>
                    <div className="grow">
                        {create.error ? <FieldError message={errorMessage(create.error)} />
                            : billing === "client" && client.data ? `For ${client.data.displayName} · starts today · becomes active`
                                : "Starts today · becomes active"}
                    </div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={!ok} onClick={() => submit()}>{create.isPending ? "Creating…" : "Create project"}</button>
                </>
            }
        >
            <form onSubmit={submit}>
                <div className="field">
                    <label className="label" htmlFor="np-title">Project name</label>
                    <input id="np-title" className="input" style={{ height: 44, fontSize: 16, fontWeight: 600 }} autoFocus placeholder="e.g. Website Redesign"
                        value={title} onChange={(e) => setTitle(e.target.value)} />
                    <div className="hint">Press Enter to create. You can add details later.</div>
                </div>

                {execution ? (
                    <div className="hint mt">Every Execution project is for a client. What the client owes builds up from the materials (at client prices) and the project fee.</div>
                ) : (
                    <div className="grid g-2 mt">
                        <div className="field">
                            <label className="label">Project type</label>
                            <div className="seg">
                                <button type="button" className={cx("seg-btn", billing === "client" && "on")} onClick={() => setBilling("client")}>Client project</button>
                                <button type="button" className={cx("seg-btn", billing === "internal" && "on")} onClick={() => setBilling("internal")}>Internal</button>
                            </div>
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="np-pay">Customer payment</label>
                            {billing === "client"
                                ? <AmountField id="np-pay" value={revenue} currencies={false} onChange={setRevenue} />
                                : <div className="hint" style={{ paddingTop: 9 }}>Internal project - labour and expenses are tracked as company cost.</div>}
                        </div>
                    </div>
                )}
                {!execution && billing === "client" && (
                    <div className="hint" style={{ marginTop: 5 }}>The payment is optional now - you can add or change it until the project is completed.</div>
                )}

                {billing === "client" ? (
                    <div className="field mt">
                        <label className="label">Client</label>
                        <ClientPicker domain={domain} value={clientId} onChange={setClientId}
                            onCreate={permissions.has(P.CLIENT_CREATE) ? (typed) => setNewClient(typed) : undefined} />
                        <div className="hint">Required - this is how the project's revenue is attributed. Clients never sign in.</div>
                    </div>
                ) : (
                    <div className="hint mt">Internal projects have no client: their labour and expenses are tracked as company cost.</div>
                )}

                {execMoney && (
                    <div className="np-money mt">
                        <div className="u" style={{ marginBottom: 8 }}>Money</div>
                        {takesPayment && <div className="grid g-2">
                            <div className="field">
                                <label className="label" htmlFor="np-init">Initial payment received</label>
                                <AmountField id="np-init" value={initialPay} currencies={false} onChange={setInitialPay} />
                            </div>
                            <div className="grid g-2" style={{ gap: 8 }}>
                                <div className="field">
                                    <label className="label" htmlFor="np-paydate">Received on</label>
                                    <DateInput id="np-paydate" className="input mono" value={payDate} max={companyToday()} required onChange={setPayDate} />
                                </div>
                                <div className="field">
                                    <label className="label" htmlFor="np-paymethod">Method</label>
                                    <Select id="np-paymethod" value={payMethod} onChange={setPayMethod}
                                        options={Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label }))} />
                                </div>
                            </div>
                        </div>}
                        <div className={takesPayment ? "grid g-2 mt-s" : "grid g-2"}>
                            <div className="field">
                                <label className="label" htmlFor="np-fee">Project fee <span className="muted">· optional</span></label>
                                <AmountField id="np-fee" value={fee} currencies={false} onChange={setFee} />
                            </div>
                            <div className="field">
                                <label className="label">Default material profit</label>
                                <div className="row wrap" style={{ gap: 5, alignItems: "center" }}>
                                    {[0, 5, 10, 25].map((v) => (
                                        <button key={v} type="button" className={cx("chip", +markupPct === v && "on")} onClick={() => setMarkupPct(v)}>{v}%</button>
                                    ))}
                                    <input className="input mono" type="number" min="0" step="0.5" style={{ width: 70 }} aria-label="Material profit percent"
                                        value={markupPct} onChange={(e) => setMarkupPct(e.target.value === "" ? "" : +e.target.value)} />
                                    <span className="muted">%</span>
                                </div>
                            </div>
                        </div>
                        <div className="hint" style={{ marginTop: 6 }}>
                            {!takesPayment ? "" : initialPay > 0
                                ? `Recorded as a client payment. With nothing spent yet, the project starts ${money.exact(initialPay)} in profit. `
                                : "Leave the payment at $0 if nothing has been received yet - it can be recorded later. "}Fee and material profit can be changed at any time.
                        </div>
                    </div>
                )}

                {!more ? (
                    <button type="button" className="btn btn-quiet btn-sm mt" onClick={() => setMore(true)}><Icon name="plus" />Add details (optional)</button>
                ) : (
                    <div className="stack mt">
                        <div className="field">
                            <label className="label" htmlFor="np-desc">Description</label>
                            <textarea id="np-desc" className="textarea" style={{ minHeight: 60 }} placeholder="What is this project about?"
                                value={description} onChange={(e) => setDescription(e.target.value)} />
                        </div>
                        <div className="grid g-2">
                            <div className="field">
                                <label className="label" htmlFor="np-owner">Project owner</label>
                                <Select id="np-owner" value={owner} onChange={setOwner} options={owners} />
                            </div>
                            <div className="field">
                                <label className="label" htmlFor="np-target">Target completion</label>
                                <DateInput id="np-target" className="input mono" value={target} min={companyToday()} onChange={setTarget} />
                            </div>
                        </div>
                        {execution && (
                            <div>
                                <div className="grid g-2">
                                    <div className="field">
                                        <label className="label" htmlFor="np-workers">Ground workers per day (avg)</label>
                                        <input id="np-workers" className="input mono" type="number" min="0" step="1" placeholder="e.g. 8"
                                            value={workers} onChange={(e) => setWorkers(e.target.value)} />
                                    </div>
                                    <div className="field">
                                        <label className="label" htmlFor="np-daypay">Cost per ground worker per day (avg)</label>
                                        <AmountField id="np-daypay" value={dailyPay} currencies={false} onChange={setDailyPay} />
                                    </div>
                                </div>
                                <div className="hint" style={{ marginTop: 5 }}>
                                    Each week's labour report starts from these numbers. They can be changed later from the project's Weekly labour panel.
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="banner mt">
                    <Icon name="info" />
                    <div>
                        <b>What happens next</b>
                        <div className="muted" style={{ marginTop: 3 }}>
                            The project is created as <b>Active</b> with today's date as its start date and appears on every employee's
                            active list. Employees can log work against it immediately.
                        </div>
                    </div>
                </div>
            </form>

            {newClient != null && (
                <ClientModal domain={domain} prefillName={newClient} onClose={(saved) => { setNewClient(null); if (saved) setClientId(saved.id); }} />
            )}
        </Modal>
    );
}
