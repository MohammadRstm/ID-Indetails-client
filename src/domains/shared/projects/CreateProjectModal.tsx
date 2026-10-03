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
import NumberField from "@/shared/components/Forms/NumberField";
import { MARKUP_PERCENT, WORKERS } from "@/shared/format/limits";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { PAYMENT_METHODS } from "@/shared/format/labels";
import { companyToday } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
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
    const [location, setLocation] = useState("");
    const [owner, setOwner] = useState(String(me.id));
    const [target, setTarget] = useState("");
    // a client is picked from the client list: without client:view, a Design project can only be internal
    const seesClients = permissions.has(P.CLIENT_VIEW);
    const [billing, setBilling] = useState<"client" | "internal">(seesClients || execution ? "client" : "internal");
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
    const errors = useFormErrors();
    const titleError = title.trim() === "" && "Give the project a name.";
    const clientError = billing === "client" && clientId == null && "Choose who the project is for, or make it internal.";
    const ok = !titleError && !clientError;

    // Who can own it: the person creating it, and the people of this domain.
    const owners = [
        { value: String(me.id), label: `${fullName(me)} (you)` },
        ...(people.data ?? []).filter((p) => p.id !== me.id).map((p) => ({ value: String(p.id), label: personName(p) })),
    ];

    async function submit(e?: FormEvent) {
        e?.preventDefault();
        if (create.isPending) return;
        if (!ok) {
            errors.tried();
            return;
        }
        try {
            const project = await create.mutateAsync({
                title: title.trim(),
                description: description.trim() || null,
                location: location.trim() || null,
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
                    <button className="btn btn-primary" disabled={create.isPending} onClick={() => submit()}>{create.isPending ? "Creating…" : "Create project"}</button>
                </>
            }
        >
            <form onSubmit={submit}>
                <div className="field">
                    <label className="label required" htmlFor="np-title">Project name</label>
                    <input id="np-title" className="input" style={{ height: 44, fontSize: 16, fontWeight: 600 }} autoFocus placeholder={execution ? "e.g. Achrafieh apartment fit-out" : "e.g. Villa Mounir interiors"}
                        value={title} onChange={(e) => setTitle(e.target.value)} onBlur={errors.touch("title")} />
                    {errors.show("title", titleError) ? <FieldError message={errors.show("title", titleError)} />
                        : <div className="hint">Press Enter to create. You can add details later.</div>}
                </div>

                {execution ? (
                    <div className="hint mt">Every Execution project is for a client. What the client owes builds up from the materials (at client prices) and the project fee.</div>
                ) : (
                    <div className="grid g-2 mt">
                        <div className="field">
                            <label className="label required">Project type</label>
                            <div className="seg">
                                <button type="button" className={cx("seg-btn", billing === "client" && "on")} disabled={!seesClients}
                                    title={seesClients ? undefined : "Picking a client needs “View clients”"} onClick={() => setBilling("client")}>Client project</button>
                                <button type="button" className={cx("seg-btn", billing === "internal" && "on")} onClick={() => setBilling("internal")}>Internal</button>
                            </div>
                        </div>
                        <div className="field">
                            <label className="label optional" htmlFor="np-pay">Customer payment</label>
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
                        <label className="label required">Client</label>
                        {seesClients ? (
                            <>
                                <ClientPicker domain={domain} value={clientId} onChange={setClientId}
                                    onCreate={permissions.has(P.CLIENT_CREATE) ? (typed) => setNewClient(typed) : undefined} />
                                {errors.show("client", clientError) ? <FieldError message={errors.show("client", clientError)} />
                                    : <div className="hint">Required - this is how the project's revenue is attributed. Clients never sign in.</div>}
                            </>
                        ) : <FieldError message="Picking a client needs “View clients”, which you don't have." />}
                    </div>
                ) : (
                    <div className="hint mt">Internal projects have no client: their labour and expenses are tracked as company cost.</div>
                )}

                <div className="field mt">
                    <label className="label" htmlFor="np-location">Location</label>
                    <input id="np-location" className="input" maxLength={200} placeholder={`Optional - e.g. ${execution ? "Achrafieh, Beirut" : "Broummana, Mount Lebanon"}`}
                        value={location} onChange={(e) => setLocation(e.target.value)} />
                </div>

                {execMoney && (
                    <div className="np-money mt">
                        <div className="u" style={{ marginBottom: 8 }}>Money</div>
                        {takesPayment && <div className="grid g-2">
                            <div className="field">
                                <label className="label optional" htmlFor="np-init">Initial payment received</label>
                                <AmountField id="np-init" value={initialPay} currencies={false} onChange={setInitialPay} />
                            </div>
                            <div className="grid g-2" style={{ gap: 8 }}>
                                <div className="field">
                                    <label className="label required" htmlFor="np-paydate">Received on</label>
                                    <DateInput id="np-paydate" className="input mono" value={payDate} max={companyToday()} required onChange={setPayDate} />
                                </div>
                                <div className="field">
                                    <label className="label required" htmlFor="np-paymethod">Method</label>
                                    <Select id="np-paymethod" value={payMethod} onChange={setPayMethod}
                                        options={Object.entries(PAYMENT_METHODS).map(([value, label]) => ({ value, label }))} />
                                </div>
                            </div>
                        </div>}
                        <div className={takesPayment ? "grid g-2 mt-s" : "grid g-2"}>
                            <div className="field">
                                <label className="label optional" htmlFor="np-fee">Project fee</label>
                                <AmountField id="np-fee" value={fee} currencies={false} onChange={setFee} />
                            </div>
                            <div className="field">
                                <label className="label required">Default material profit</label>
                                <div className="row wrap" style={{ gap: 5, alignItems: "center" }}>
                                    {[0, 5, 10, 25].map((v) => (
                                        <button key={v} type="button" className={cx("chip", +markupPct === v && "on")} onClick={() => setMarkupPct(v)}>{v}%</button>
                                    ))}
                                    <NumberField shape={MARKUP_PERCENT} style={{ width: 70 }} aria-label="Material profit percent"
                                        value={markupPct} onChange={(text) => setMarkupPct(text === "" ? "" : +text)} />
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
                            <textarea id="np-desc" className="textarea" style={{ minHeight: 60 }} placeholder="Optional - what is this project about?"
                                value={description} onChange={(e) => setDescription(e.target.value)} />
                        </div>
                        <div className="grid g-2">
                            <div className="field">
                                <label className="label required" htmlFor="np-owner">Project owner</label>
                                <Select id="np-owner" value={owner} onChange={setOwner} options={owners} />
                            </div>
                            <div className="field">
                                <label className="label" htmlFor="np-target">Target completion</label>
                                <DateInput id="np-target" className="input mono" value={target} min={companyToday()} placeholder="Optional" onChange={setTarget} />
                            </div>
                        </div>
                        {execution && (
                            <div>
                                <div className="grid g-2">
                                    <div className="field">
                                        <label className="label" htmlFor="np-workers">Ground workers per day (avg)</label>
                                        <NumberField id="np-workers" shape={WORKERS} placeholder="Optional - e.g. 8" value={workers} onChange={setWorkers} />
                                    </div>
                                    <div className="field">
                                        <label className="label optional" htmlFor="np-daypay">Cost per ground worker per day (avg)</label>
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
