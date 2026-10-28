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
import { WORKERS } from "@/shared/format/limits";
import Modal from "@/shared/components/Overlays/Modal";
import { companyToday } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import { cx } from "@/shared/utils/cx";
import ClientModal from "../clients/ClientModal";
import ClientPicker from "../clients/ClientPicker";
import { useClient } from "../clients/clientsApi";
import { personName, useProjectOwners } from "../people/peopleApi";
import { StaffPicker } from "../../execution/staff/StaffPages";
import { useCreateProject } from "./projectsApi";
import TvaField from "./TvaField";
import FilledNote from "@/domains/shared/proton/FilledNote";
import { fillEmpty, useProtonForm } from "@/domains/shared/proton/formFill";

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
    const people = useProjectOwners(domain, permissions.has(P.EMPLOYEE_VIEW), permissions.canSeeDomain("design") && permissions.canSeeDomain("execution"));

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
    // an Execution site's agreed amount; materials come on top, at their client prices
    const [fee, setFee] = useState(0);
    // TVA on what the client pays, as a percentage: 15% unless told otherwise
    const [tvaPct, setTvaPct] = useState<number | "">(15);
    // who oversees a site: chosen when it is created
    const [staffIds, setStaffIds] = useState<number[]>([]);
    // Proton fills the project's details, never its money: the "more details" section opens to show what it filled
    const proton = useProtonForm("new_project", null, (fill) => {
        const v = fill.newProject;
        const done: string[] = [];
        if (!v) return done;
        fillEmpty(title, v.title, setTitle, "title", done);
        if (v.clientId != null && clientId == null) { setClientId(v.clientId); done.push("client"); }
        fillEmpty(description, v.description, setDescription, "description", done);
        fillEmpty(location, v.location, setLocation, "location", done);
        fillEmpty(target, v.targetDate, setTarget, "target date", done);
        if (v.description || v.location || v.targetDate) setMore(true);
        return done;
    });
    const client = useClient(clientId);
    const execMoney = execution && billing === "client";
    // the money is set by whoever may see it; anyone else creates the project and leaves it to them
    const setsPayment = !execution && billing === "client" && permissions.has(P.FINANCIAL_VIEW);
    const setsPricing = execMoney && permissions.has(P.PROJECT_PRICING_MANAGE);
    const setsTva = billing === "client" && permissions.has(P.FINANCIAL_VIEW);
    const errors = useFormErrors();
    const titleError = title.trim() === "" && "Give the project a name.";
    const clientError = billing === "client" && clientId == null && "Choose who the project is for, or make it internal.";
    const staffError = execution && staffIds.length === 0 && "Choose at least one staff member to oversee the site.";
    const ok = !titleError && !clientError && !staffError;

    // Who can own it: the domain's admins and the super admins (the creator first, when they are one), never an employee.
    const owners = [
        ...(permissions.isAdmin ? [{ value: String(me.id), label: `${fullName(me)} (you)` }] : []),
        ...people.filter((p) => p.id !== me.id).map((p) => ({ value: String(p.id), label: personName(p) })),
    ];
    const ownerId = owners.some((o) => o.value === owner) ? owner : owners[0]?.value ?? "";
    const ownerError = !ownerId && "An admin or a super admin owns each project. Ask one to create it, or to give you the permission to see people.";

    async function submit(e?: FormEvent) {
        e?.preventDefault();
        if (create.isPending) return;
        if (!ok || ownerError) {
            // the owner sits with the optional details: open them to show why
            if (ownerError) setMore(true);
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
                ownerId: +ownerId,
                targetDate: target || null,
                revenue: setsPayment && revenue ? revenue : null,
                projectFee: setsPricing ? fee || 0 : null,
                tvaRate: setsTva ? (+tvaPct || 0) / 100 : null,
                labourDefaults: execution && (workers !== "" || dailyPay) ? { workers: +workers || 0, dailyPay: dailyPay || 0 } : null,
                staffIds: execution ? staffIds : null,
            });
            toast({
                text: `"${project.title}" created · active from today`,
                sub: "It is on everyone's active project list",
                icon: "checkCircle",
                actionLabel: "Open project",
                action: () => navigate(`/${domain}/projects/${project.id}`),
            });
            onClose();
            // Straight to Requirements: a new project's progress means nothing until it has some. Whoever sends quotes
            // is asked there whether this one gets one.
            const quote = billing === "client" && permissions.has(P.INVOICE_SEND) ? "&quote=new" : "";
            navigate(`/${domain}/projects/${project.id}?tab=requirements${quote}`);
        } catch {
            // Shown in the foot.
        }
    }

    return (
        <Modal surfaceId="new_project"
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
            <div {...proton.guard}>
                <FilledNote fields={proton.filled} />
                <form onSubmit={submit}>
                    <div className="field">
                        <label className="label required" htmlFor="np-title">Project name</label>
                        <input id="np-title" className="input" style={{ height: 44, fontSize: 16, fontWeight: 600 }} autoFocus placeholder={execution ? "e.g. Achrafieh apartment fit-out" : "e.g. Villa Mounir interiors"}
                            value={title} onChange={(e) => setTitle(e.target.value)} onBlur={errors.touch("title")} />
                        {errors.show("title", titleError) ? <FieldError message={errors.show("title", titleError)} />
                            : <div className="hint">Press Enter to create. You can add details later.</div>}
                    </div>

                    {execution && (
                        <div className="field mt">
                            <label className="label required">Site staff</label>
                            <StaffPicker value={staffIds} onChange={setStaffIds} />
                            {errors.show("staff", staffError) ? <FieldError message={errors.show("staff", staffError)} />
                                : <div className="hint">Who oversees the site: they report its ground labour and write its daily logs.</div>}
                        </div>
                    )}

                    {execution ? (
                        <div className="hint mt">Every Execution project is for a client. They pay the agreed amount, and the materials on top at their client prices.</div>
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
                            {(setsPayment || billing !== "client") && <div className="field">
                                <label className="label optional" htmlFor="np-pay">Customer payment</label>
                                {setsPayment
                                    ? <AmountField id="np-pay" value={revenue} currencies={false} onChange={setRevenue} />
                                    : <div className="hint" style={{ paddingTop: 9 }}>Internal project - labour and expenses are tracked as company cost.</div>}
                            </div>}
                        </div>
                    )}
                    {setsPayment && (
                        <div className="grid g-2 mt-s">
                            <TvaField id="np-tva" value={tvaPct} onChange={setTvaPct} />
                            <div className="hint" style={{ paddingTop: 26 }}>
                                The payment is optional now - you can add or change it, and its TVA, until the project is completed.
                            </div>
                        </div>
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

                    {setsPricing && (
                        <div className="np-money mt">
                            <div className="u" style={{ marginBottom: 8 }}>Money</div>
                            <div className="grid g-2">
                                <div className="field">
                                    <label className="label optional" htmlFor="np-fee">Customer payment</label>
                                    <AmountField id="np-fee" value={fee} currencies={false} onChange={setFee} />
                                </div>
                                {setsTva && <TvaField id="np-tva" value={tvaPct} onChange={setTvaPct} />}
                            </div>
                            <div className="hint" style={{ marginTop: 6 }}>
                                The agreed amount, before materials. A down payment is recorded as a client payment once the site exists; material profit is set on its Financials tab.
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
                                    <Select id="np-owner" value={ownerId} onChange={setOwner} options={owners} />
                                    <FieldError message={errors.show("owner", ownerError)} />
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
            </div>
        </Modal>
    );
}
