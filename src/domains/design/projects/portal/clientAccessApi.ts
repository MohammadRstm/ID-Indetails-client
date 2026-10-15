import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { http } from "@/api/http";

/** Where one of the client's email contacts stands on the project's client portal. */
export type PortalClientStatus = "not_invited" | "invited" | "invitation_expired" | "active" | "access_ended";

export type PortalClient = {
    email: string;
    label: string | null;
    /** False when the address is no longer among the client's contacts: it can't be invited again. */
    isContact: boolean;
    status: PortalClientStatus;
    accountId: number | null;
    name: string | null;
    invitationId: number | null;
    invitedAt: string | null;
    invitationExpiresAt: string | null;
    accessId: number | null;
    accessGrantedAt: string | null;
    accessEndedAt: string | null;
    lastSeenAt: string | null;
};

export type PortalClients = {
    projectId: number;
    /** Why no one can be invited now (an internal or archived project, an archived client), or null. */
    cannotInviteReason: string | null;
    clients: PortalClient[];
};

const key = (projectId: number) => ["portal-access", projectId] as const;

/** The project client's contacts and their client portal access (client_access:manage, Design only). */
export function usePortalClients(projectId: number) {
    return useQuery({
        queryKey: key(projectId),
        queryFn: async () => (await http.get<PortalClients>(`/projects/${projectId}/portal/clients`)).data,
    });
}

/** Every change answers with the updated list, which replaces the cached one. */
function usePortalChange<T>(projectId: number, request: (arg: T) => Promise<PortalClients>) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: request,
        onSuccess: (list) => {
            queryClient.setQueryData(key(projectId), list);
            void queryClient.invalidateQueries({ queryKey: ["activity"] });
        },
    });
}

export function useInvitePortalClient(projectId: number) {
    return usePortalChange(projectId, async (email: string) =>
        (await http.post<PortalClients>(`/projects/${projectId}/portal/invitations`, { email })).data);
}

export function useResendPortalInvitation(projectId: number) {
    return usePortalChange(projectId, async (invitationId: number) =>
        (await http.post<PortalClients>(`/projects/${projectId}/portal/invitations/${invitationId}/resend`)).data);
}

export function useRevokePortalInvitation(projectId: number) {
    return usePortalChange(projectId, async (invitationId: number) =>
        (await http.post<PortalClients>(`/projects/${projectId}/portal/invitations/${invitationId}/revoke`)).data);
}

export function useRevokePortalAccess(projectId: number) {
    return usePortalChange(projectId, async (accessId: number) =>
        (await http.post<PortalClients>(`/projects/${projectId}/portal/access/${accessId}/revoke`)).data);
}
