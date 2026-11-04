import { useMutation, useQuery } from "@tanstack/react-query";
import { downloadFile } from "@/api/download";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type DesignVo = Schemas["DesignVoResponse"];
export type NewDesignVo = Schemas["CreateDesignVoRequest"];

export const VO_TITLE_MAX = 200;
export const VO_LINE_MAX = 500;

const vosKey = (projectId: number) => [...keys.projects.detail(projectId), "design-vos"] as const;

/** A Design project's variation orders, newest first (financial:view). */
export function useDesignVos(projectId: number) {
    return useQuery({
        queryKey: vosKey(projectId),
        queryFn: async () => (await http.get<DesignVo[]>(`/projects/${projectId}/design-vos`)).data,
    });
}

/** The hours logged outside the agreed scope since the last applied VO, or the project's start. */
export function useOutsideScope(projectId: number, enabled: boolean) {
    return useQuery({
        queryKey: [...vosKey(projectId), "outside-scope"],
        queryFn: async () => (await http.get<Schemas["OutsideScopeResponse"]>(`/projects/${projectId}/design-vos/outside-scope`)).data,
        enabled,
    });
}

/** A VO moves the price, the departments' budgets and every money figure built on them. */
function useVoChanged() {
    const invalidate = useInvalidate();
    return () => { void invalidate(keys.projects.all, keys.finance.all, keys.dashboard.all, keys.activity.all, keys.clients.all, ["company"]); };
}

/** Makes a VO: applied at once (apply), or pending until the client confirms it (financial:write). */
export function useCreateDesignVo(projectId: number) {
    const changed = useVoChanged();
    return useMutation({
        mutationFn: async (body: NewDesignVo) => (await http.post<DesignVo>(`/projects/${projectId}/design-vos`, body)).data,
        onSettled: changed,
    });
}

/** The client agreed: the pending VO joins the price. */
export function useConfirmDesignVo() {
    const changed = useVoChanged();
    return useMutation({
        mutationFn: async (id: number) => (await http.post<DesignVo>(`/design-vos/${id}/confirm`)).data,
        onSuccess: changed,
    });
}

export function useCancelDesignVo() {
    const changed = useVoChanged();
    return useMutation({
        mutationFn: async (id: number) => (await http.post<DesignVo>(`/design-vos/${id}/cancel`)).data,
        onSuccess: changed,
    });
}

/** Emails the VO with its PDF to the client; a failed email changes nothing (503 email_delivery_failed). */
export function useEmailDesignVo() {
    return useMutation({
        mutationFn: async ({ id, to }: { id: number; to: string }) => { await http.post(`/design-vos/${id}/email`, { to }); },
    });
}

/** The PDF, as the client gets it. */
export const downloadDesignVoPdf = (vo: { id: number; number: string }) => downloadFile(`/design-vos/${vo.id}/pdf`, `${vo.number.toLowerCase()}.pdf`);

/** An amount typed by hand, minus sign and cents allowed: "-1,250.5" is -1250.5; null when it isn't one. */
export function parseAmount(text: string): number | null {
    const clean = text.replace(/[\s,$]/g, "");
    if (!/^-?\d+(\.\d{1,2})?$/.test(clean)) return null;
    return Number(clean);
}
