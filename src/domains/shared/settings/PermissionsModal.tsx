import { useState } from "react";
import { errorMessage } from "@/api/errors";
import type { Schemas } from "@/api/types";
import type { PermissionCode } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCurrentUser } from "@/app/session/useSession";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import Modal from "@/shared/components/Overlays/Modal";
import { DOMAIN_LABEL } from "@/shared/format/labels";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { usePermissionCatalog, useUpdateUserPermissions, useUserPermissions, type PermissionDefinition } from "./settingsApi";

// the part of a code before the colon, as people would call it
const AREAS: Record<string, string> = {
    project: "Projects", statement: "Statements", requirement: "Requirements", meeting: "Meetings", expense: "Expenses",
    work_entry: "Work entries", material: "Materials", labour_report: "Labour", client: "Clients", financial: "Money",
    invoice: "Invoices", payment: "Payments", billing_settings: "Billing settings", exchange_rate: "Exchange rates",
    employee: "People", permission: "Permissions", team: "Teams", activity: "Activity", report: "Reports",
    domain_settings: "Settings", company: "Company", overhead: "Company expenses", salary: "Salaries",
    company_settings: "Company settings", working_time: "Working time", schedule: "Schedules", hours: "Hours",
};
const ROLE_LABEL: Record<string, string> = { super_admin: "Super admin", admin: "Admin", employee: "Employee" };
const areaOf = (code: string) => code.split(":")[0];

type Target = { id: number; name: string; domain: string | null };

/**
 * What one person may do, beyond or short of their role (permission:manage). The API keeps only the
 * differences from the role's defaults, moves someone to the other role when their permissions come to match
 * it, and never lets anyone change a super admin, themselves, or a permission they don't hold.
 */
export default function PermissionsModal({ person, onClose }: { person: Target; onClose: () => void }) {
    const me = useCurrentUser();
    const mine = usePermissions();
    const query = useUserPermissions(person.id, true);
    const catalog = usePermissionCatalog(true);
    const update = useUpdateUserPermissions(person.id);
    const [want, setWant] = useState<Record<string, boolean>>({});
    const [resets, setResets] = useState<string[]>([]);
    const [reason, setReason] = useState("");
    const u = query.data;
    const self = person.id === me.id;
    const locked = !!u?.isLocked;
    const iAmSuper = me.role === "super_admin";

    const held = new Set(u?.permissions ?? []);
    const defaults = new Set(u?.roleDefaults ?? []);
    const overrides = new Map((u?.overrides ?? []).map((o) => [o.code, o]));
    const relevant = (catalog.data ?? []).filter((d) => d.domain == null || d.domain === person.domain);
    const groups = new Map<string, PermissionDefinition[]>();
    for (const d of relevant) groups.set(areaOf(d.code), [...(groups.get(areaOf(d.code)) ?? []), d]);
    const changes: Schemas["PermissionChangeRequest"][] = [
        ...Object.entries(want).filter(([code, on]) => on !== held.has(code)).map(([code, on]) => ({ action: on ? "grant" as const : "revoke" as const, code, reason: reason.trim() || null })),
        ...resets.filter((code) => want[code] == null).map((code) => ({ action: "reset" as const, code, reason: reason.trim() || null })),
    ];
    // anyone but a super admin may only hand out, or take back, what they hold themselves
    const canChange = (code: string) => !locked && !self && (iAmSuper || mine.has(code as PermissionCode));

    function submit() {
        if (!changes.length) return;
        update.mutate(changes, {
            onSuccess: (after) => {
                toast({
                    text: `${person.name}'s permissions updated`,
                    sub: after.previousRole ? `Now ${ROLE_LABEL[after.role] ?? after.role}: their permissions match that role's` : `${changes.length} change${changes.length === 1 ? "" : "s"} · applies straight away`,
                    icon: "shield",
                });
                onClose();
            },
        });
    }

    return (
        <Modal size="lg" title={`${person.name}'s permissions`} sub={u ? `${ROLE_LABEL[u.role] ?? u.role}${u.domain ? ` · ${DOMAIN_LABEL[u.domain] ?? u.domain}` : ""}${u.isJoker ? " · custom access" : ""}` : undefined}
            onClose={onClose}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>
                        {update.error ? <span className="err"><Icon name="alert" />{errorMessage(update.error)}</span>
                            : changes.length ? `${changes.length} change${changes.length === 1 ? "" : "s"} to save` : "Tick or untick a permission to change it."}
                    </div>
                    <button className="btn" onClick={onClose}>{locked || self ? "Close" : "Cancel"}</button>
                    {!locked && !self && <button className="btn btn-primary" disabled={!changes.length || update.isPending} onClick={submit}>{update.isPending ? "Saving…" : "Save"}</button>}
                </>
            }>
            {query.isError ? <LoadError error={query.error} retry={() => query.refetch()} what="their permissions" />
                : catalog.isError ? <LoadError error={catalog.error} retry={() => catalog.refetch()} what="the permissions" />
                    : !u || !catalog.data ? <SkeletonLines lines={10} /> : (
                        <>
                            {locked && <div className="banner" style={{ marginBottom: 12 }}><Icon name="lock" /><div className="grow">A super admin always holds every permission; theirs can't be changed.</div></div>}
                            {self && !locked && <div className="banner" style={{ marginBottom: 12 }}><Icon name="info" /><div className="grow">You can't change your own permissions.</div></div>}
                            {!locked && !self && (
                                <div className="field" style={{ marginBottom: 12 }}>
                                    <label className="label" htmlFor="perm-reason">Reason <span className="muted">· optional, kept with the change</span></label>
                                    <input id="perm-reason" className="input" placeholder="e.g. Covering invoicing while Nadia is away" value={reason} onChange={(e) => setReason(e.target.value)} />
                                </div>
                            )}
                            {[...groups.entries()].map(([area, list]) => (
                                <div key={area} style={{ marginBottom: 12 }}>
                                    <div className="u" style={{ marginBottom: 4 }}>{AREAS[area] ?? area}</div>
                                    {list.map((d) => {
                                        const on = want[d.code] ?? (resets.includes(d.code) ? defaults.has(d.code) : held.has(d.code));
                                        const override = resets.includes(d.code) ? undefined : overrides.get(d.code);
                                        const changed = on !== held.has(d.code) || resets.includes(d.code);
                                        return (
                                            <label key={d.code} className={cx("pick-row", on && "on")} style={{ cursor: canChange(d.code) ? "pointer" : "default" }}>
                                                <input type="checkbox" checked={on} disabled={!canChange(d.code)} aria-label={d.description}
                                                    onChange={(e) => { setWant((w) => ({ ...w, [d.code]: e.target.checked })); setResets((r) => r.filter((c) => c !== d.code)); }} />
                                                <div className="grow" style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{d.description}</div>
                                                    <div className="muted mono" style={{ fontSize: 11 }}>
                                                        {d.code}{defaults.has(d.code) ? " · role default" : ""}
                                                        {override ? ` · ${override.effect === "grant" ? "granted" : "revoked"} by hand${override.reason ? `: ${override.reason}` : ""}` : ""}
                                                        {changed ? " · changed" : ""}
                                                    </div>
                                                </div>
                                                {override && canChange(d.code) && (
                                                    <button type="button" className="btn btn-sm btn-quiet" onClick={(e) => {
                                                        e.preventDefault();
                                                        setWant((w) => { const next = { ...w }; delete next[d.code]; return next; });
                                                        setResets((r) => [...r, d.code]);
                                                    }}>Back to the role</button>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                            ))}
                        </>
                    )}
        </Modal>
    );
}
