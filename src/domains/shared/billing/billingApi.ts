import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { toApiError } from "@/api/errors";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import type { Paged, Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";

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
export function usePayments(params: ListParams & { includeVoided?: boolean; invoiceId?: number }, enabled = true) {
    const p = clean(params);
    return useQuery({
        queryKey: billingKeys.payments(p),
        queryFn: async () => (await http.get<Paged<Payment>>("/payments", { params: p })).data,
        placeholderData: keepPreviousData,
        enabled,
    });
}

export type BillingSettings = Schemas["BillingSettingsResponse"];

/** Every figure an invoice or a payment moves: the lists, the project, the domain's money, the dashboards and the feed. */
function useInvalidateBilling() {
    const invalidate = useInvalidate();
    // not awaited: a window's own onSuccess (its toast, closing it) runs at once, before the lists reload and
    // perhaps drop the row it was opened from
    return () => { void invalidate(["invoices"], ["payments"], keys.projects.all, keys.finance.all, keys.clients.all, keys.dashboard.all, keys.activity.all, ["company"]); };
}

/** One invoice with its lines, deliveries and balance (financial:view). */
export function useInvoice(id: number | null) {
    return useQuery({
        queryKey: ["invoices", "detail", id],
        queryFn: async () => (await http.get<Invoice>(`/invoices/${id}`)).data,
        enabled: id != null,
    });
}

/** A new draft on a project, or changes to one (invoice:create). */
export function useSaveInvoice(projectId: number, invoiceId: number | null) {
    const refresh = useInvalidateBilling();
    return useMutation({
        mutationFn: async (body: Schemas["SaveInvoiceRequest"]) => (invoiceId == null
            ? await http.post<Invoice>(`/projects/${projectId}/invoices`, body)
            : await http.put<Invoice>(`/invoices/${invoiceId}`, body)).data,
        onSuccess: refresh,
    });
}

export function useDiscardInvoice() {
    const refresh = useInvalidateBilling();
    return useMutation({
        mutationFn: async (id: number) => { await http.delete(`/invoices/${id}`); },
        onSuccess: refresh,
    });
}

/**
 * Sends an invoice (invoice:send): a draft is issued first, which numbers it and starts the payment clock;
 * then it is emailed by the server, or the WhatsApp share or download is recorded as a delivery.
 */
export function useSendInvoice() {
    const refresh = useInvalidateBilling();
    return useMutation({
        mutationFn: async ({ invoice, channel, to }: { invoice: Invoice; channel: Schemas["DeliveryChannel"]; to: string | null }) => {
            // a send that failed after issuing (the email bounced) left it issued: a retry only delivers it
            const current = invoice.issuedAt ? invoice : (await http.get<Invoice>(`/invoices/${invoice.id}`)).data;
            const issued = current.issuedAt ? current : (await http.post<Invoice>(`/invoices/${invoice.id}/issue`, {})).data;
            if (channel === "email") return (await http.post<Invoice>(`/invoices/${issued.id}/email`, { to })).data;
            return (await http.post<Invoice>(`/invoices/${issued.id}/deliveries`, { channel, recipient: to })).data;
        },
        // after a failure too: the invoice may have been issued before the delivery failed
        onSettled: refresh,
    });
}

export function useVoidInvoice() {
    const refresh = useInvalidateBilling();
    return useMutation({
        mutationFn: async ({ id, reason }: { id: number; reason: string }) => (await http.post<Invoice>(`/invoices/${id}/void`, { reason })).data,
        onSuccess: refresh,
    });
}

/** Money received for a project, against an invoice or on account (payment:record). */
export function useRecordPayment(projectId: number) {
    const refresh = useInvalidateBilling();
    return useMutation({
        mutationFn: async (body: Schemas["RecordPaymentRequest"]) => (await http.post<Payment>(`/projects/${projectId}/payments`, body)).data,
        onSuccess: refresh,
    });
}

/** Puts a payment received on account against one of the project's issued invoices (payment:record). */
export function useApplyPayment() {
    const refresh = useInvalidateBilling();
    return useMutation({
        mutationFn: async ({ id, invoiceId }: { id: number; invoiceId: number }) => (await http.put<Payment>(`/payments/${id}/invoice`, { invoiceId })).data,
        onSuccess: refresh,
    });
}

/** Voids a payment that was recorded in error; it stays in the register with its reason (payment:void). */
export function useVoidPayment() {
    const refresh = useInvalidateBilling();
    return useMutation({
        mutationFn: async ({ id, reason }: { id: number; reason: string }) => (await http.post<Payment>(`/payments/${id}/void`, { reason })).data,
        onSuccess: refresh,
    });
}

/** A domain's bank details, terms and footer for its invoices (billing_settings:manage or financial:view). */
export function useBillingSettings(domain: string, enabled = true) {
    return useQuery({
        queryKey: ["billing-settings", domain],
        queryFn: async () => (await http.get<BillingSettings>(`/billing-settings/${domain}`)).data,
        enabled,
    });
}

/** The API's answer for a domain whose invoicing was never set up: nothing can be issued until it is. */
export const billingSettingsMissing = (error: unknown) => error != null && toApiError(error).code === "billing_settings_missing";

/** Whether the domain's invoicing was never set up, to someone who can see its billing settings. */
export function useBillingSetupMissing(domain: string) {
    const permissions = usePermissions();
    const query = useBillingSettings(domain, !!domain && permissions.hasAny(P.BILLING_SETTINGS_MANAGE, P.FINANCIAL_VIEW));
    return billingSettingsMissing(query.error);
}

/**
 * The rate in force on a day, in units per US dollar (financial:view): the newest one set from that day or
 * before, as the API converts a payment by the day it was received.
 */
export function useRateOn(currency: string, day: string, enabled = true) {
    const rates = useQuery({
        queryKey: ["exchange-rates", currency, "all"],
        queryFn: async () => (await http.get<Schemas["ExchangeRateResponse"][]>("/exchange-rates", { params: { currency } })).data,
        enabled,
    });
    return [...(rates.data ?? [])].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).find((r) => r.effectiveFrom <= day) ?? null;
}
