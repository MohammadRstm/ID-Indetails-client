import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCurrentUser } from "@/app/session/useSession";
import { isSiteOpen } from "../projects/siteMoney";
import type { BoqSite, BoqSummary } from "./boqsApi";

type Draftish = Pick<BoqSummary, "kind" | "author" | "submittedAt">;

/**
 * What the signed-in person may do with a site's BOQs, as the API's BoqRules has it. An internal draft is private to its
 * author (boq:create) until they submit it; submitted, the site's pricing managers (project:pricing_manage) and its owner
 * read and change it, while its author only reads it, withdraws it or keeps what others changed. Only the author deletes a
 * draft, while it is private. Client BOQs, VOs and everything about sending and agreeing them are project:pricing_manage's;
 * reading them, the price and the PDF is financial:view or project:pricing_manage. Writes need the site open. The API
 * enforces all of it: this only keeps people from trying what it would refuse.
 */
export function useBoqAccess(site: BoqSite) {
    const permissions = usePermissions();
    const me = useCurrentUser();
    const open = isSiteOpen(site);
    const manages = permissions.has(P.PROJECT_PRICING_MANAGE);
    const writesDrafts = permissions.has(P.BOQ_CREATE);
    const isOwner = site.owner?.id === me.id;
    const seesPrice = manages || permissions.has(P.FINANCIAL_VIEW);
    const isInternal = (boq: Pick<BoqSummary, "kind">) => boq.kind === "internal";
    const submitted = (boq: Draftish) => isInternal(boq) && boq.submittedAt != null;
    const ownDraft = (boq: Draftish) => isInternal(boq) && writesDrafts && boq.author.id === me.id;
    const reviews = manages || isOwner;
    const canRead = (boq: Draftish) => (isInternal(boq) ? ownDraft(boq) || (submitted(boq) && reviews) : seesPrice);
    const canWrite = (boq: Draftish) => open && (isInternal(boq) ? (submitted(boq) ? reviews : ownDraft(boq)) : manages);

    return {
        open,
        manages,
        writesDrafts,
        isOwner,
        /** Whoever reads and changes the drafts engineers submit: the site's pricing managers and its owner. */
        reviews,
        /** The signed-in person wrote this draft, and may write drafts. */
        isAuthor: ownDraft,
        /** Client BOQs, VOs and the price: what the PDF and the client's totals are made of. */
        seesPrice,
        /** Anything on the BOQ panel at all. */
        seesBoqs: manages || isOwner || permissions.has(P.FINANCIAL_VIEW) || writesDrafts,
        canStartDraft: open && writesDrafts,
        canStartClient: open && manages,
        /** Change a draft: a private one is its author's, a submitted one the pricing managers' and the owner's. */
        canEdit: (boq: Draftish & Pick<BoqSummary, "status">) => canWrite(boq) && boq.status === "draft",
        /** Delete a draft: an internal one is its author's alone, while it is private; a client BOQ or VO the pricing managers'. */
        canDelete: (boq: Draftish & Pick<BoqSummary, "status">) => open && boq.status === "draft" && (isInternal(boq) ? ownDraft(boq) && !submitted(boq) : manages),
        /** Duplicate, even an agreed one. */
        canDuplicate: (boq: Draftish) => open && canRead(boq) && (isInternal(boq) ? writesDrafts : manages),
        /** The author hands a private draft to the site's pricing managers and owner. */
        canSubmit: (boq: Draftish) => open && ownDraft(boq) && !submitted(boq),
        /** The author takes a submitted draft back, and keeps what others changed in it. */
        canWithdrawSubmission: (boq: Draftish) => open && ownDraft(boq) && submitted(boq),
        canKeep: (boq: Draftish) => open && ownDraft(boq) && submitted(boq),
        /** Send, agree and withdraw: client BOQs and VOs. */
        canDecide: (boq: Pick<BoqSummary, "kind">) => open && manages && boq.kind !== "internal",
        /** The PDF: client BOQs and VOs. */
        canDownload: (boq: Pick<BoqSummary, "kind">) => seesPrice && boq.kind !== "internal",
    };
}

export type BoqAccess = ReturnType<typeof useBoqAccess>;
