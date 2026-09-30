import type { IconName } from "@/shared/icons/icons";

export type InvoiceState = "draft" | "sent" | "partial" | "paid" | "void" | "overdue";

/** How each invoice state is shown (the prototype's HL.INVOICE_STATUS). */
export const INVOICE_STATUS: Record<InvoiceState, { label: string; cls: string; icon: IconName }> = {
    draft: { label: "Draft", cls: "inv-draft", icon: "file" },
    sent: { label: "Sent", cls: "inv-sent", icon: "send" },
    partial: { label: "Part-paid", cls: "inv-partial", icon: "circleDot" },
    paid: { label: "Paid", cls: "inv-paid", icon: "checkCircle" },
    void: { label: "Void", cls: "inv-void", icon: "x" },
    overdue: { label: "Overdue", cls: "inv-overdue", icon: "alert" },
};

export type InvoiceLike = { status: string; isOverdue?: boolean | null; dueOn?: string | null };

/** The state shown for an invoice: its status, or "overdue" when the API says it is past due. */
export function invoiceStateOf(invoice: InvoiceLike): InvoiceState {
    if (invoice.isOverdue && invoice.status !== "paid" && invoice.status !== "void") return "overdue";
    return (invoice.status as InvoiceState) in INVOICE_STATUS ? (invoice.status as InvoiceState) : "sent";
}
