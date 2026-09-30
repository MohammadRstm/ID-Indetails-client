import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { http } from "@/api/http";
import type { Paged, Schemas } from "@/api/types";

export type InvoiceSummary = Schemas["InvoiceSummaryResponse"];
export type Invoice = Schemas["InvoiceResponse"];
export type Payment = Schemas["PaymentResponse"];

export const billingKeys = {
    invoices: (params: object) => ["invoices", "list", params] as const,
    payments: (params: object) => ["payments", "list", params] as const,
};

type ListParams = { projectId?: number; clientId?: number; domain?: string; status?: string; overdue?: boolean; page?: number; pageSize?: number };

const clean = (p: object) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/** Invoices, newest first. Needs financial:view. */
export function useInvoices(params: ListParams, enabled = true) {
    const p = clean(params);
    return useQuery({
        queryKey: billingKeys.invoices(p),
        queryFn: async () => (await http.get<Paged<InvoiceSummary>>("/invoices", { params: p })).data,
        placeholderData: keepPreviousData,
        enabled,
    });
}

/** Client payments, newest first. Needs financial:view. */
export function usePayments(params: ListParams & { includeVoided?: boolean }, enabled = true) {
    const p = clean(params);
    return useQuery({
        queryKey: billingKeys.payments(p),
        queryFn: async () => (await http.get<Paged<Payment>>("/payments", { params: p })).data,
        placeholderData: keepPreviousData,
        enabled,
    });
}
