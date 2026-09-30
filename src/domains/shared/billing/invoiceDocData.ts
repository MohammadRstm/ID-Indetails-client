/** What the document shows: an invoice from the API, or a draft being written. */
export type DocInvoice = {
    /** Null until it is issued. */
    number: string | null;
    lines: { description: string; amount: number }[];
    total: number;
    paid: number;
    /** What is still due; the total until something is received. */
    balance: number;
    notes: string | null;
    termsDays: number;
    issuedAt: string | null;
    dueOn: string | null;
    voided: boolean;
    billToName: string;
    billToContact: string | null;
    projectTitle: string;
};

/** Which part the last edit changed, so the preview can light it up. */
export type DocFlash = { key: string | null; n: number };

/** An invoice from the API, as the document shows it. */
export function docOf(inv: {
    number: string | null; lines: { description: string; amount: number }[]; total: number; paid: number | null; balance: number | null;
    notes: string | null; termsDays: number; issuedAt: string | null; dueOn: string | null; voidedAt: string | null;
    billToName: string | null; billToContact: string | null; client: { displayName: string }; project: { title: string };
}): DocInvoice {
    return {
        number: inv.number, lines: inv.lines, total: inv.total, paid: inv.paid ?? 0, balance: inv.balance ?? inv.total,
        notes: inv.notes, termsDays: inv.termsDays, issuedAt: inv.issuedAt, dueOn: inv.dueOn, voided: inv.voidedAt != null,
        billToName: inv.billToName ?? inv.client.displayName, billToContact: inv.billToContact, projectTitle: inv.project.title,
    };
}

/** The client's main email, or their phone when they have no email: what the invoice is addressed to. */
export function billToContactOf(contacts: { kind: string; value: string; isPrimary: boolean }[] | undefined): string | null {
    const list = contacts ?? [];
    const pick = (kind: string) => list.find((c) => c.kind === kind && c.isPrimary) ?? list.find((c) => c.kind === kind);
    return (pick("email") ?? pick("phone"))?.value ?? null;
}
