import type { AccountLabel } from "./accountLabelsApi";

export type LabelChoice = { value: string; label: string };

/**
 * What a label select can offer: no label, the labels that can still be picked, and the record's own label when it
 * has since been archived (it keeps it, but nobody can pick it for another record).
 */
export function labelChoices(labels: AccountLabel[] | undefined, own?: { id: number; name: string } | null): LabelChoice[] {
    const open = (labels ?? []).filter((l) => !l.archived).map((l) => ({ value: String(l.id), label: l.name }));
    const kept = own && !open.some((o) => o.value === String(own.id))
        ? [{ value: String(own.id), label: labels ? `${own.name} (archived)` : own.name }]
        : [];
    return [{ value: "", label: "No label" }, ...open, ...kept];
}
