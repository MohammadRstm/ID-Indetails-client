/* Words the prototype uses for the API's codes, in one place. */

export const PAYMENT_METHODS: Record<string, string> = {
    bank: "Bank transfer",
    cheque: "Cheque",
    cash: "Cash",
    other: "Other",
};

export const CLIENT_LABELS = ["Client", "Key account", "Retainer", "Agency", "Lead"];

export const DOMAIN_LABEL: Record<string, string> = { design: "Design", execution: "Execution" };

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
