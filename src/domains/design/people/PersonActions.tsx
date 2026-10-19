import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { AREAS } from "@/app/routing/areas";
import { useCurrentUser } from "@/app/session/useSession";
import { toast } from "@/shared/components/Feedback/toast";
import { Segmented } from "@/shared/components/Forms/Filters";
import DateInput from "@/shared/components/Forms/DateInput";
import Select from "@/shared/components/Forms/Select";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import Modal from "@/shared/components/Overlays/Modal";
import { addDays, companyToday, fmtDateY, fmtMonthY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import EditProfileModal from "./EditProfileModal";
import { useChangeRole, useDeactivate, useEmployee, useEndSessions, useMoveEmployee, useReactivate, useResendInvitation, useRestoreSignIn, useTeams } from "./peopleWorkApi";

export type Account = {
    id: number;
    name: string;
    role: string;
    domain: string | null;
    status: string;
    leftOn: string | null;
    /** When a super admin ended their sessions; they can't sign in until it is restored. */
    sessionsRevokedAt?: string | null;
};

type Dialog = "profile" | "role" | "move" | "deactivate" | "reactivate" | "end-sessions" | "restore-sign-in" | null;

const ROLES = [{ value: "employee", label: "Employee" }, { value: "admin", label: "Admin" }, { value: "super_admin", label: "Super admin" }] as const;
const other = (d: string | null): Domain => (d === "design" ? "execution" : "design");

function Foot({ error, busy, label, danger, disabled, onCancel, onGo }: { error: unknown; busy: boolean; label: string; danger?: boolean; disabled?: boolean; onCancel: () => void; onGo: () => void }) {
    return (
        <>
            <div className="grow">{error ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(error)}</span> : null}</div>
            <button className="btn" onClick={onCancel}>Cancel</button>
            <button className={danger ? "btn btn-danger" : "btn btn-primary"} disabled={busy || disabled} onClick={onGo}>{label}</button>
        </>
    );
}

/**
 * What an admin can do to someone's account beyond their details: their role, their business, ending and
 * restarting their employment, and a fresh invitation. The prototype had none of these; they follow the API's
 * rules (nobody changes their own account, a super admin's needs employee:invite_super_admin, and only
 * someone who sees both businesses moves people between them).
 */
export default function PersonActions({ account }: { account: Account }) {
    const permissions = usePermissions();
    const me = useCurrentUser();
    const [dialog, setDialog] = useState<Dialog>(null);
    const resend = useResendInvitation(account.id);
    // a super admin's account needs employee:invite_super_admin for any change
    const guarded = account.role !== "super_admin" || permissions.has(P.EMPLOYEE_INVITE_SUPER_ADMIN);
    const manage = permissions.has(P.EMPLOYEE_MANAGE) && guarded;
    const deactivated = account.status === "deactivated";
    const invited = account.status === "invited";
    // between the two businesses only: the website's staff stay with the website
    const canMove = manage && !deactivated && account.role !== "super_admin" && account.domain !== "website"
        && permissions.canSeeDomain("design") && permissions.canSeeDomain("execution");
    const canResend = invited && permissions.hasAny(P.EMPLOYEE_INVITE, P.EMPLOYEE_INVITE_SUPER_ADMIN);
    const suspended = !!account.sessionsRevokedAt;
    const sessions = permissions.has(P.SESSION_MANAGE) && guarded;
    const canEndSessions = sessions && account.status === "active" && !suspended;
    const canRestore = sessions && suspended;
    // a super admin has no profile page to edit them from, so their details and salary are edited here
    const canEditProfile = account.role === "super_admin" && !deactivated && (manage || permissions.has(P.EMPLOYEE_PAY_MANAGE) || (guarded && permissions.has(P.EMPLOYEE_CHANGE_EMAIL)));
    // nobody changes their own account (an admin can reach their own profile from a notice or the feed)
    if (account.id === me.id || (!manage && !sessions && !canResend && !canEditProfile)) return null;

    function sendAgain() {
        resend.mutate(undefined, {
            onSuccess: () => toast({ text: "Invitation sent again", sub: "The earlier link no longer works.", icon: "send" }),
            onError: (e) => toast({ text: "The invitation wasn't sent", sub: errorMessage(e), icon: "alert" }),
        });
    }

    return (
        <>
            <MenuButton icon="dots" label="More actions" width={220}>
                {(close) => (
                    <div>
                        {canEditProfile && <button className="pop-item" onClick={() => { close(); setDialog("profile"); }}><Icon name="edit" />Edit profile and pay…</button>}
                        {canResend && <button className="pop-item" disabled={resend.isPending} onClick={() => { close(); sendAgain(); }}><Icon name="send" />Resend invitation</button>}
                        {manage && !deactivated && !invited && <button className="pop-item" onClick={() => { close(); setDialog("role"); }}><Icon name="shield" />Change role…</button>}
                        {canMove && <button className="pop-item" onClick={() => { close(); setDialog("move"); }}><Icon name="arrowRight" />Move to {AREAS[other(account.domain)].label}…</button>}
                        {canEndSessions && <button className="pop-item" onClick={() => { close(); setDialog("end-sessions"); }}><Icon name="logout" />End all sessions…</button>}
                        {canRestore && <button className="pop-item" onClick={() => { close(); setDialog("restore-sign-in"); }}><Icon name="refresh" />Restore sign-in…</button>}
                        {manage && !deactivated && <button className="pop-item" onClick={() => { close(); setDialog("deactivate"); }}><Icon name="lock" />Deactivate…</button>}
                        {manage && deactivated && <button className="pop-item" onClick={() => { close(); setDialog("reactivate"); }}><Icon name="refresh" />Reactivate…</button>}
                    </div>
                )}
            </MenuButton>
            {dialog === "profile" && <SuperAdminProfile account={account} onClose={() => setDialog(null)} />}
            {dialog === "role" && <RoleModal account={account} onClose={() => setDialog(null)} />}
            {dialog === "move" && <MoveModal account={account} onClose={() => setDialog(null)} />}
            {dialog === "deactivate" && <DeactivateModal account={account} onClose={() => setDialog(null)} />}
            {dialog === "reactivate" && <ReactivateModal account={account} onClose={() => setDialog(null)} />}
            {dialog === "end-sessions" && <EndSessionsModal account={account} onClose={() => setDialog(null)} />}
            {dialog === "restore-sign-in" && <RestoreSignInModal account={account} onClose={() => setDialog(null)} />}
        </>
    );
}

/** A super admin's details and salary, loaded before the form opens. */
function SuperAdminProfile({ account, onClose }: { account: Account; onClose: () => void }) {
    const employee = useEmployee(account.id);
    const e = employee.data;
    if (!e) {
        return (
            <Modal title={`Edit ${account.name.split(" ")[0]}'s profile`} onClose={onClose}>
                {loadFailed(employee) ? <LoadError error={employee.error} retry={() => employee.refetch()} what={`${account.name}'s profile`} /> : <SkeletonLines lines={5} />}
            </Modal>
        );
    }
    return (
        <EditProfileModal self={false} onClose={onClose} person={{
            id: e.id, firstName: e.firstName, lastName: e.lastName, email: e.email, phone: e.phone, photoFileId: e.photoFileId,
            position: e.position, team: e.team, domain: e.domain, role: e.role, status: e.status,
        }} />
    );
}

function RoleModal({ account, onClose }: { account: Account; onClose: () => void }) {
    const permissions = usePermissions();
    const change = useChangeRole(account.id);
    const supers = permissions.has(P.EMPLOYEE_INVITE_SUPER_ADMIN);
    // the website's staff are admins: they can only become super admins
    const options = ROLES.filter((r) => r.value !== account.role && (r.value !== "super_admin" || supers) && !(account.domain === "website" && r.value === "employee"));
    const [role, setRole] = useState<string>(options[0]?.value ?? "employee");
    // a super admin belongs to no business, so stepping down means joining one
    const needsDomain = account.role === "super_admin" && role !== "super_admin";
    const [domain, setDomain] = useState<Domain>("design");
    const label = ROLES.find((r) => r.value === role)?.label ?? role;
    // their job title in the new role: the current one, to keep or change
    const current = useEmployee(account.id).data;
    const [position, setPosition] = useState<string | null>(null);
    if (position == null && current) setPosition(current.position ?? "");
    const newPosition = position != null && position.trim() !== (current?.position ?? "") ? position.trim() : null;

    function go() {
        // the position goes only when it changed; without it, the title stays as it is
        change.mutate({ role, domainCode: needsDomain ? domain : null, ...(newPosition != null ? { position: newPosition } : {}) }, {
            onSuccess: () => { toast({ text: `${account.name} is now ${role === "admin" ? "an admin" : role === "employee" ? "an employee" : "a super admin"}`, sub: "Any permissions set just for them were cleared.", icon: "shield" }); onClose(); },
        });
    }

    return (
        <Modal title="Change role" sub={account.name} onClose={onClose}
            foot={<Foot error={change.error} busy={change.isPending} label={`Make ${label.toLowerCase()}`} onCancel={onClose} onGo={go} />}>
            <div className="field">
                <label className="label required">New role</label>
                <Segmented aria-label="New role" value={role} onChange={setRole} options={options.map((o) => ({ value: o.value, label: o.label }))} />
            </div>
            {needsDomain && (
                <div className="field mt">
                    <label className="label required">Business they join</label>
                    <Segmented aria-label="Business they join" value={domain} onChange={setDomain}
                        options={(["design", "execution"] as Domain[]).map((d) => ({ value: d, label: AREAS[d].label }))} />
                </div>
            )}
            <div className="field mt">
                <label className="label optional" htmlFor="role-position">Position</label>
                <input id="role-position" className="input" maxLength={120} placeholder={current ? "No position" : "Loading…"} disabled={!current}
                    value={position ?? ""} onChange={(e) => setPosition(e.target.value)} />
                <div className="hint">Their job title in the new role. Leave it as it is if it stays the same.</div>
            </div>
            <p className="hint mt">
                {role === "super_admin" ? "A super admin sees both businesses and the company area, and belongs to neither. " : ""}
                They get the new role's permissions; anything set just for them is cleared, and they're told.
            </p>
        </Modal>
    );
}

function MoveModal({ account, onClose }: { account: Account; onClose: () => void }) {
    const to = other(account.domain);
    const move = useMoveEmployee(account.id);
    const teams = useTeams(to);
    const [team, setTeam] = useState("none");

    function go() {
        move.mutate({ domainCode: to, teamId: team === "none" ? null : Number(team) }, {
            onSuccess: () => { toast({ text: `${account.name} moved to ${AREAS[to].label}`, sub: "Any permissions set just for them were cleared.", icon: "arrowRight" }); onClose(); },
        });
    }

    return (
        <Modal title={`Move to ${AREAS[to].label}`} sub={account.name} onClose={onClose}
            foot={<Foot error={move.error} busy={move.isPending} label={`Move to ${AREAS[to].label}`} onCancel={onClose} onGo={go} />}>
            <div className="field">
                <label className="label" htmlFor="move-team">Team</label>
                <Select id="move-team" value={team} onChange={setTeam}
                    options={[{ value: "none", label: "No team" }, ...(teams.data ?? []).map((t) => ({ value: String(t.id), label: t.name }))]} />
            </div>
            <p className="hint mt">
                They keep their role and their history. They leave {AREAS[other(to)].label}'s projects and chats and see {AREAS[to].label}'s instead;
                anything set just for them in permissions is cleared.
            </p>
        </Modal>
    );
}

function DeactivateModal({ account, onClose }: { account: Account; onClose: () => void }) {
    const today = companyToday();
    const deactivate = useDeactivate(account.id);
    const [lastDay, setLastDay] = useState(today);
    const invited = account.status === "invited";

    function go() {
        deactivate.mutate(invited ? null : lastDay, {
            onSuccess: () => {
                toast({ text: `${account.name} deactivated`, sub: invited ? "Their invitation no longer works." : `Employment ends ${fmtDateY(lastDay)}. Their history stays.`, icon: "lock" });
                onClose();
            },
        });
    }

    return (
        <Modal title={invited ? "Cancel invitation" : "Deactivate account"} sub={account.name} onClose={onClose}
            foot={<Foot error={deactivate.error} busy={deactivate.isPending} danger label={invited ? "Cancel invitation" : "Deactivate"} disabled={!invited && !lastDay} onCancel={onClose} onGo={go} />}>
            {!invited && (
                <div className="field">
                    <label className="label required" htmlFor="last-day">Last working day</label>
                    <DateInput id="last-day" value={lastDay} onChange={setLastDay} />
                    <div className="hint">Paid up to and including this day.</div>
                </div>
            )}
            <p className="hint mt">
                They can't sign in any more, and every session they have open ends now. Their work, pay and messages stay as they were;
                they can be reactivated later.
            </p>
        </Modal>
    );
}

/** For an account someone else may be using: out everywhere now, and kept out until a super admin lets them back. */
function EndSessionsModal({ account, onClose }: { account: Account; onClose: () => void }) {
    const end = useEndSessions(account.id);
    const first = account.name.split(" ")[0];

    function go() {
        end.mutate(undefined, {
            onSuccess: () => {
                toast({ text: `${account.name} is signed out everywhere`, sub: "They can't sign in again until a super admin restores it.", icon: "lock" });
                onClose();
            },
        });
    }

    return (
        <Modal title="End all sessions" sub={account.name} onClose={onClose}
            foot={<Foot error={end.error} busy={end.isPending} danger label="End sessions" onCancel={onClose} onGo={go} />}>
            <p>
                {first} is signed out on every device at once, and can't sign in again, even with the right password, until a super admin
                restores their sign-in here.
            </p>
            <p className="hint mt">
                Use it when someone else may be using their account. Their work, pay and messages stay as they are, and they stay employed.
            </p>
        </Modal>
    );
}

function RestoreSignInModal({ account, onClose }: { account: Account; onClose: () => void }) {
    const restore = useRestoreSignIn(account.id);
    const first = account.name.split(" ")[0];

    function go() {
        restore.mutate(undefined, {
            onSuccess: () => {
                toast({ text: `${account.name} can sign in again`, sub: "Sessions from before stay ended.", icon: "refresh" });
                onClose();
            },
        });
    }

    return (
        <Modal title="Restore sign-in" sub={account.name} onClose={onClose}
            foot={<Foot error={restore.error} busy={restore.isPending} label="Restore sign-in" onCancel={onClose} onGo={go} />}>
            <p>
                {first} can sign in again with their password.{account.sessionsRevokedAt ? ` Their sessions were ended ${fmtDateY(account.sessionsRevokedAt)}` : ""}
                {account.sessionsRevokedAt ? "; anything signed in before that stays signed out." : ""}
            </p>
            <p className="hint mt">If someone else may know their password, ask them to reset it from the sign-in page once they are back.</p>
        </Modal>
    );
}

function ReactivateModal({ account, onClose }: { account: Account; onClose: () => void }) {
    const reactivate = useReactivate(account.id);
    // only days away earlier this month can still be paid (the API's EmploymentRules.AsksAboutGap): a
    // left-on in this month with at least a day between it and today; earlier months are closed
    const today = companyToday();
    const askGap = account.leftOn != null && account.leftOn.slice(0, 7) === today.slice(0, 7) && addDays(account.leftOn, 1) < today;
    const [payGap, setPayGap] = useState<"paid" | "unpaid">("unpaid");

    function go() {
        reactivate.mutate(askGap ? payGap === "paid" : null, {
            onSuccess: (e) => {
                toast({ text: `${account.name} reactivated`, sub: e.status === "invited" ? "They were invited again, with a new link." : "A new period of employment starts today.", icon: "refresh" });
                onClose();
            },
        });
    }

    return (
        <Modal title="Reactivate account" sub={account.name} onClose={onClose}
            foot={<Foot error={reactivate.error} busy={reactivate.isPending} label="Reactivate" onCancel={onClose} onGo={go} />}>
            {askGap && (
                <div className="field">
                    <label className="label required">The days they were away in {fmtMonthY(account.leftOn!)}</label>
                    <Segmented aria-label="Time away" value={payGap} onChange={setPayGap} options={[{ value: "unpaid", label: "Unpaid" }, { value: "paid", label: "Paid" }]} />
                </div>
            )}
            <p className="hint mt">
                {account.leftOn ? `They left on ${fmtDateY(account.leftOn)}. ` : ""}They can sign in again as before, and a new period of
                employment starts today{askGap ? "" : " - time away isn't paid"}. Someone who never signed up is invited again instead.
            </p>
        </Modal>
    );
}
