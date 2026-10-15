import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import Panel from "@/shared/components/Data/Panel";
import { Badge } from "@/shared/components/Data/Pills";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import Modal from "@/shared/components/Overlays/Modal";
import { fmtDateY, fmtTime, relDay } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../../../shared/projects/projectsApi";
import {
    useInvitePortalClient,
    usePortalClients,
    useResendPortalInvitation,
    useRevokePortalAccess,
    useRevokePortalInvitation,
    type PortalClient,
} from "./clientAccessApi";

const STATUS: Record<PortalClient["status"], { label: string; cls?: string; icon: "mail" | "checkCircle" | "clock" | "x" | "userPlus" }> = {
    not_invited: { label: "Not invited", icon: "userPlus" },
    invited: { label: "Invited", cls: "badge-invited", icon: "mail" },
    invitation_expired: { label: "Invitation expired", cls: "badge-hold", icon: "clock" },
    active: { label: "Has access", cls: "badge-active", icon: "checkCircle" },
    access_ended: { label: "Access ended", cls: "badge-archived", icon: "x" },
};

/**
 * A Design project's Client portal tab (client_access:manage): the client's email contacts, and who of them can follow
 * the project in the client portal. Invitations are one-time links valid for 24 hours; the client chooses their own
 * password. The portal's content comes in a later phase.
 */
export default function ClientPortalTab({ project }: { project: Project }) {
    const list = usePortalClients(project.id);
    const invite = useInvitePortalClient(project.id);
    const resend = useResendPortalInvitation(project.id);
    const revokeInvitation = useRevokePortalInvitation(project.id);
    const revokeAccess = useRevokePortalAccess(project.id);
    const [ending, setEnding] = useState<PortalClient | null>(null);
    const busy = invite.isPending || resend.isPending || revokeInvitation.isPending || revokeAccess.isPending;

    const failed = (text: string) => (e: unknown) => toast({ text, sub: errorMessage(e), icon: "alert" });

    if (loadFailed(list)) {
        return <div className="panel"><div className="panel-body"><LoadError error={list.error} retry={() => list.refetch()} what="the client portal access" /></div></div>;
    }
    if (!list.data) return <div className="panel"><div className="panel-body"><SkeletonLines lines={4} /></div></div>;

    const { clients, cannotInviteReason } = list.data;
    const canInvite = cannotInviteReason == null;

    return (
        <>
            <Panel
                title="Client portal access"
                sub="Invite the client's contacts to follow this project online. Each invitation is a one-time link that works for 24 hours; the client chooses their own password."
                flush
            >
                {!canInvite && (
                    <div className="banner hold" style={{ margin: 14 }}>
                        <Icon name="info" />
                        <div className="grow">{cannotInviteReason}</div>
                    </div>
                )}
                {clients.length === 0 ? (
                    <Empty art="search" title="The client has no email address"
                        text="Add an email contact to the client to invite them to the client portal." />
                ) : (
                    <ul className="pa-list">
                        {clients.map((client) => {
                            const status = STATUS[client.status];
                            return (
                                <li key={client.email} className="pa-row">
                                    <div className="pa-who">
                                        <div className="pa-email trunc">
                                            {client.name ? <b>{client.name}</b> : null}
                                            <span className={client.name ? "muted" : undefined}>{client.email}</span>
                                            {client.label && <span className="muted"> · {client.label}</span>}
                                        </div>
                                        <div className="pa-meta muted">{describe(client)}</div>
                                    </div>
                                    <Badge icon={status.icon} className={status.cls}>{status.label}</Badge>
                                    <div className="pa-actions">
                                        {canInvite && client.isContact && (client.status === "not_invited" || client.status === "access_ended") && (
                                            <button type="button" className="btn btn-sm" disabled={busy}
                                                onClick={() => invite.mutate(client.email, {
                                                    onSuccess: () => toast({ text: client.status === "access_ended" ? "Access given again" : "Invitation sent", sub: client.email, icon: "send" }),
                                                    onError: failed("The invitation wasn't sent"),
                                                })}>
                                                <Icon name="send" />{client.status === "access_ended" ? "Give access again" : "Invite"}
                                            </button>
                                        )}
                                        {canInvite && client.isContact && client.invitationId != null && (client.status === "invited" || client.status === "invitation_expired") && (
                                            <button type="button" className="btn btn-sm" disabled={busy}
                                                onClick={() => resend.mutate(client.invitationId!, {
                                                    onSuccess: () => toast({ text: "Invitation sent again", sub: "The earlier link no longer works.", icon: "send" }),
                                                    onError: failed("The invitation wasn't sent"),
                                                })}>
                                                <Icon name="refresh" />Resend
                                            </button>
                                        )}
                                        {client.status === "invited" && client.invitationId != null && (
                                            <button type="button" className="btn btn-sm btn-quiet" disabled={busy}
                                                onClick={() => revokeInvitation.mutate(client.invitationId!, {
                                                    onSuccess: () => toast({ text: "Invitation cancelled", sub: "Its link no longer works.", icon: "x" }),
                                                    onError: failed("The invitation wasn't cancelled"),
                                                })}>
                                                Cancel invitation
                                            </button>
                                        )}
                                        {client.status === "active" && client.accessId != null && (
                                            <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => setEnding(client)}>
                                                End access
                                            </button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Panel>

            {ending && (
                <Modal title="End this client's access?" sub={ending.name ?? ending.email} onClose={() => setEnding(null)}
                    foot={
                        <>
                            <div className="grow">{revokeAccess.error ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(revokeAccess.error)}</span> : null}</div>
                            <button type="button" className="btn" onClick={() => setEnding(null)}>Keep access</button>
                            <button type="button" className="btn btn-danger" disabled={revokeAccess.isPending}
                                onClick={() => revokeAccess.mutate(ending.accessId!, {
                                    onSuccess: () => { toast({ text: "Access ended", sub: ending.email, icon: "x" }); setEnding(null); },
                                })}>
                                End access
                            </button>
                        </>
                    }>
                    <p>
                        {project.title} disappears from their client portal at once. If it was their only project, they're signed out.
                        You can give them access again later.
                    </p>
                </Modal>
            )}
        </>
    );
}

function describe(client: PortalClient): string {
    if (!client.isContact) return "No longer one of the client's contacts";
    switch (client.status) {
        case "invited":
            return `Invited ${relDay(client.invitedAt!)} · the link works until ${fmtDateY(client.invitationExpiresAt!)}, ${fmtTime(client.invitationExpiresAt!)}`;
        case "invitation_expired":
            return `The invitation expired on ${fmtDateY(client.invitationExpiresAt!)}`;
        case "active":
            return client.lastSeenAt ? `Last visit ${relDay(client.lastSeenAt)}` : `Access since ${fmtDateY(client.accessGrantedAt!)}`;
        case "access_ended":
            return `Access ended on ${fmtDateY(client.accessEndedAt!)}`;
        default:
            return "Can be invited";
    }
}
