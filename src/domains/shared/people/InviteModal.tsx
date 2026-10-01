import { useState } from "react";
import { useNavigate } from "react-router";
import { errorMessage } from "@/api/errors";
import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { canOpen } from "@/app/routing/routeTable";
import { useCompanySettings } from "@/app/shell/shellQueries";
import { StatusBadge } from "@/shared/components/Data/Pills";
import AmountField from "@/shared/components/Forms/AmountField";
import { FieldError } from "@/shared/components/Forms/Field";
import { Segmented } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import Avatar from "@/shared/components/Identity/Avatar";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { DOMAIN_LABEL } from "@/shared/format/labels";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { isEmail } from "@/shared/utils/email";
import { HOURS_PER_MONTH, monthlyToHourly } from "../../design/pay/payRules";
import { useInvite, useTeams } from "../../design/people/peopleWorkApi";

type Role = "employee" | "admin" | "super_admin";
const ACCESS: Record<Role, { label: string; sub: string }> = {
    employee: { label: "Employee", sub: "Their own projects and work" },
    admin: { label: "Admin", sub: "Everything inside one domain" },
    super_admin: { label: "Super admin", sub: "Both domains and the company view" },
};

/** "amara" from "amara@studio.com", for the avatar until they give their name. */
const nameFromEmail = (email: string) => email.split("@")[0].replace(/[._-]+/g, " ").trim() || "New Person";

/**
 * Add employee (the prototype's P.AddEmployee): they get an invitation and appear in the employee list
 * straight away. They give their own name when they accept.
 */
export default function InviteModal({ domain: fixed, initialRole = "employee", onClose }: {
    /** The business they join; null from the company area, where it is chosen here. */
    domain: Domain | null;
    initialRole?: Role;
    onClose: () => void;
}) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const company = useCompanySettings().data;
    const invite = useInvite();
    const errors = useFormErrors();
    const [chosen, setChosen] = useState<Domain>("design");
    const domain = fixed ?? chosen;
    const teams = useTeams(domain).data ?? [];
    const design = domain === "design";
    const roles: Role[] = ["employee", "admin", ...(permissions.has(P.EMPLOYEE_INVITE_SUPER_ADMIN) ? ["super_admin" as const] : [])];
    const [email, setEmail] = useState("");
    const [position, setPosition] = useState("");
    const [teamId, setTeamId] = useState("");
    const [role, setRole] = useState<Role>(initialRole);
    // an hourly cost only means something where people log hours: Design is paid per hour by default
    const [basis, setBasis] = useState<"hourly" | "monthly">(design ? "hourly" : "monthly");
    const [amount, setAmount] = useState(0);
    const [currency, setCurrency] = useState(company?.defaultCurrency ?? "USD");
    const [sent, setSent] = useState<Schemas["InvitationResponse"] | null>(null);
    const monthly = basis === "monthly";
    const setsPay = role === "employee" && permissions.has(P.EMPLOYEE_PAY_MANAGE);
    const emailError = !email.trim() ? "Enter their work email." : !isEmail(email) && "Enter an email like name@company.com.";
    const payError = setsPay && !(amount > 0) && `Enter their pay ${monthly ? "per month" : "per hour"}.`;
    const team = teams.find((t) => String(t.id) === teamId);

    function choose(next: Domain) {
        // another business: its own teams, and its usual way of paying
        setChosen(next);
        setTeamId("");
        setBasis(next === "design" ? "hourly" : "monthly");
    }

    function send() {
        if (invite.isPending) return;
        if (emailError || payError) return errors.tried();
        invite.mutate({
            email: email.trim(), role, domainCode: role === "super_admin" ? null : domain, teamId: teamId ? +teamId : null,
            position: position.trim() || null, pay: setsPay ? { basis, amount, currency } : null,
        }, { onSuccess: setSent });
    }

    if (sent) {
        const profile = design && canOpen(permissions, "design", `people/${sent.userId}`);
        return (
            <Modal title="Invitation sent" onClose={onClose}
                foot={
                    <>
                        <div className="grow" />
                        {profile && <button className="btn" onClick={() => { onClose(); navigate(`/design/people/${sent.userId}`); }}>Open profile</button>}
                        <button className="btn btn-primary" onClick={onClose}>Done</button>
                    </>
                }>
                <div className="row" style={{ gap: 12, marginBottom: 14 }}>
                    <Avatar person={{ name: nameFromEmail(sent.email) }} size={44} />
                    <div>
                        <div style={{ fontWeight: 650, fontSize: 14 }}>{sent.email}</div>
                        <div className="muted">{[position.trim(), team?.name].filter(Boolean).join(" · ") || ACCESS[role].label}</div>
                    </div>
                    <div className="grow" />
                    <StatusBadge status="invited" />
                </div>
                <div className="panel" style={{ background: "var(--surface-2)" }}>
                    <div className="panel-body">
                        <div className="muted" style={{ fontSize: 11 }}>To: {sent.email}</div>
                        <div style={{ fontWeight: 650, marginTop: 6 }}>You have been invited to ID InDetails</div>
                        <p className="sec mt-s" style={{ fontSize: "12.5px" }}>
                            You were added to {company?.name ?? "the company"}. Accept the invitation, set your name and password, and you can see the projects you work on.
                        </p>
                    </div>
                </div>
                <p className="hint mt">They appear in the employee list as <b>Invited</b> until they accept. They cannot log work before that.</p>
            </Modal>
        );
    }

    return (
        <Modal title={fixed ? "Add employee" : "Add person"} sub={`They get an invitation and appear in the ${fixed ? "employee" : "people"} list straight away.`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{invite.error ? <span className="err"><Icon name="alert" />{errorMessage(invite.error)}</span> : null}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={invite.isPending} onClick={send}>{invite.isPending ? "Sending…" : "Send invitation"}</button>
                </>
            }>
            <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
                <div style={{ textAlign: "center", width: 92, flex: "none" }}>
                    <Avatar person={{ name: email ? nameFromEmail(email) : "New Person" }} size={72} />
                    <div className="hint mt-s">They set their name when they accept, and can upload a photo later.</div>
                </div>
                <div className="grow stack">
                    <div className="field">
                        <label className="label required" htmlFor="ae-email">Work email</label>
                        <input id="ae-email" className="input" type="email" autoFocus placeholder="name@company.com" value={email}
                            onChange={(e) => setEmail(e.target.value)} onBlur={errors.touch("email")} />
                        <FieldError message={errors.show("email", emailError)} />
                    </div>
                    <div className="grid g-2">
                        <div className="field">
                            <label className="label" htmlFor="ae-pos">Position</label>
                            <input id="ae-pos" className="input" placeholder={`Optional - e.g. ${design ? "Interior Architect" : "Site Engineer"}`} value={position} onChange={(e) => setPosition(e.target.value)} />
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="ae-team">Team</label>
                            <Select id="ae-team" value={teamId} onChange={setTeamId} options={[{ value: "", label: "No team" }, ...teams.map((t) => ({ value: String(t.id), label: t.name }))]} />
                        </div>
                    </div>
                    {setsPay && (
                        <div className="field">
                            <div className="spread" style={{ alignItems: "center" }}>
                                <label className="label required" htmlFor="ae-rate" style={{ margin: 0 }}>Pay</label>
                                <Segmented value={basis} onChange={setBasis} aria-label="Pay basis" options={[{ value: "hourly", label: "Per hour" }, { value: "monthly", label: "Per month" }]} />
                            </div>
                            <div className="grid g-2 mt-s">
                                <div className="field">
                                    <AmountField id="ae-rate" value={amount} currency={currency} onChange={setAmount} onCurrency={setCurrency} onBlur={errors.touch("pay")} />
                                    {errors.show("pay", payError) ? <FieldError message={errors.show("pay", payError)} />
                                        : <div className="hint">{monthly ? "Monthly salary." : "Paid per hour worked."} Never shown to the employee.</div>}
                                </div>
                                <div className="field">
                                    <div className="u">{monthly ? "Works out at" : "A full month is"}</div>
                                    <div className="mono" style={{ paddingTop: 4, fontSize: 14, fontWeight: 650 }}>
                                        {monthly ? (amount ? `${money.fmt(monthlyToHourly(amount), currency, { cents: true })} / hour` : "-")
                                            : (amount ? `${money.fmt(amount * HOURS_PER_MONTH, currency)} / month` : "-")}
                                    </div>
                                    <div className="hint">40 paid hours a week (5 days, the 1h break included) = {HOURS_PER_MONTH.toFixed(1)} h a month.</div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className="field">
                        <label className="label required">Access</label>
                        <Segmented value={role} onChange={setRole} aria-label="Access" options={roles.map((r) => ({ value: r, label: ACCESS[r].label }))} />
                        <div className="hint">{ACCESS[role].sub}</div>
                    </div>
                    {role !== "super_admin" && (fixed ? (
                        <div className="field">
                            <label className="label">Domain</label>
                            <div className="row" style={{ gap: 8, paddingTop: 2 }}>
                                <span className="badge">{DOMAIN_LABEL[domain]}</span>
                                <span className="hint">They join the business you are managing. Only a super admin can move someone between businesses.</span>
                            </div>
                        </div>
                    ) : (
                        <div className="field">
                            <label className="label required">Business they join</label>
                            <Segmented value={domain} onChange={choose} aria-label="Business they join"
                                options={(["design", "execution"] as Domain[]).map((d) => ({ value: d, label: DOMAIN_LABEL[d] }))} />
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
}
