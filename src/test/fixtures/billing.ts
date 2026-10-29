import { http, HttpResponse } from "msw";
import type { Paged, Schemas } from "@/api/types";
import { accountLabelsHandler } from "./accountLabels";
import clientJson from "./billing/client.json";
import domainInvoicesJson from "./billing/domainInvoices.json";
import domainPaymentsJson from "./billing/domainPayments.json";
import financeBillingJson from "./billing/financeBilling.json";
import issuedJson from "./billing/issued.json";
import issuedPaymentsJson from "./billing/issuedPayments.json";
import projectInvoicesJson from "./billing/projectInvoices.json";
import ratesJson from "./billing/rates.json";
import settingsJson from "./billing/settings.json";

/*
 * Design's billing, captured from the seeded development API as Nadia on 30 September 2026: Villa Mounir
 * interiors (project 2) has one invoice, ID-2026-003, sent and overdue, and nothing paid on it; its client,
 * Mounir Aoun, has an email and a WhatsApp number. The domain has four invoices in all.
 */

const issued = issuedJson as unknown as Schemas["InvoiceResponse"];

export const billing = {
    projectInvoices: projectInvoicesJson as unknown as Paged<Schemas["InvoiceSummaryResponse"]>,
    issued,
    /** The same invoice before it was issued. */
    draft: { ...issued, id: 90, number: null, status: "draft", issuedAt: null, dueOn: null, isOverdue: false, paid: null, balance: null, deliveries: [] } as Schemas["InvoiceResponse"],
    issuedPayments: issuedPaymentsJson as unknown as Paged<Schemas["PaymentResponse"]>,
    settings: settingsJson as unknown as Schemas["BillingSettingsResponse"],
    rates: ratesJson as unknown as Schemas["ExchangeRateResponse"][],
    financeBilling: financeBillingJson as unknown as Schemas["FinanceBillingResponse"],
    domainInvoices: domainInvoicesJson as unknown as Paged<Schemas["InvoiceSummaryResponse"]>,
    domainPayments: domainPaymentsJson as unknown as Paged<Schemas["PaymentResponse"]>,
    client: clientJson as unknown as Schemas["ClientResponse"],
};

export const billingHandlers = [
    http.get("/api/invoices", ({ request }) => {
        const q = new URL(request.url).searchParams;
        return HttpResponse.json(q.get("projectId") ? billing.projectInvoices : billing.domainInvoices);
    }),
    http.get("/api/invoices/:id", ({ params }) => HttpResponse.json(String(params.id) === String(billing.draft.id) ? billing.draft : billing.issued)),
    http.get("/api/payments", ({ request }) => {
        const q = new URL(request.url).searchParams;
        return HttpResponse.json(q.get("invoiceId") ? billing.issuedPayments : billing.domainPayments);
    }),
    http.get("/api/billing-settings/:domain", () => HttpResponse.json(billing.settings)),
    http.get("/api/exchange-rates", () => HttpResponse.json(billing.rates)),
    http.get("/api/finance/design/billing", () => HttpResponse.json(billing.financeBilling)),
    http.get("/api/clients/:id", () => HttpResponse.json(billing.client)),
    accountLabelsHandler,
];
