import { useRef, useState } from "react";
import { errorMessage, toApiError } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import { Segmented } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import Avatar from "@/shared/components/Identity/Avatar";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { companyToday, fmtDateY } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { isEmail } from "@/shared/utils/email";
import { currentPay, HOURS_PER_MONTH, monthlyToHourly } from "../pay/payRules";
import { uploadFile } from "../work/workApi";
import { useChangeEmail, useChangeMyEmail, useChangePay, usePayHistory, useSetPhoto, useTeams, useUpdateEmployee, useUpdateMyProfile } from "./peopleWorkApi";

export type ProfilePerson = {
    id: number;
    firstName: string | null;
    lastName: string | null;
    email: string;
    phone: string | null;
    photoFileId: number | null;
    position: string | null;
    team: { id: number; name: string } | null;
    domain: string | null;
    /** A super admin's pay is always a monthly salary. */
    role?: string;
    status?: string;
};

/**
 * Editing a profile (the prototype's P.EditProfile): anyone their own name, phone and photo; with
 * employee:manage someone's position and team too, and with employee:pay_manage their pay from a date on.
 * A super admin also changes sign-in addresses: someone's, or their own with their password.
 */
export default function EditProfileModal({ person, self, onClose }: { person: ProfilePerson; self: boolean; onClose: () => void }) {
    const permissions = usePermissions();
    const today = companyToday();
    const manages = !self && permissions.has(P.EMPLOYEE_MANAGE);
    const pays = !self && permissions.has(P.EMPLOYEE_PAY_MANAGE);
    const teams = useTeams(person.domain ?? "", manages && !!person.domain).data ?? [];
    const history = usePayHistory(person.id, pays);
    const terms = currentPay(history.data, today);
    const updateMine = useUpdateMyProfile();
    const updateEmployee = useUpdateEmployee(person.id);
    const setPhoto = useSetPhoto(self ? "me" : person.id);
    const changePay = useChangePay(person.id);
    const changeEmail = useChangeEmail(person.id);
    const changeMyEmail = useChangeMyEmail();
    const emailCall = self ? changeMyEmail : changeEmail;
    const fileRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState(`${person.firstName ?? ""} ${person.lastName ?? ""}`.trim());
    const [phone, setPhone] = useState(person.phone ?? "");
    const [photo, setPhotoId] = useState<number | null>(person.photoFileId);
    const [uploading, setUploading] = useState(false);
    const [position, setPosition] = useState(person.position ?? "");
    const [teamId, setTeamId] = useState(person.team ? String(person.team.id) : "");
    const changesEmail = permissions.isSuperAdmin && person.status !== "deactivated";
    const [email, setEmail] = useState(person.email);
    const [password, setPassword] = useState("");
    const emailChanged = changesEmail && email.trim().toLowerCase() !== person.email.toLowerCase();
    // pay, once its history has loaded
    const [pay, setPay] = useState<{ basis: "hourly" | "monthly"; amount: number; currency: string } | null>(null);
    const [from, setFrom] = useState(today);
    const salaried = person.role === "super_admin";
    if (pays && pay == null && history.data) setPay({ basis: salaried ? "monthly" : terms?.basis ?? "hourly", amount: terms?.amount ?? 0, currency: terms?.currency ?? "USD" });
    // someone with no pay yet (an invited admin) keeps none until an amount is typed
    const payChanged = !!pay && (terms ? pay.basis !== terms.basis || pay.currency !== terms.currency || Math.abs(pay.amount - terms.amount) > 0.004 : pay.amount > 0);
    const errors = useFormErrors();
    const nameError = !name.trim() && "Enter the full name.";
    const positionError = manages && !position.trim() && "Enter their position.";
    const payError = payChanged && !((pay?.amount ?? 0) > 0) && "Enter the new pay.";
    const emailError = emailChanged && !isEmail(email) && "Enter an email like name@company.com.";
    const passwordError = self && emailChanged && !password && "Enter your password to change your sign-in address.";
    // what the API says about the address or the password is shown next to that field
    const refused = emailCall.error ? toApiError(emailCall.error) : null;
    const refusedEmail = refused && (refused.fieldErrors.email ?? (refused.status === 409 || refused.code === "email_unchanged" ? refused.message : undefined));
    const refusedPassword = refused?.fieldErrors.currentPassword;
    const busy = updateMine.isPending || updateEmployee.isPending || setPhoto.isPending || changePay.isPending || emailCall.isPending || uploading;
    const error = (refusedEmail || refusedPassword ? null : emailCall.error) ?? updateMine.error ?? updateEmployee.error ?? setPhoto.error ?? changePay.error;

    async function pick(f: File) {
        setUploading(true);
        try {
            setPhotoId((await uploadFile(f)).id);
        } catch (e) {
            toast({ text: "The photo wasn't uploaded", sub: errorMessage(e), icon: "alert" });
        } finally {
            setUploading(false);
        }
    }

    async function save() {
        if (busy) return;
        if (nameError || positionError || payError || emailError || passwordError) return errors.tried();
        const [firstName, ...rest] = name.trim().split(/\s+/);
        const lastName = rest.join(" ");
        const newEmail = email.trim().toLowerCase();
        try {
            if (emailChanged) {
                if (self) await changeMyEmail.mutateAsync({ email: newEmail, currentPassword: password });
                else await changeEmail.mutateAsync({ email: newEmail });
            }
            if (self) await updateMine.mutateAsync({ firstName, lastName, phone: phone.trim() || null });
            // someone who may only change pay (employee:pay_manage) doesn't send the rest, which needs employee:manage
            else if (manages) await updateEmployee.mutateAsync({ firstName, lastName, phone: phone.trim() || null, position: position.trim(), teamId: teamId ? +teamId : null });
            if (photo !== person.photoFileId) await setPhoto.mutateAsync(photo);
            if (payChanged && pay) await changePay.mutateAsync({ basis: pay.basis, amount: pay.amount, currency: pay.currency, effectiveFrom: from });
            const emailNote = !emailChanged ? null
                : self ? `You now sign in with ${newEmail} - your other devices were signed out`
                    : person.status === "invited" ? `Their invitation was sent again, to ${newEmail}`
                        : `They now sign in with ${newEmail} - their sessions ended, and both addresses were emailed`;
            const payNote = payChanged ? `New pay applies from ${fmtDateY(from)} - earlier months are unchanged` : null;
            toast({ text: "Profile updated", icon: "checkCircle", sub: [emailNote, payNote].filter(Boolean).join(". ") || undefined });
            onClose();
        } catch {
            // the error is shown next to the buttons
        }
    }

    const first = (person.firstName ?? name).split(" ")[0];
    return (
        <Modal title={self ? "Edit your profile" : `Edit ${first}'s profile`} onClose={onClose}
            foot={
                <>
                    <div className="grow muted">
                        {error ? <span className="err"><Icon name="alert" />{errorMessage(error)}</span>
                            : self ? "Position, team and pay are set by your admin." : "Changes are recorded; pay changes apply forward only."}
                    </div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={busy} onClick={save}><Icon name="check" />Save</button>
                </>
            }>
            <div className="row" style={{ gap: 14, alignItems: "flex-start" }}>
                <div style={{ textAlign: "center", width: 96, flex: "none" }}>
                    <Avatar person={{ name: name || person.email, photoFileId: photo }} size={72} />
                    <div className="stack mt-s" style={{ gap: 4 }}>
                        <button type="button" className="btn btn-sm btn-quiet" disabled={uploading} onClick={() => fileRef.current?.click()}><Icon name="attach" />{uploading ? "Uploading…" : "Photo"}</button>
                        {photo != null && <button type="button" className="btn btn-sm btn-quiet" onClick={() => setPhotoId(null)}>Remove</button>}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) pick(f);
                    }} />
                </div>
                <div className="grow stack">
                    <div className="grid g-2">
                        <div className="field">
                            <label className="label required" htmlFor="ep-name">Full name</label>
                            <input id="ep-name" className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={errors.touch("name")} />
                            <FieldError message={errors.show("name", nameError)} />
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="ep-phone">Phone</label>
                            <input id="ep-phone" className="input" type="tel" placeholder="Optional - +961 …" value={phone} onChange={(e) => setPhone(e.target.value)} />
                        </div>
                    </div>
                    <div className="field">
                        <label className={cx("label", changesEmail && "required")} htmlFor="ep-email">Work email</label>
                        <input id="ep-email" className="input" type="email" value={email} readOnly={!changesEmail} onBlur={errors.touch("email")}
                            onChange={(e) => { setEmail(e.target.value); emailCall.reset(); }} />
                        <FieldError message={refusedEmail || errors.show("email", emailError)} />
                        <div className="hint">
                            {!changesEmail ? `${self ? "Your" : "Their"} sign-in address${permissions.isSuperAdmin ? " - reactivate them to change it." : " - only a super admin changes it."}`
                                : self ? "Your sign-in address. Changing it signs you out on your other devices, and both addresses are emailed."
                                    : person.status === "invited" ? "Their invitation goes again to a new address; the link sent to this one stops working."
                                        : "Their sign-in address. Changing it signs them out everywhere, and both addresses are emailed."}
                        </div>
                    </div>
                    {self && emailChanged && (
                        <div className="field">
                            <label className="label required" htmlFor="ep-password">Your password</label>
                            <input id="ep-password" className="input" type="password" autoComplete="current-password" value={password} onBlur={errors.touch("password")}
                                onChange={(e) => { setPassword(e.target.value); emailCall.reset(); }} />
                            <FieldError message={refusedPassword || errors.show("password", passwordError)} />
                            <div className="hint">To confirm it's you before your sign-in address changes.</div>
                        </div>
                    )}
                    {manages ? (
                        <div className="grid g-2">
                            <div className="field">
                                <label className="label required" htmlFor="ep-pos">Position</label>
                                <input id="ep-pos" className="input" value={position} onChange={(e) => setPosition(e.target.value)} onBlur={errors.touch("position")} />
                                <FieldError message={errors.show("position", positionError)} />
                            </div>
                            <div className="field">
                                <label className="label" htmlFor="ep-team">Team</label>
                                <Select id="ep-team" value={teamId} onChange={setTeamId} options={[{ value: "", label: "No team" }, ...teams.map((t) => ({ value: String(t.id), label: t.name }))]} />
                                <div className="hint">Also moves them to that team's group chat.</div>
                            </div>
                        </div>
                    ) : self && (
                        <div className="panel" style={{ background: "var(--surface-2)" }}><div className="panel-body">
                            <div className="muted" style={{ fontSize: "12.5px" }}>{[person.position, person.team?.name].filter(Boolean).join(" · ") || "No position set"}</div>
                        </div></div>
                    )}
                    {pays && pay && (
                        <div className="field">
                            <div className="spread" style={{ alignItems: "center" }}>
                                <label className="label" htmlFor="ep-pay" style={{ margin: 0 }}>Pay</label>
                                {salaried ? <span className="badge">Monthly salary</span> : (
                                    <Segmented value={pay.basis} onChange={(basis) => setPay({ ...pay, basis })} aria-label="Pay basis"
                                        options={[{ value: "hourly", label: "Per hour" }, { value: "monthly", label: "Per month" }]} />
                                )}
                            </div>
                            <div className="grid g-2 mt-s">
                                <div className="field">
                                    <AmountField id="ep-pay" value={pay.amount} currency={pay.currency} onChange={(amount) => setPay({ ...pay, amount })} onCurrency={(currency) => setPay({ ...pay, currency })} onBlur={errors.touch("pay")} />
                                    <FieldError message={errors.show("pay", payError)} />
                                    <div className="hint">
                                        {salaried ? "A super admin is paid a monthly salary, whatever hours they log."
                                            : pay.basis === "monthly"
                                            ? (pay.amount ? `= ${money.fmt(monthlyToHourly(pay.amount), pay.currency, { cents: true })} / hour at 40 paid hours a week` : "Monthly salary.")
                                            : (pay.amount ? `= ${money.fmt(pay.amount * HOURS_PER_MONTH, pay.currency)} for a full month` : "Paid per hour worked.")}
                                    </div>
                                </div>
                                <div className="field">
                                    <label className="label required" htmlFor="ep-from">Applies from</label>
                                    <DateInput id="ep-from" className="input mono" value={from} max={today} disabled={!payChanged} onChange={(v) => { if (v) setFrom(v); }} />
                                    <div className="hint">{payChanged ? "Hours before this date keep the old rate." : "Change the pay to pick a date."}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
