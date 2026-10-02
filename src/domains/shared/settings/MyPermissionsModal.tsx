import { loadFailed } from "@/api/queryState";
import { useCurrentUser } from "@/app/session/useSession";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Modal from "@/shared/components/Overlays/Modal";
import { plural } from "@/shared/format/labels";
import Icon from "@/shared/icons/Icon";
import { byArea, ROLE_LABEL } from "./permissionWords";
import { useMyPermissions } from "./settingsApi";

/** What the signed-in person may do, permission by permission, and which were given just to them. Read-only. */
export default function MyPermissionsModal({ onClose }: { onClose: () => void }) {
    const me = useCurrentUser();
    const query = useMyPermissions();
    const list = query.data ?? [];
    const given = list.filter((p) => !p.fromRole).length;

    return (
        <Modal size="lg" title="Your permissions" onClose={onClose}
            sub={query.data ? `${ROLE_LABEL[me.role] ?? me.role} · ${plural(list.length, "permission")}${given ? ` · ${given} given just to you` : ""}` : undefined}
            foot={
                <>
                    <div className="grow muted" style={{ fontSize: 12 }}>
                        {me.role === "super_admin" ? "A super admin holds every permission." : "Nobody changes their own permissions. Ask a super admin if one is missing."}
                    </div>
                    <button className="btn" onClick={onClose}>Close</button>
                </>
            }>
            {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="your permissions" />
                : !query.data ? <SkeletonLines lines={10} /> : byArea(list).map(([area, items]) => (
                    <div key={area} style={{ marginBottom: 12 }}>
                        <div className="u" style={{ marginBottom: 4 }}>{area}</div>
                        {items.map((p) => (
                            <div key={p.code} className="pick-row" style={{ cursor: "default" }}>
                                <Icon name="check" />
                                <div className="grow" style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: "12.5px", fontWeight: 600 }}>{p.description}</div>
                                    <div className="muted mono" style={{ fontSize: 11 }}>{p.code}{p.fromRole ? "" : " · given just to you"}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                ))}
        </Modal>
    );
}
