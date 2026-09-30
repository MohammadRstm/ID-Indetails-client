import { useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCompanySettings } from "@/app/shell/shellQueries";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { Segmented, SwitchRow } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import Logo from "@/shared/components/Identity/Logo";
import Icon from "@/shared/icons/Icon";
import { setTheme, useTheme } from "@/shared/theme";
import { uploadFile } from "../../design/work/workApi";
import { useSaveCompanySettings, useSetLogo, type CompanySettings } from "./settingsApi";
import { notSaved, saved } from "./settingsToasts";

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

/** The prototype's Settings → Company: how the app looks here, and the company's name, logo, week and time format. */
export default function CompanySettingsSection() {
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
                    <SwitchRow title="Theme" description="Dark is the default. Light suits bright rooms and printed screenshots." control={
                        <Segmented value={theme} onChange={setTheme} aria-label="Theme" options={[
                            { value: "dark", label: <><Icon name="moon" style={{ width: 13, height: 13, marginRight: 5, verticalAlign: -2 }} />Dark</> },
                            { value: "light", label: <><Icon name="sun" style={{ width: 13, height: 13, marginRight: 5, verticalAlign: -2 }} />Light</> },
                        ]} />
                    } />
                </div>
            </div>
            {settings ? <Company settings={settings} />
                : <div className="panel"><div className="panel-body">
                    {query.isError ? <LoadError error={query.error} retry={() => query.refetch()} what="the company's settings" /> : <SkeletonLines lines={6} />}
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
    const [uploading, setUploading] = useState(false);
    const changed = name.trim() !== s.name || website.trim() !== (s.website ?? "") || address.trim() !== (s.address ?? "");

    const body = { name: s.name, address: s.address, website: s.website, weekStart: s.weekStart, use24HourTime: s.use24HourTime, defaultCurrency: s.defaultCurrency };
    function saveDetails() {
        if (!name.trim() || !changed) return;
        save.mutate({ ...body, name: name.trim(), website: website.trim() || null, address: address.trim() || null }, { onSuccess: saved("Company details updated") });
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
                        <label className="label" htmlFor="s-name">Company name</label>
                        <input id="s-name" className="input" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveDetails(); }} />
                        <div className="hint">Shown on the launcher, invoices, reports and emails.</div>
                    </div>
                    <div className="field">
                        <label className="label" htmlFor="s-website">Website</label>
                        <input id="s-website" className="input" placeholder="e.g. id-indetails.com" value={website} disabled={!canEdit}
                            onChange={(e) => setWebsite(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveDetails(); }} />
                        <div className="hint">Printed under the company name on invoices and statements.</div>
                    </div>
                </div>
                <div className="field mt-s">
                    <label className="label" htmlFor="s-address">Address</label>
                    <input id="s-address" className="input" placeholder="e.g. Beirut, Lebanon" value={address} disabled={!canEdit}
                        onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveDetails(); }} />
                </div>
                {canEdit && changed && (
                    <div className="row mt-s" style={{ gap: 8, justifyContent: "flex-end" }}>
                        {save.error != null && <span className="err" style={{ fontSize: 12 }}><Icon name="alert" />{errorMessage(save.error)}</span>}
                        <button className="btn btn-sm" onClick={() => { setName(s.name); setWebsite(s.website ?? ""); setAddress(s.address ?? ""); }}>Cancel</button>
                        <button className="btn btn-sm btn-primary" disabled={!name.trim() || save.isPending} onClick={saveDetails}>Save</button>
                    </div>
                )}
                <div className="mt">
                    <SwitchRow title="Logo" description="Used in the sidebar, the launcher and the sign-in page." control={
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
                    <SwitchRow title="Working week" description="Where every week starts - weekly totals, “this week” figures and week views." control={
                        <Select className="select sm" style={{ width: 170 }} aria-label="Working week" disabled={!canEdit || save.isPending} value={String(s.weekStart)}
                            onChange={(v) => saveRule({ weekStart: +v })}
                            options={[{ value: "1", label: "Monday – Sunday" }, { value: "0", label: "Sunday – Saturday" }]} />
                    } />
                    <SwitchRow title="Time format" description="Changes every timestamp in the product." control={
                        <Segmented value={s.use24HourTime ? "24" : "12"} aria-label="Time format" disabled={!canEdit || save.isPending} onChange={(v) => saveRule({ use24HourTime: v === "24" })}
                            options={[{ value: "12", label: "4:00 PM" }, { value: "24", label: "16:00" }]} />
                    } />
                </div>
            </div>
        </div>
    );
}
