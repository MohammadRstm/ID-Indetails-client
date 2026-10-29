import { toApiError } from "@/api/errors";
import { plural } from "@/shared/format/labels";
import type { BoqDeliveryChannel, BoqKind, BoqList, BoqSummary } from "./boqsApi";

export const KIND_LABEL: Record<BoqKind, string> = { internal: "Internal draft", client: "Client BOQ", vo: "VO" };

/** How a delivery reads after "last": "emailed Oct 3". */
export const SENT: Record<BoqDeliveryChannel, string> = { whatsapp: "WhatsApp", email: "emailed", download: "saved as PDF" };

/** The API's refusals about BOQs, in words for the person who pressed the button. */
const REFUSALS: Record<string, string> = {
    boq_locked: "An agreed BOQ can't be changed or deleted. Withdraw its agreement first.",
    boq_already_agreed: "Another client BOQ is already agreed on this site. Withdraw its agreement first to agree this one.",
    boq_not_agreed_yet: "A VO can only be made or agreed once the client BOQ is agreed.",
    boq_has_agreed_vos: "This client BOQ can't be withdrawn while a VO is agreed. Withdraw the agreed VOs first.",
    boq_empty: "This BOQ has no lines. Add some and save before sending or agreeing it.",
    boq_internal: "An internal draft is never sent or agreed. Make a client BOQ from it instead.",
    boq_negative_rate: "Only a VO can have a negative rate.",
    boq_execution_only: "BOQs belong to Execution sites that have a client.",
    email_delivery_failed: "The email couldn't be sent, so nothing was recorded as sent. Try again, or download the PDF and send it yourself.",
};

/** The message to show for a failure of a BOQ call: ours for the codes above, the API's own for the rest. */
export function boqErrorMessage(error: unknown): string {
    const failure = toApiError(error);
    return REFUSALS[failure.code] ?? failure.message;
}

/** Every BOQ the caller can see that has lines to start from. */
export const copyableBoqs = (list: BoqList | undefined): BoqSummary[] =>
    [...(list?.client ?? []), ...(list?.vos ?? []), ...(list?.internal ?? [])].filter((b) => b.lineCount > 0);

/** "BQ-2026-001 · Lobby works · Client BOQ, 12 lines", or an internal draft by its title. */
export const sourceLabel = (b: BoqSummary) => `${b.number ?? b.title}${b.number ? ` · ${b.title}` : ""} · ${KIND_LABEL[b.kind]}, ${plural(b.lineCount, "line")}`;

/** The client BOQ the client agreed, if one is. */
export const agreedClient = (list: BoqList | undefined) => list?.client.find((b) => b.status === "agreed");

/** A client draft that wasn't chosen: another client BOQ is agreed. */
export const isNotChosen = (boq: Pick<BoqSummary, "kind" | "status">, list: BoqList | undefined) =>
    boq.kind === "client" && boq.status === "draft" && agreedClient(list) != null;

/** Why a BOQ can't be sent or agreed yet, or null. The API refuses it too (boq_empty); the button says why first. */
export function emptyBlock(boq: Pick<BoqSummary, "lineCount">): string | null {
    return boq.lineCount === 0 ? "Add lines and save first." : null;
}

/** Why a BOQ can't be agreed yet, or null. The API refuses these too; the button says why first. */
export function agreeBlock(boq: Pick<BoqSummary, "kind" | "lineCount">, list: BoqList | undefined): string | null {
    const empty = emptyBlock(boq);
    if (empty) return empty;
    if (!list) return null;
    if (boq.kind === "client" && agreedClient(list)) return "Another client BOQ is already agreed.";
    if (boq.kind === "vo" && !agreedClient(list)) return "A VO can be agreed once the client BOQ is.";
    return null;
}

/** Why an agreement can't be withdrawn yet, or null: a client BOQ stays while a VO built on it is agreed. */
export function withdrawBlock(boq: Pick<BoqSummary, "kind">, list: BoqList | undefined): string | null {
    return boq.kind === "client" && list?.vos.some((v) => v.status === "agreed") ? "Withdraw the agreed VOs first." : null;
}
