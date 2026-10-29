import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/errors";
import { boqs, summaryOf } from "@/test/fixtures/boqs";
import { agreeBlock, agreedClient, boqErrorMessage, copyableBoqs, emptyBlock, isNotChosen, sourceLabel, withdrawBlock } from "./boqRules";

const [agreed, draft] = boqs.list.client;
const [fence] = boqs.list.vos;

describe("the API's refusals about BOQs", () => {
    it("are said in words for the person, by their code", () => {
        const refusal = (code: string) => boqErrorMessage(new ApiError(422, { code, message: "The API's own words." }));
        expect(refusal("boq_locked")).toBe("An agreed BOQ can't be changed or deleted. Withdraw its agreement first.");
        expect(refusal("boq_already_agreed")).toBe("Another client BOQ is already agreed on this site. Withdraw its agreement first to agree this one.");
        expect(refusal("boq_not_agreed_yet")).toBe("A VO can only be made or agreed once the client BOQ is agreed.");
        expect(refusal("boq_has_agreed_vos")).toBe("This client BOQ can't be withdrawn while a VO is agreed. Withdraw the agreed VOs first.");
        expect(refusal("boq_empty")).toBe("This BOQ has no lines. Add some and save before sending or agreeing it.");
        expect(refusal("boq_internal")).toBe("An internal draft is never sent or agreed. Make a client BOQ from it instead.");
        expect(refusal("boq_negative_rate")).toBe("Only a VO can have a negative rate.");
        expect(refusal("boq_execution_only")).toBe("BOQs belong to Execution sites that have a client.");
        expect(boqErrorMessage(new ApiError(503, { code: "email_delivery_failed", message: "Mail is down." })))
            .toBe("The email couldn't be sent, so nothing was recorded as sent. Try again, or download the PDF and send it yourself.");
    });

    it("keep the API's own words for any other code", () => {
        expect(boqErrorMessage(new ApiError(422, { code: "project_closed", message: "The project is finished." }))).toBe("The project is finished.");
        expect(boqErrorMessage(new ApiError(0, {}))).toBe("The server can't be reached. Check your connection and try again.");
    });
});

describe("what can be done with a BOQ, from the site's list", () => {
    it("finds the agreed client BOQ, and the client drafts that were not chosen", () => {
        expect(agreedClient(boqs.list)?.number).toBe("BQ-2026-001");
        expect(agreedClient(boqs.unagreed)).toBeUndefined();
        expect(agreedClient(undefined)).toBeUndefined();
        expect(isNotChosen(draft, boqs.list)).toBe(true);
        expect(isNotChosen(agreed, boqs.list)).toBe(false);
        expect(isNotChosen(draft, boqs.unagreed)).toBe(false);
        // a VO or an internal draft is never "not chosen"
        expect(isNotChosen(fence, boqs.list)).toBe(false);
        expect(isNotChosen(boqs.list.internal[0], boqs.list)).toBe(false);
    });

    it("says why a BOQ can't be agreed yet", () => {
        expect(agreeBlock({ kind: "client", lineCount: 0 }, boqs.unagreed)).toBe("Add lines and save first.");
        expect(agreeBlock({ kind: "client", lineCount: 3 }, boqs.unagreed)).toBeNull();
        expect(agreeBlock({ kind: "client", lineCount: 3 }, boqs.list)).toBe("Another client BOQ is already agreed.");
        expect(agreeBlock({ kind: "vo", lineCount: 1 }, boqs.unagreed)).toBe("A VO can be agreed once the client BOQ is.");
        expect(agreeBlock({ kind: "vo", lineCount: 1 }, boqs.list)).toBeNull();
        // while the list is still loading the API decides
        expect(agreeBlock({ kind: "vo", lineCount: 1 }, undefined)).toBeNull();
        expect(emptyBlock({ lineCount: 0 })).toBe("Add lines and save first.");
        expect(emptyBlock({ lineCount: 1 })).toBeNull();
    });

    it("keeps a client BOQ's agreement while an agreed VO stands on it", () => {
        const withAgreedVo = { ...boqs.list, vos: [{ ...fence, status: "agreed" as const }] };
        expect(withdrawBlock({ kind: "client" }, withAgreedVo)).toBe("Withdraw the agreed VOs first.");
        expect(withdrawBlock({ kind: "client" }, boqs.list)).toBeNull();
        expect(withdrawBlock({ kind: "vo" }, withAgreedVo)).toBeNull();
    });

    it("offers the BOQs with lines to start or copy from", () => {
        expect(copyableBoqs(boqs.list).map((b) => b.id)).toEqual([31, 32, 41, 51, 52]);
        expect(copyableBoqs({ ...boqs.list, vos: [{ ...fence, lineCount: 0 }] }).map((b) => b.id)).toEqual([31, 32, 51, 52]);
        expect(copyableBoqs(undefined)).toEqual([]);
        expect(sourceLabel(agreed)).toBe("BQ-2026-001 · Lobby works · Client BOQ, 3 lines");
        expect(sourceLabel(fence)).toBe("VO-2026-001 · Fence · VO, 1 line");
        expect(sourceLabel(summaryOf(boqs.draftMine))).toBe("Karim's quantities · Internal draft, 3 lines");
    });
});
