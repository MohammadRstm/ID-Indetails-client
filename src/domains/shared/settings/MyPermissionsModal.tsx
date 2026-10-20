import { loadFailed } from "@/api/queryState";
import { useCurrentUser } from "@/app/session/useSession";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Modal from "@/shared/components/Overlays/Modal";
import { plural } from "@/shared/format/labels";
import Icon from "@/shared/icons/Icon";
import { grouped, ROLE_LABEL } from "./permissionWords";
import { useMyPermissions, type MyPermission } from "./settingsApi";

function Row({ permission: p }: { permission: MyPermission }) {
    const removed = p.source === "removed";
    return (
        <div className="pick-row" style={{ cursor: "default", alignItems: "flex-start", opacity: removed ? 0.75 : 1 }}>
            <Icon name={removed ? "x" : "check"} />
            <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{p.description}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{p.explanation}</div>
                <div className="muted mono" style={{ fontSize: 11, marginTop: 2 }}>
                    {p.code}{p.source === "granted" ? " · given just to you" : removed ? " · your role has it, but it was taken away from you" : ""}
                </div>
            </div>
        </div>
    );
}

/**
 * What the signed-in person may do, permission by permission and what each allows; which were given just to them,
 * and which their role has but were taken away. Read-only.
 */
export default function MyPermissionsModal({ onClose }: { onClose: () => void }) {
    const me = useCurrentUser();
    const query = useMyPermissions();
    const list = query.data ?? [];
    const held = list.filter((p) => p.source !== "removed");
    const removed = list.filter((p) => p.source === "removed");
    const given = held.filter((p) => p.source === "granted").length;

    return (
        <Modal size="lg" title="Your permissions" onClose={onClose}
            sub={query.data ? `${ROLE_LABEL[me.role] ?? me.role} · ${plural(held.length, "permission")}${given ? ` · ${given} given just to you` : ""}${removed.length ? ` · ${removed.length} taken away` : ""}` : undefined}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>
                        {me.role === "super_admin" ? "A super admin holds every permission." : "Nobody changes their own permissions. Ask a super admin if one is missing."}
                    </div>
                    <button className="btn" onClick={onClose}>Close</button>
                </>
            }>
            {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="your permissions" />
                : !query.data ? <SkeletonLines lines={10} /> : (
                    <>
                        {grouped(held).map((section) => (
                            <div key={section.title} style={{ marginBottom: 12 }}>
                                <div className="u" style={{ marginBottom: 4 }}>{section.title}</div>
                                {section.groups.map((group) => (
                                    <div key={group.title} className="perm-group open">
                                        <div className="perm-group-title" style={{ padding: "6px 2px 2px" }}>{group.title}</div>
                                        {group.items.map((p) => <Row key={p.code} permission={p} />)}
                                    </div>
                                ))}
                            </div>
                        ))}
                        {removed.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                                <div className="u" style={{ marginBottom: 4 }}>Taken away from your role</div>
                                {removed.map((p) => <Row key={p.code} permission={p} />)}
                            </div>
                        )}
                    </>
                )}
        </Modal>
    );
}
