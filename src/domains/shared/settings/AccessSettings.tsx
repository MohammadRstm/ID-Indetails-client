import { useState } from "react";
import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCurrentUser } from "@/app/session/useSession";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { PersonLine } from "@/shared/components/Identity/People";
import { DOMAIN_LABEL } from "@/shared/format/labels";
import { lastSeen } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import InviteModal from "../people/InviteModal";
import { personName } from "../people/peopleApi";
import PermissionsModal from "./PermissionsModal";
import { useAdmins } from "./settingsApi";
import { loadFailed } from "@/api/queryState";

type Target = { id: number; name: string; domain: string | null };

/**
 * The prototype's Settings → Admins & access: who can manage this business (and, for a super admin, both and
 * the company), with Invite admin, and each admin's permissions for whoever manages them.
 */
export default function AccessSettings({ domain }: { domain: Domain }) {
    const permissions = usePermissions();
    const me = useCurrentUser();
    const superAdmin = me.role === "super_admin";
    const admins = useAdmins(superAdmin ? null : domain);
    const [inviting, setInviting] = useState(false);
    const [editing, setEditing] = useState<Target | null>(null);
    const canInvite = permissions.has(P.EMPLOYEE_INVITE);
    const canManage = permissions.has(P.PERMISSION_MANAGE);

    return (
        <div className="panel">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Admins & access</div>
                    <div className="panel-sub">{superAdmin ? "Everyone who can manage either business, and the company." : "Who can manage this business."}</div>
                </div>
                {canInvite && <div className="panel-tools"><button className="btn btn-sm" onClick={() => setInviting(true)}><Icon name="plus" />Invite admin</button></div>}
            </div>
            {loadFailed(admins) ? <div className="panel-body"><LoadError error={admins.error} retry={() => admins.refetch()} what="the admins" /></div>
                : !admins.data ? <div className="panel-body"><SkeletonLines lines={4} /></div> : (
                    <div className="tbl-wrap">
                        <table className="tbl">
                            <thead><tr><th>Person</th><th>Access</th><th>Business</th><th>Last active</th>{canManage && <th />}</tr></thead>
                            <tbody>
                                {admins.data.map((a) => {
                                    const sup = a.role === "super_admin";
                                    const name = personName(a);
                                    return (
                                        <tr key={a.id}>
                                            <td><PersonLine person={{ id: a.id, name, photoFileId: a.photoFileId, online: a.online, position: a.position }} size={28} presence link /></td>
                                            <td>
                                                <span className={cx("badge", sup && "badge-new")}>{sup ? "Super admin" : "Admin"}</span>
                                                {a.isJoker && <span className="badge" style={{ marginLeft: 6 }} title="Holds a different set of permissions from the role's">Custom access</span>}
                                                {a.status === "invited" && <span className="badge badge-invited" style={{ marginLeft: 6 }}>Invited</span>}
                                            </td>
                                            <td className="muted">{sup ? "Both · company" : a.domain ? DOMAIN_LABEL[a.domain] ?? a.domain : "-"}</td>
                                            <td className="muted">{a.id === me.id ? "now" : a.online ? "online" : a.lastSeenAt ? lastSeen(a.lastSeenAt) : "-"}</td>
                                            {canManage && (
                                                <td className="r">
                                                    {!sup && a.id !== me.id && (
                                                        <button className="btn btn-sm btn-quiet" onClick={() => setEditing({ id: a.id, name, domain: a.domain })}>
                                                            <Icon name="shield" />Permissions
                                                        </button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            <div className="panel-foot"><span className="muted">Admins manage one business; the super admin sees both and the company. Admins don't log work of their own.</span></div>
            {inviting && <InviteModal domain={domain} initialRole="admin" onClose={() => setInviting(false)} />}
            {editing && <PermissionsModal person={editing} onClose={() => setEditing(null)} />}
        </div>
    );
}
