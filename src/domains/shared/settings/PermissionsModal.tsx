import { useState } from "react";
import { errorMessage } from "@/api/errors";
import type { Schemas } from "@/api/types";
import type { PermissionCode } from "@/app/permissions/codes";
import { NEEDS, neededBy } from "@/app/permissions/needs";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCurrentUser } from "@/app/session/useSession";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import Modal from "@/shared/components/Overlays/Modal";
import { DOMAIN_LABEL } from "@/shared/format/labels";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { byArea, ROLE_LABEL } from "./permissionWords";
import { usePermissionCatalog, useUpdateUserPermissions, useUserPermissions } from "./settingsApi";
import { loadFailed } from "@/api/queryState";

type Target = { id: number; name: string; domain: string | null };

/**
 * What one person may do, beyond or short of their role (permission:manage). The API keeps only the
 * differences from the role's defaults, moves someone to the other role when their permissions come to match
 * it, and never lets anyone change a super admin, themselves, or a permission they don't hold. Ticking an
 * action ticks the permission it needs to be usable (see NEEDS), and says so.
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
    // the permissions ticked for an action that needs them, by that action
    const [added, setAdded] = useState<Record<string, string>>({});
    const u = query.data;
    const self = person.id === me.id;
    const locked = !!u?.isLocked;
    const iAmSuper = me.role === "super_admin";

    const held = new Set(u?.permissions ?? []);
    const defaults = new Set(u?.roleDefaults ?? []);
    const overrides = new Map((u?.overrides ?? []).map((o) => [o.code, o]));
    const relevant = (catalog.data ?? []).filter((d) => d.domain == null || d.domain === person.domain);
    const changes: Schemas["PermissionChangeRequest"][] = [
        ...Object.entries(want).filter(([code, on]) => on !== held.has(code)).map(([code, on]) => ({ action: on ? "grant" as const : "revoke" as const, code, reason: reason.trim() || null })),
        ...resets.filter((code) => want[code] == null).map((code) => ({ action: "reset" as const, code, reason: reason.trim() || null })),
    ];
    // anyone but a super admin may only hand out, or take back, what they hold themselves
    const canChange = (code: string) => !locked && !self && (iAmSuper || mine.has(code as PermissionCode));
    const isOn = (code: string) => want[code] ?? (resets.includes(code) ? defaults.has(code) : held.has(code));
    const nameOf = (code: string) => catalog.data?.find((d) => d.code === code)?.description ?? code;

    function toggle(code: string, on: boolean) {
        const need = NEEDS[code as PermissionCode];
        const alsoNeed = on && need && !isOn(need) && canChange(need) ? need : null;
        setWant((w) => ({ ...w, [code]: on, ...(alsoNeed ? { [alsoNeed]: true } : {}) }));
        setResets((r) => r.filter((c) => c !== code && c !== alsoNeed));
        setAdded((a) => {
            const next = { ...a };
            if (alsoNeed) next[code] = alsoNeed;
            else delete next[code];
            return next;
        });
    }

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
            {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="their permissions" />
                : loadFailed(catalog) ? <LoadError error={catalog.error} retry={() => catalog.refetch()} what="the permissions" />
                    : !u || !catalog.data ? <SkeletonLines lines={10} /> : (
                        <>
                            {locked && <div className="banner" style={{ marginBottom: 12 }}><Icon name="lock" /><div className="grow">A super admin always holds every permission; theirs can't be changed.</div></div>}
                            {self && !locked && <div className="banner" style={{ marginBottom: 12 }}><Icon name="info" /><div className="grow">You can't change your own permissions.</div></div>}
                            {!locked && !self && (
                                <div className="field" style={{ marginBottom: 12 }}>
                                    <label className="label" htmlFor="perm-reason">Reason <span className="muted">· kept with the change</span></label>
                                    <input id="perm-reason" className="input" placeholder="Optional - e.g. covering invoicing while Nadia is away" value={reason} onChange={(e) => setReason(e.target.value)} />
                                </div>
                            )}
                            {byArea(relevant).map(([area, list]) => (
                                <div key={area} style={{ marginBottom: 12 }}>
                                    <div className="u" style={{ marginBottom: 4 }}>{area}</div>
                                    {list.map((d) => {
                                        const on = isOn(d.code);
                                        const need = NEEDS[d.code as PermissionCode];
                                        // the actions ticked that can't be used without this one
                                        const stranded = on ? [] : neededBy(d.code).filter(isOn);
                                        const note = added[d.code] && on ? `Also grants “${nameOf(added[d.code])}”, which this needs to be usable.`
                                            : on && need && !isOn(need) ? `Needs “${nameOf(need)}” to be usable${canChange(need) ? "" : ", which you can't grant"}.`
                                                : stranded.length ? `Without it, ${stranded.map((c) => `“${nameOf(c)}”`).join(", ")} can't be used.` : null;
                                        const override = resets.includes(d.code) ? undefined : overrides.get(d.code);
                                        const changed = on !== held.has(d.code) || resets.includes(d.code);
                                        return (
                                            <label key={d.code} className={cx("pick-row", on && "on")} style={{ cursor: canChange(d.code) ? "pointer" : "default" }}>
                                                <input type="checkbox" checked={on} disabled={!canChange(d.code)} aria-label={d.description}
                                                    onChange={(e) => toggle(d.code, e.target.checked)} />
                                                <div className="grow" style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{d.description}</div>
                                                    {d.explanation && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{d.explanation}</div>}
                                                    <div className="muted mono" style={{ fontSize: 11 }}>
                                                        {d.code}{defaults.has(d.code) ? " · role default" : ""}
                                                        {override ? ` · ${override.effect === "grant" ? "granted" : "revoked"} by hand${override.reason ? `: ${override.reason}` : ""}` : ""}
                                                        {changed ? " · changed" : ""}
                                                    </div>
                                                    {note && <div className={added[d.code] && on ? "hint" : "err"} style={{ marginTop: 3 }}>{note}</div>}
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
