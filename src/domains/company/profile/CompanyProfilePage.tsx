import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { accessLabel } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { fullName, useCurrentUser } from "@/app/session/useSession";
import { SwitchRow } from "@/shared/components/Forms/Filters";
import Avatar from "@/shared/components/Identity/Avatar";
import { DOMAIN_LABEL, plural } from "@/shared/format/labels";
import { fmtDateY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import EditProfileModal from "../../design/people/EditProfileModal";
import MyPermissionsModal from "../../shared/settings/MyPermissionsModal";

/**
 * The signed-in person's own profile in the company area, where super admins work: who they are, what they
 * can reach, and their name, phone, photo and password. A business's people have theirs in its area; the
 * prototype had none for a super admin.
 */
export default function CompanyProfilePage() {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const me = useCurrentUser();
    const [editingNow, setEditing] = useState(false);
    // ?edit=1 opens "Edit your profile" (Proton fills it there)
    const [params, setParams] = useSearchParams();
    const editing = editingNow || params.get("edit") === "1";
    const closeEdit = () => {
        setEditing(false);
        if (params.has("edit")) { params.delete("edit"); setParams(params, { replace: true }); }
    };
    const [viewingPermissions, setViewingPermissions] = useState(false);
    const name = fullName(me);
    const access = accessLabel(permissions, me.position);

    return (
        <div className="page">
            <div className="page-head">
                <div className="row start" style={{ gap: 15, minWidth: 0 }}>
                    <Avatar person={{ name, photoFileId: me.photoFileId, online: true }} size={72} presence />
                    <div style={{ minWidth: 0 }}>
                        <h1 className="page-title">{name}</h1>
                        <div className="page-sub">{[me.position, access].filter(Boolean).join(" · ")}</div>
                        <div className="row wrap mt-s" style={{ gap: 14, fontSize: 12, color: "var(--ink-3)" }}>
                            <span className="row" style={{ gap: 6 }}><Icon name="mail" style={{ width: 14, height: 14 }} />{me.email}</span>
                            {me.phone && <span className="row" style={{ gap: 6 }}><Icon name="phone" style={{ width: 14, height: 14 }} />{me.phone}</span>}
                            {me.joinedOn && <span className="row" style={{ gap: 6 }}><Icon name="calendar" style={{ width: 14, height: 14 }} />Joined {fmtDateY(me.joinedOn)}</span>}
                        </div>
                    </div>
                </div>
                <div className="page-actions">
                    <button className="btn" onClick={() => navigate("/change-password")}><Icon name="lock" />Change password</button>
                    <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" />Edit profile</button>
                </div>
            </div>

            <div className="panel">
                <div className="panel-head"><div><div className="panel-title">Access</div><div className="panel-sub">What you can reach. Nobody changes their own access; another super admin can.</div></div></div>
                <div className="panel-body">
                    <SwitchRow title="Role" description={permissions.isSuperAdmin ? "Above both businesses: every permission in each, and the company area." : "Set by a super admin."}
                        control={<span className="badge">{access}</span>} />
                    <SwitchRow title="Areas" description="The businesses whose projects, clients and people you see, and the website if it is yours."
                        control={<span className="badge">{me.visibleDomains.map((d) => DOMAIN_LABEL[d] ?? d).join(" · ") || "None"}</span>} />
                    <SwitchRow title="Permissions" description="Everything you may do, from your role and anything set just for you."
                        control={<button className="btn btn-sm" onClick={() => setViewingPermissions(true)}><Icon name="shield" />View {plural(me.permissions.length, "permission")}</button>} />
                </div>
            </div>

            {viewingPermissions && <MyPermissionsModal onClose={() => setViewingPermissions(false)} />}
            {editing && (
                <EditProfileModal self onClose={closeEdit} person={{
                    id: me.id, firstName: me.firstName, lastName: me.lastName, email: me.email, phone: me.phone, photoFileId: me.photoFileId,
                    position: me.position, team: me.team, domain: me.domain,
                }} />
            )}
        </div>
    );
}
