import { useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCompanySettings } from "@/app/shell/shellQueries";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { FieldError } from "@/shared/components/Forms/Field";
import { Segmented, SwitchRow } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import Logo from "@/shared/components/Identity/Logo";
import Icon from "@/shared/icons/Icon";
import { setTheme, useTheme } from "@/shared/theme";
import { uploadFile } from "../../design/work/workApi";
import { companyToday, DAYS_LONG } from "@/shared/format/time";
import { useSaveCompanySettings, useSetLogo, useSetWorkingTime, useWorkingTime, type CompanySettings, type WorkingTime } from "./settingsApi";
import { daysText, nextChange } from "./workingTime";
import { notSaved, saved } from "./settingsToasts";
import { loadFailed } from "@/api/queryState";
import { useSetContactEmail } from "../../website/websiteApi";

/** An image cropped to a 128px square PNG, as the prototype did, so every logo sits the same in its tile. */
async function squareLogo(file: File): Promise<File> {
    const img = await createImageBitmap(file);
    const size = 128, side = Math.min(img.width, img.height);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    canvas.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return new File([blob!], "logo.png", { type: "image/png" });
}

// Icons draw as blocks (.ic); inline, each sits beside its word instead of above it.
const themeIcon = { width: 13, height: 13, display: "inline-block", marginRight: 6, verticalAlign: -2 } as const;

/**
 * The prototype's Settings → Company: how the app looks here, for everyone, and the company's name, logo, week
 * and time format, for whoever may change them.
 */
export default function CompanySettingsSection() {
    const manages = usePermissions().has(P.COMPANY_SETTINGS_MANAGE);
    const query = useCompanySettings();
    const settings = query.data;
    const theme = useTheme();
    return (
        <>
            <div className="panel" style={{ marginBottom: 14 }}>
                <div className="panel-head">
                    <div>
                        <div className="panel-title">Appearance</div>
                        <div className="panel-sub">Applies to this browser only. The sun / moon button in the top bar does the same.</div>
                    </div>
                </div>
                <div className="panel-body">
                    <SwitchRow title="Theme" description="Light is the default and suits bright rooms and printed screenshots. Dark is easier on the eyes in a dim room." control={
                        <Segmented value={theme} onChange={setTheme} aria-label="Theme" options={[
                            { value: "dark", label: <><Icon name="moon" style={themeIcon} />Dark</> },
                            { value: "light", label: <><Icon name="sun" style={themeIcon} />Light</> },
                        ]} />
                    } />
                </div>
            </div>
            {!manages ? null : settings ? <Company settings={settings} />
                : <div className="panel"><div className="panel-body">
                    {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the company's settings" /> : <SkeletonLines lines={6} />}
                </div></div>}
        </>
    );
}

function Company({ settings: s }: { settings: CompanySettings }) {
    const permissions = usePermissions();
    const canEdit = permissions.has(P.COMPANY_SETTINGS_MANAGE);
    const save = useSaveCompanySettings();
    const setLogo = useSetLogo();
    const fileRef = useRef<HTMLInputElement>(null);
    const [name, setName] = useState(s.name);
    const [website, setWebsite] = useState(s.website ?? "");
    const [address, setAddress] = useState(s.address ?? "");
    const [contactEmail, setContactEmail] = useState(s.contactEmail ?? "");
    const saveEmail = useSetContactEmail();
    const [uploading, setUploading] = useState(false);
    const detailsChanged = name.trim() !== s.name || website.trim() !== (s.website ?? "") || address.trim() !== (s.address ?? "");
    const emailChanged = contactEmail.trim() !== (s.contactEmail ?? "");
    const changed = detailsChanged || emailChanged;
    const emailError = contactEmail.trim() && !/^[^\s@?%,;<>]+@[^\s@?%,;<>]+\.[^\s@?%,;<>]+$/.test(contactEmail.trim()) && "Enter an email like hello@company.com.";

    const body = { name: s.name, address: s.address, website: s.website, weekStart: s.weekStart, use24HourTime: s.use24HourTime, defaultCurrency: s.defaultCurrency };
    function saveDetails() {
        if (!name.trim() || !changed || emailError) return;
        if (detailsChanged) save.mutate({ ...body, name: name.trim(), website: website.trim() || null, address: address.trim() || null }, { onSuccess: saved("Company details updated") });
        if (emailChanged) saveEmail.mutate(contactEmail.trim(), { onSuccess: saved("Contact email updated", "The website shows it, and its contact form sends to it") });
    }
    const saveRule = (patch: Partial<typeof body>) => save.mutate({ ...body, ...patch }, { onSuccess: saved(), onError: notSaved });

    async function pickLogo(file: File | undefined) {
        if (!file) return;
        setUploading(true);
        try {
            const uploaded = await uploadFile(await squareLogo(file));
            await setLogo.mutateAsync(uploaded.id);
            saved("Logo updated", "Shown in the sidebar, the launcher and the sign-in page")();
        } catch (e) {
            notSaved(e);
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="panel">
            <div className="panel-head"><div><div className="panel-title">Company</div>{!canEdit && <div className="panel-sub">Only a super admin can change these.</div>}</div></div>
            <div className="panel-body">
                <div className="grid g-2">
                    <div className="field">
                        <label className={canEdit ? "label required" : "label"} htmlFor="s-name">Company name</label>
                        <input id="s-name" className="input" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveDetails(); }} />
                        {canEdit && !name.trim() ? <FieldError message="The company needs a name." />
                            : <div className="hint">Shown on the launcher, invoices, reports and emails.</div>}
                    </div>
                    <div className="field">
                        <label className="label" htmlFor="s-website">Website</label>
                        <input id="s-website" className="input" placeholder="Optional - e.g. id-indetails.com" value={website} disabled={!canEdit}
                            onChange={(e) => setWebsite(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveDetails(); }} />
                        <div className="hint">Printed under the company name on invoices and statements, with the address.</div>
                    </div>
                </div>
                <div className="grid g-2 mt-s">
                    <div className="field">
                        <label className="label" htmlFor="s-address">Address</label>
                        <input id="s-address" className="input" placeholder="Optional - e.g. Beirut, Lebanon" value={address} disabled={!canEdit}
                            onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveDetails(); }} />
                    </div>
                    <div className="field">
                        <label className="label" htmlFor="s-contact-email">Contact email</label>
                        <input id="s-contact-email" className="input" type="email" placeholder="Optional - e.g. hello@id-indetails.com" value={contactEmail} disabled={!canEdit}
                            onChange={(e) => setContactEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveDetails(); }} />
                        {canEdit && emailError ? <FieldError message={emailError} />
                            : <div className="hint">The company website shows it, and its contact form sends to it.</div>}
                    </div>
                </div>
                {canEdit && changed && (
                    <div className="row mt-s" style={{ gap: 8, justifyContent: "flex-end" }}>
                        {(save.error ?? saveEmail.error) != null && <span className="err" style={{ fontSize: 12 }}><Icon name="alert" />{errorMessage(save.error ?? saveEmail.error)}</span>}
                        <button className="btn btn-sm" onClick={() => { setName(s.name); setWebsite(s.website ?? ""); setAddress(s.address ?? ""); setContactEmail(s.contactEmail ?? ""); }}>Cancel</button>
                        <button className="btn btn-sm btn-primary" disabled={save.isPending || saveEmail.isPending} onClick={saveDetails}>Save</button>
                    </div>
                )}
                <div className="mt">
                    <SwitchRow title="Logo" description="Used in the sidebar, the launcher and the sign-in page, and printed on invoices and statements when it is a PNG or JPEG." control={
                        <div className="row" style={{ gap: 8 }}>
                            <Logo size={34} />
                            {canEdit && (
                                <>
                                    <button className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? "Uploading…" : "Replace"}</button>
                                    {s.logoFileId != null && (
                                        <button className="btn btn-sm btn-quiet" disabled={setLogo.isPending}
                                            onClick={() => setLogo.mutate(null, { onSuccess: saved("Logo reset"), onError: notSaved })}>Use default</button>
                                    )}
                                    <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Logo file"
                                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pickLogo(f); }} />
                                </>
                            )}
                        </div>
                    } />
                    <WorkingWeek onWeekStart={(weekStart) => weekStart !== s.weekStart && saveRule({ weekStart })} />
                    <SwitchRow title="Time format" description="Changes every timestamp in the product." control={
                        <Segmented value={s.use24HourTime ? "24" : "12"} aria-label="Time format" disabled={!canEdit || save.isPending} onChange={(v) => saveRule({ use24HourTime: v === "24" })}
                            options={[{ value: "12", label: "4:00 PM" }, { value: "24", label: "16:00" }]} />
                    } />
                </div>
            </div>
        </div>
    );
}

const MON_FRI = [1, 2, 3, 4, 5];
/** The days listed for picking: Monday first, Sunday last. */
const PICK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const same = (a: number[], b: number[]) => [...a].sort().join() === [...b].sort().join();
/** A week that works Sunday and rests Saturday starts on Sunday; any other starts on Monday. */
const weekStartOf = (days: number[]) => (days.includes(0) && !days.includes(6) ? 0 : 1);

/**
 * The company's working days: Monday to Friday, or the days ticked. They are the default working hours' days (also in
 * Settings → Time tracking), so a change is a new version from today, and the week starts where the days do.
 */
function WorkingWeek({ onWeekStart }: { onWeekStart: (weekStart: number) => void }) {
    const query = useWorkingTime();
    return (
        <SwitchRow title="Working week" description="The days everyone works, unless they have their own schedule. A change applies from today; past months keep their days."
            control={query.data ? <WeekDays wt={query.data} onWeekStart={onWeekStart} />
                : loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the working week" /> : <SkeletonLines lines={1} />} />
    );
}

function WeekDays({ wt, onWeekStart }: { wt: WorkingTime; onWeekStart: (weekStart: number) => void }) {
    const permissions = usePermissions();
    const canEdit = permissions.has(P.WORKING_TIME_MANAGE);
    const setWt = useSetWorkingTime();
    const change = nextChange(wt, companyToday());
    const current = change.latest.workDays;
    const [mode, setMode] = useState<"monfri" | "custom">(same(current, MON_FRI) ? "monfri" : "custom");
    const [days, setDays] = useState(current);
    const changed = !same(days, current);

    function save(next: number[]) {
        setWt.mutate(change.body({ workDays: [...next].sort() }), {
            onSuccess: () => { onWeekStart(weekStartOf(next)); saved("Working week saved", `${daysText(next, weekStartOf(next))} · ${change.when}`)(); },
            onError: notSaved,
        });
    }
    function pick(next: "monfri" | "custom") {
        setMode(next);
        if (next === "monfri") {
            setDays(MON_FRI);
            if (!same(current, MON_FRI)) save(MON_FRI);
        }
    }

    if (!canEdit) return <b>{daysText(current, weekStartOf(current))}</b>;
    return (
        <div className="wk-week">
            <Select className="select sm" style={{ width: 170 }} aria-label="Working week" disabled={setWt.isPending} value={mode} onChange={pick}
                options={[{ value: "monfri", label: "Monday to Friday" }, { value: "custom", label: "Custom days" }]} />
            {mode === "custom" && (
                <>
                    <div className="wk-days" role="group" aria-label="Working days">
                        {PICK_ORDER.map((d) => (
                            <label key={d} className="wk-day">
                                <input type="checkbox" checked={days.includes(d)} disabled={setWt.isPending}
                                    onChange={(e) => setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))} />
                                {DAYS_LONG[d]}
                            </label>
                        ))}
                    </div>
                    <div className="hint">Ticked days are working days; the others are days off.</div>
                    {changed && (
                        <div className="row" style={{ gap: 8, marginTop: 8 }}>
                            <button className="btn btn-sm btn-primary" disabled={!days.length || setWt.isPending} onClick={() => save(days)}>Save working days</button>
                            <button className="btn btn-sm btn-quiet" onClick={() => setDays(current)}>Cancel</button>
                            {!days.length && <span className="err">Tick at least one working day.</span>}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
