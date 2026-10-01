import { useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
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
import { currentPay, HOURS_PER_MONTH, monthlyToHourly } from "../pay/payRules";
import { uploadFile } from "../work/workApi";
import { useChangePay, usePayHistory, useSetPhoto, useTeams, useUpdateEmployee, useUpdateMyProfile } from "./peopleWorkApi";

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
};

/**
 * Editing a profile (the prototype's P.EditProfile): anyone their own name, phone and photo; with
 * employee:manage someone's position and team too, and with employee:pay_manage their pay from a date on.
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
    const fileRef = useRef<HTMLInputElement>(null);

    const [name, setName] = useState(`${person.firstName ?? ""} ${person.lastName ?? ""}`.trim());
    const [phone, setPhone] = useState(person.phone ?? "");
    const [photo, setPhotoId] = useState<number | null>(person.photoFileId);
    const [uploading, setUploading] = useState(false);
    const [position, setPosition] = useState(person.position ?? "");
    const [teamId, setTeamId] = useState(person.team ? String(person.team.id) : "");
    // pay, once its history has loaded
    const [pay, setPay] = useState<{ basis: "hourly" | "monthly"; amount: number; currency: string } | null>(null);
    const [from, setFrom] = useState(today);
    if (pays && pay == null && history.data) setPay({ basis: terms?.basis ?? "hourly", amount: terms?.amount ?? 0, currency: terms?.currency ?? "USD" });
    // someone with no pay yet (an invited admin) keeps none until an amount is typed
    const payChanged = !!pay && (terms ? pay.basis !== terms.basis || pay.currency !== terms.currency || Math.abs(pay.amount - terms.amount) > 0.004 : pay.amount > 0);
    const errors = useFormErrors();
    const nameError = !name.trim() && "Enter the full name.";
    const positionError = manages && !position.trim() && "Enter their position.";
    const payError = payChanged && !((pay?.amount ?? 0) > 0) && "Enter the new pay.";
    const busy = updateMine.isPending || updateEmployee.isPending || setPhoto.isPending || changePay.isPending || uploading;
    const error = updateMine.error ?? updateEmployee.error ?? setPhoto.error ?? changePay.error;

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
        if (nameError || positionError || payError) return errors.tried();
        const [firstName, ...rest] = name.trim().split(/\s+/);
        const lastName = rest.join(" ");
        try {
            if (self) await updateMine.mutateAsync({ firstName, lastName, phone: phone.trim() || null });
            // someone who may only change pay (employee:pay_manage) doesn't send the rest, which needs employee:manage
            else if (manages) await updateEmployee.mutateAsync({ firstName, lastName, phone: phone.trim() || null, position: position.trim(), teamId: teamId ? +teamId : null });
            if (photo !== person.photoFileId) await setPhoto.mutateAsync(photo);
            if (payChanged && pay) await changePay.mutateAsync({ basis: pay.basis, amount: pay.amount, currency: pay.currency, effectiveFrom: from });
            toast({ text: "Profile updated", icon: "checkCircle", sub: payChanged ? `New pay applies from ${fmtDateY(from)} - earlier months are unchanged` : undefined });
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
                            <label className="label" htmlFor="ep-name">Full name</label>
                            <input id="ep-name" className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={errors.touch("name")} />
                            <FieldError message={errors.show("name", nameError)} />
                        </div>
                        <div className="field">
                            <label className="label" htmlFor="ep-phone">Phone</label>
                            <input id="ep-phone" className="input" type="tel" placeholder="+961 …" value={phone} onChange={(e) => setPhone(e.target.value)} />
                        </div>
                    </div>
                    <div className="field">
                        <label className="label" htmlFor="ep-email">Work email</label>
                        <input id="ep-email" className="input" value={person.email} readOnly />
                        <div className="hint">{self ? "Your" : "Their"} sign-in address - changed by the company, not here.</div>
                    </div>
                    {manages ? (
                        <div className="grid g-2">
                            <div className="field">
                                <label className="label" htmlFor="ep-pos">Position</label>
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
                                <Segmented value={pay.basis} onChange={(basis) => setPay({ ...pay, basis })} aria-label="Pay basis"
                                    options={[{ value: "hourly", label: "Per hour" }, { value: "monthly", label: "Per month" }]} />
                            </div>
                            <div className="grid g-2 mt-s">
                                <div className="field">
                                    <AmountField id="ep-pay" value={pay.amount} currency={pay.currency} onChange={(amount) => setPay({ ...pay, amount })} onCurrency={(currency) => setPay({ ...pay, currency })} onBlur={errors.touch("pay")} />
                                    <FieldError message={errors.show("pay", payError)} />
                                    <div className="hint">
                                        {pay.basis === "monthly"
                                            ? (pay.amount ? `= ${money.fmt(monthlyToHourly(pay.amount), pay.currency, { cents: true })} / hour at 40 paid hours a week` : "Monthly salary.")
                                            : (pay.amount ? `= ${money.fmt(pay.amount * HOURS_PER_MONTH, pay.currency)} for a full month` : "Paid per hour worked.")}
                                    </div>
                                </div>
                                <div className="field">
                                    <label className="label" htmlFor="ep-from">Applies from</label>
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
