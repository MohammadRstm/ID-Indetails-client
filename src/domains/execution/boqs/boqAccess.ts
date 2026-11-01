import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCurrentUser } from "@/app/session/useSession";
import type { Project } from "../../shared/projects/projectsApi";
import { isSiteOpen } from "../projects/siteMoney";
import type { BoqSummary } from "./boqsApi";

/**
 * What the signed-in person may do with a site's BOQs. Internal drafts are written with boq:create (the author's own)
 * or project:pricing_manage (anyone's); client BOQs, VOs and everything about sending and agreeing them are
 * project:pricing_manage's; reading them, the price and the PDF is financial:view or project:pricing_manage. Writes
 * need the site open. The API enforces all of it: this only keeps people from trying what it would refuse.
 */
export function useBoqAccess(project: Project) {
    const permissions = usePermissions();
    const me = useCurrentUser();
    const open = isSiteOpen(project);
    const manages = permissions.has(P.PROJECT_PRICING_MANAGE);
    const writesDrafts = permissions.has(P.BOQ_CREATE);
    const ownDraft = (boq: Pick<BoqSummary, "kind" | "author">) => boq.kind === "internal" && writesDrafts && boq.author.id === me.id;
    const canWrite = (boq: Pick<BoqSummary, "kind" | "author">) => open && (manages || ownDraft(boq));

    return {
        open,
        manages,
        writesDrafts,
        /** Client BOQs, VOs and the price: what the PDF and the client's totals are made of. */
        seesPrice: manages || permissions.has(P.FINANCIAL_VIEW),
        /** Anything on the BOQ panel at all. */
        seesBoqs: manages || permissions.has(P.FINANCIAL_VIEW) || writesDrafts,
        canStartDraft: open && writesDrafts,
        canStartClient: open && manages,
        /** Change or delete: drafts only. */
        canEdit: (boq: Pick<BoqSummary, "kind" | "author" | "status">) => canWrite(boq) && boq.status === "draft",
        /** Duplicate, even an agreed one. */
        canDuplicate: canWrite,
        /** Send, agree and withdraw: client BOQs and VOs. */
        canDecide: (boq: Pick<BoqSummary, "kind">) => open && manages && boq.kind !== "internal",
        /** The PDF: client BOQs and VOs. */
        canDownload: (boq: Pick<BoqSummary, "kind">) => (manages || permissions.has(P.FINANCIAL_VIEW)) && boq.kind !== "internal",
    };
}

export type BoqAccess = ReturnType<typeof useBoqAccess>;
