import { describe, expect, it } from "vitest";
import { BOQ_NUMBER } from "@/shared/format/limits";
import { boqs } from "@/test/fixtures/boqs";
import { blankLine, draftOf, fitSigned, hasProblems, isDirty, lineChanged, percentText, problemsOf, requestOf, type Draft } from "./boqDraft";

const saved = boqs.draftB;
const good = (): Draft => draftOf(saved);
const line = (draft: Draft, over: Partial<Draft["lines"][number]>): Draft => ({ ...draft, lines: [{ ...draft.lines[0], ...over }, ...draft.lines.slice(1)] });

describe("a BOQ being typed", () => {
    it("starts from the saved BOQ, with the waste in percent", () => {
        const draft = good();
        expect(draft).toMatchObject({ title: "Lobby works, option B", reason: "", adjustment: "none", adjustmentValue: "" });
        expect(draft.lines[0]).toMatchObject({ key: "line-201", id: 201, code: "1.1", description: "Demolition", quantity: "100", waste: "5", unit: "m²", rate: "20" });
        expect(percentText(0.125)).toBe("12.5");
        expect(percentText(0.07)).toBe("7");
    });

    it("sends the percents as fractions and nothing the API works out", () => {
        const draft = { ...line(good(), { waste: "12.5" }), adjustment: "percent" as const, adjustmentValue: "-5" };
        const request = requestOf(draft, "client");
        expect(request).toMatchObject({ title: "Lobby works, option B", reason: null, adjustmentType: "percent", adjustmentValue: -0.05 });
        expect(request.lines![0]).toEqual({ id: 201, code: "1.1", description: "Demolition", quantity: 100, wasteRate: 0.125, unit: "m²", rate: 20 });
        // no final quantity, line total, subtotal or total is ever sent
        expect(Object.keys(request.lines![0]).sort()).toEqual(["code", "description", "id", "quantity", "rate", "unit", "wasteRate"]);
        expect(Object.keys(request).sort()).toEqual(["adjustmentType", "adjustmentValue", "lines", "reason", "title"]);

        expect(requestOf({ ...good(), adjustment: "total", adjustmentValue: "16000" }, "client")).toMatchObject({ adjustmentType: "total", adjustmentValue: 16000 });
        expect(requestOf(good(), "client")).toMatchObject({ adjustmentType: "none", adjustmentValue: null });
    });

    it("keeps the reason of a VO, and sends none for the others", () => {
        expect(requestOf(draftOf(boqs.vo), "vo").reason).toBe("Fence along the north side");
        expect(requestOf({ ...good(), reason: "left over" }, "client").reason).toBeNull();
    });

    it("sends a blank code or unit as none, a blank waste as 0 and a new line without an id", () => {
        const blank = { ...blankLine(), description: " Paint ", quantity: "3", rate: "4.5", waste: "" };
        const [sent] = requestOf({ ...good(), lines: [blank] }, "client").lines!;
        expect(sent).toEqual({ id: null, code: null, description: "Paint", quantity: 3, wasteRate: 0, unit: null, rate: 4.5 });
    });

    it("knows when it differs from the saved BOQ, and when only the typing does", () => {
        expect(isDirty(good(), saved)).toBe(false);
        // the same number typed another way is no change
        expect(isDirty(line(good(), { quantity: "100.00", waste: "5.0" }), saved)).toBe(false);
        expect(isDirty(line(good(), { quantity: "101" }), saved)).toBe(true);
        expect(isDirty({ ...good(), title: "Another" }, saved)).toBe(true);
        expect(isDirty({ ...good(), adjustment: "percent", adjustmentValue: "5" }, saved)).toBe(true);
        expect(isDirty({ ...good(), lines: [...good().lines, blankLine()] }, saved)).toBe(true);
        expect(isDirty({ ...good(), lines: good().lines.slice(1) }, saved)).toBe(true);
        expect(isDirty({ ...good(), lines: [...good().lines].reverse() }, saved)).toBe(true);
    });

    it("knows which lines changed since the last save, as only they lose their computed cells", () => {
        const [first, second] = good().lines;
        expect(lineChanged(first, saved.lines[0])).toBe(false);
        expect(lineChanged({ ...first, quantity: "200" }, saved.lines[0])).toBe(true);
        expect(lineChanged({ ...first, waste: "6" }, saved.lines[0])).toBe(true);
        expect(lineChanged({ ...first, rate: "" }, saved.lines[0])).toBe(true);
        expect(lineChanged({ ...first, description: "Demolition " }, saved.lines[0])).toBe(false);
        // a line never saved has nothing worked out yet; a moved one still has
        expect(lineChanged(blankLine(), undefined)).toBe(true);
        expect(lineChanged(second, saved.lines[1])).toBe(false);
    });
});

describe("what is wrong with a BOQ, as the API would refuse it", () => {
    it("finds nothing in a good one", () => {
        expect(hasProblems(problemsOf(good(), "client"))).toBe(false);
        expect(hasProblems(problemsOf(draftOf(boqs.vo), "vo"))).toBe(false);
    });

    it("needs a title of at most 120 characters, and a VO a reason of at most 500", () => {
        expect(problemsOf({ ...good(), title: "  " }, "client").title).toBe("Give it a title.");
        expect(problemsOf({ ...good(), title: "t".repeat(120) }, "client").title).toBeUndefined();
        expect(problemsOf({ ...good(), title: "t".repeat(121) }, "client").title).toBe("At most 120 characters.");
        expect(problemsOf({ ...draftOf(boqs.vo), reason: "" }, "vo").reason).toBe("Say why the variation is needed.");
        expect(problemsOf({ ...draftOf(boqs.vo), reason: "r".repeat(501) }, "vo").reason).toBe("At most 500 characters.");
        // only a VO has a reason
        expect(problemsOf({ ...good(), reason: "" }, "client").reason).toBeUndefined();
    });

    it("limits a line's code, description and unit, and wants a description, a quantity and a rate", () => {
        const key = good().lines[0].key;
        const of = (over: Partial<Draft["lines"][number]>) => problemsOf(line(good(), over), "client").line[key] ?? {};
        expect(of({ code: "c".repeat(21) }).code).toBe("At most 20 characters.");
        expect(of({ code: "c".repeat(20) }).code).toBeUndefined();
        expect(of({ unit: "u".repeat(21) }).unit).toBe("At most 20 characters.");
        expect(of({ description: " " }).description).toBe("Describe the work.");
        expect(of({ description: "d".repeat(501) }).description).toBe("At most 500 characters.");
        expect(of({ description: "d".repeat(500) }).description).toBeUndefined();
        expect(of({ quantity: "" }).quantity).toBe("Enter a quantity.");
        expect(of({ rate: "" }).rate).toBe("Enter a rate.");
        expect(of({ rate: "-" }).rate).toBe("Enter a rate.");
    });

    it("keeps a quantity from below 0 and the waste between 0% and 100%", () => {
        const key = good().lines[0].key;
        const of = (over: Partial<Draft["lines"][number]>) => problemsOf(line(good(), over), "client").line[key] ?? {};
        expect(of({ quantity: "0" }).quantity).toBeUndefined();
        expect(of({ quantity: "-1" }).quantity).toBe("The quantity can't be negative.");
        expect(of({ waste: "0" }).waste).toBeUndefined();
        expect(of({ waste: "100" }).waste).toBeUndefined();
        expect(of({ waste: "100.5" }).waste).toBe("The waste is between 0% and 100%.");
        expect(of({ waste: "" }).waste).toBeUndefined();
    });

    it("allows a negative rate only on a VO", () => {
        const key = good().lines[0].key;
        expect(problemsOf(line(good(), { rate: "-5" }), "client").line[key]?.rate).toBe("Only a VO can have a negative rate.");
        expect(problemsOf(line(good(), { rate: "-5" }), "internal").line[key]?.rate).toBe("Only a VO can have a negative rate.");
        const vo = draftOf(boqs.vo);
        expect(problemsOf(line(vo, { rate: "-5" }), "vo").line[vo.lines[0].key]).toBeUndefined();
    });

    it("limits the adjustment: a percentage from -99% to 100%, a total of 0 or more (below 0 only for a VO)", () => {
        const adjust = (adjustment: Draft["adjustment"], adjustmentValue: string, kind: "client" | "vo" = "client") =>
            problemsOf({ ...good(), adjustment, adjustmentValue }, kind).adjustmentValue;
        expect(adjust("none", "")).toBeUndefined();
        expect(adjust("percent", "")).toBe("Enter the percentage.");
        expect(adjust("percent", "-99")).toBeUndefined();
        expect(adjust("percent", "100")).toBeUndefined();
        expect(adjust("percent", "-99.5")).toBe("The adjustment is between -99% and 100%.");
        expect(adjust("percent", "101")).toBe("The adjustment is between -99% and 100%.");
        expect(adjust("total", "")).toBe("Enter the new total.");
        expect(adjust("total", "0")).toBeUndefined();
        expect(adjust("total", "-1")).toBe("The new total can't be negative.");
        expect(adjust("total", "-1", "vo")).toBeUndefined();
    });

    it("takes at most 1,000 lines", () => {
        const lines = (n: number) => Array.from({ length: n }, () => ({ ...blankLine(), description: "x", quantity: "1", rate: "1" }));
        expect(problemsOf({ ...good(), lines: lines(1000) }, "client").lines).toBeUndefined();
        expect(problemsOf({ ...good(), lines: lines(1001) }, "client").lines).toBe("At most 1,000 lines.");
    });
});

describe("a number typed into a BOQ field", () => {
    it("keeps to its digits and decimals, and to one leading minus where one is allowed", () => {
        expect(fitSigned("12.5", BOQ_NUMBER, "12.", true)).toBe("12.5");
        expect(fitSigned("-12.5", BOQ_NUMBER, "-12.", true)).toBe("-12.5");
        expect(fitSigned("-12.5", BOQ_NUMBER, "12.", false)).toBe("12.5");
        expect(fitSigned("--5", BOQ_NUMBER, "-", true)).toBe("-5");
        expect(fitSigned("-", BOQ_NUMBER, "", true)).toBe("-");
        expect(fitSigned("1.23456", BOQ_NUMBER, "1.2345", true)).toBeNull();
        expect(fitSigned("12345678901", BOQ_NUMBER, "1234567890", true)).toBeNull();
        // taking digits away is always allowed
        expect(fitSigned("1.234", BOQ_NUMBER, "1.23456", true)).toBe("1.234");
    });
});
