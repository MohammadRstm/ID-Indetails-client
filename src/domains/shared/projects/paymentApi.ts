import { useMutation, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Schemas } from "@/api/types";

export type PaymentChange = Schemas["ProjectPaymentChangeResponse"];

/** Why a payment changes, as long as the API keeps it (ProjectRules.MaxPaymentDescriptionLength). */
export const PAYMENT_DESCRIPTION_MAX = 500;

/** Every change of a project's agreed payment, newest first, with why it changed (financial:view). */
export function usePaymentChanges(projectId: number, enabled: boolean) {
    return useQuery({
        queryKey: [...keys.projects.detail(projectId), "payment-changes"],
        queryFn: async () => (await http.get<PaymentChange[]>(`/projects/${projectId}/payment-changes`)).data,
        enabled,
    });
}

/** A Design client project's customer payment, and why it changes (project:edit and financial:view). */
export function useSetPayment(projectId: number) {
    const invalidate = useInvalidate();
    return useMutation({
        mutationFn: async (body: Schemas["UpdateProjectPaymentRequest"]) =>
            (await http.put<Schemas["ProjectResponse"]>(`/projects/${projectId}/payment`, body)).data,
        onSuccess: () => { void invalidate(keys.projects.all, keys.finance.all, keys.dashboard.all, keys.activity.all, keys.clients.all, ["company"]); },
    });
}
