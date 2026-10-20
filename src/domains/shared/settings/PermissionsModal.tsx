import { useState, type ReactNode } from "react";
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
import { grouped, OWN_WORK, ROLE_LABEL } from "./permissionWords";
import { usePermissionCatalog, useUpdateUserPermissions, useUserPermissions } from "./settingsApi";
import { loadFailed } from "@/api/queryState";
import HelpHint from "@/domains/shared/help/HelpHint";

type Target = { id: number; name: string; domain: string | null };

/**
 * What one person may do, beyond or short of their role (permission:manage). The API keeps only the
 * differences from the role's defaults, moves someone to the other role when their permissions come to match
 * it, and never lets anyone change a super admin, themselves, or a permission they don't hold. Ticking an
 * action ticks the permission it needs to be usable (see NEEDS), and says so. Permissions come in groups
 * (permissionWords.ts): a group is ticked as a whole, or opened to tick its permissions one by one.
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
    const [open, setOpen] = useState<string[]>([]);
    const u = query.data;
    const self = person.id === me.id;
    const locked = !!u?.isLocked;
    const iAmSuper = me.role === "super_admin";

    const held = new Set(u?.permissions ?? []);
    const defaults = new Set(u?.roleDefaults ?? []);
    const overrides = new Map((u?.overrides ?? []).map((o) => [o.code, o]));
    // their business's permissions and the website's; the website's staff only the website's. Admins log no hours.
    const websiteStaff = person.domain === "website";
    const relevant = (catalog.data ?? []).filter((d) =>
        (websiteStaff ? d.domain === "website" : d.domain == null || d.domain === person.domain || d.domain === "website")
        && !(u?.role !== "employee" && OWN_WORK.includes(d.code)));
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

    /** What a permission's row says about what it needs: granted along with it, missing, or now unusable without it. */
    function noteOf(code: string): { kind: "added" | "warn"; text: string } | null {
        const on = isOn(code);
        const need = NEEDS[code as PermissionCode];
        // the actions ticked that can't be used without this one
        const stranded = on ? [] : neededBy(code).filter(isOn);
        if (added[code] && on) return { kind: "added", text: `Also grants “${nameOf(added[code])}”, which this needs to be usable.` };
        if (on && need && !isOn(need)) return { kind: "warn", text: `Needs “${nameOf(need)}” to be usable${canChange(need) ? "" : ", which you can't grant"}.` };
        if (stranded.length) return { kind: "warn", text: `Without it, ${stranded.map((c) => `“${nameOf(c)}”`).join(", ")} can't be used.` };
        return null;
    }

    /** A whole group at once. What its permissions need from other groups comes along, as when ticked one by one. */
    function toggleGroup(codes: string[], on: boolean) {
        const mine = codes.filter(canChange);
        const needs: string[] = on ? [...new Set(mine.flatMap((c) => NEEDS[c as PermissionCode] ?? []))].filter((n) => !codes.includes(n) && !isOn(n) && canChange(n)) : [];
        setWant((w) => ({ ...w, ...Object.fromEntries([...mine.map((c) => [c, on]), ...needs.map((n) => [n, true])]) }));
        setResets((r) => r.filter((c) => !mine.includes(c) && !needs.includes(c)));
        setAdded((a) => {
            const next = { ...a };
            for (const c of mine) {
                delete next[c];
                const need = NEEDS[c as PermissionCode];
                if (need && needs.includes(need)) next[c] = need;
            }
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
                                    <div className="row" style={{ gap: 0 }}>
                                        <label className="label" htmlFor="perm-reason">Reason <span className="muted">· kept with the change</span></label>
                                        <HelpHint article="manage-permissions" label="giving permissions">You can only give or take away what you hold. One permission of the other business opens that business to them, and their general permissions then apply there too.</HelpHint>
                                    </div>
                                    <input id="perm-reason" className="input" placeholder="Optional - e.g. covering invoicing while Nadia is away" value={reason} onChange={(e) => setReason(e.target.value)} />
                                </div>
                            )}
                            {grouped(relevant).map((section) => (
                                <div key={section.title} style={{ marginBottom: 12 }}>
                                    <div className="u" style={{ marginBottom: 4 }}>{section.title}</div>
                                    {section.groups.map((group) => {
                                        const codes = group.items.map((d) => d.code);
                                        const expanded = open.includes(group.title);
                                        return (
                                            <GroupRow key={group.title} title={group.title} total={codes.length}
                                                ticked={codes.filter(isOn).length} changeable={codes.some(canChange)}
                                                changed={codes.some((c) => isOn(c) !== held.has(c) || resets.includes(c))}
                                                expanded={expanded} notes={expanded ? [] : codes.flatMap((c) => noteOf(c) ?? [])}
                                                onTick={(on) => toggleGroup(codes, on)}
                                                onExpand={() => setOpen((o) => (expanded ? o.filter((t) => t !== group.title) : [...o, group.title]))}>
                                                {group.items.map((d) => {
                                                    const on = isOn(d.code);
                                                    const note = noteOf(d.code);
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
                                                                {note && <div className={note.kind === "added" ? "hint" : "err"} style={{ marginTop: 3 }}>{note.text}</div>}
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
                                            </GroupRow>
                                        );
                                    })}
                                </div>
                            ))}
                        </>
                    )}
        </Modal>
    );
}

/**
 * A group of permissions: one checkbox for all of it (a dash when only some are ticked), how many are ticked, and the
 * button that opens its permissions. Folded, it still shows what its permissions say they need.
 */
function GroupRow({ title, total, ticked, changeable, changed, expanded, notes, onTick, onExpand, children }: {
    title: string; total: number; ticked: number; changeable: boolean; changed: boolean; expanded: boolean;
    notes: { kind: "added" | "warn"; text: string }[]; onTick: (on: boolean) => void; onExpand: () => void; children: ReactNode;
}) {
    const all = ticked === total;
    return (
        <div className={cx("perm-group", expanded && "open")}>
            <div className={cx("pick-row perm-group-head", ticked > 0 && "on")}>
                <input type="checkbox" checked={all} disabled={!changeable} aria-label={title}
                    ref={(el) => { if (el) el.indeterminate = ticked > 0 && !all; }}
                    onChange={() => onTick(!all)} />
                <button type="button" className="perm-group-toggle grow" aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} ${title}`} onClick={onExpand}>
                    <span className="perm-group-title">{title}</span>
                    <span className="muted perm-group-count">{ticked} of {total}{changed ? " · changed" : ""}</span>
                    <Icon name={expanded ? "chevronUp" : "chevronDown"} />
                </button>
            </div>
            {notes.map((n) => <div key={n.text} className={n.kind === "added" ? "hint perm-group-note" : "err perm-group-note"}>{n.text}</div>)}
            {expanded && <div className="perm-group-items">{children}</div>}
        </div>
    );
}
