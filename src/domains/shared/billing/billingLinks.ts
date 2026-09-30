import { useSearchParams } from "react-router";

const PARAMS = ["invoice", "edit", "send", "pay"] as const;

/**
 * Opens the billing windows through the link, so an invoice can be linked to and the back button closes it:
 * ?invoice=new (a new invoice), ?invoice=12 (one invoice), ?edit=12 (a draft), ?send=12, ?pay=1 or ?pay=12.
 */
export function useBillingLinks() {
    const [params, setParams] = useSearchParams();
    const open = (key: (typeof PARAMS)[number] | null, value?: string) => {
        for (const k of PARAMS) params.delete(k);
        if (key && value) params.set(key, value);
        setParams(params, { replace: key == null });
    };
    return {
        newInvoice: () => open("invoice", "new"),
        openInvoice: (id: number) => open("invoice", String(id)),
        editDraft: (id: number) => open("edit", String(id)),
        send: (id: number) => open("send", String(id)),
        recordPayment: (invoiceId?: number | null) => open("pay", invoiceId != null ? String(invoiceId) : "1"),
        close: () => open(null),
    };
}
