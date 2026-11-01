import { describe, expect, it } from "vitest";
import type { Schemas } from "@/api/types";
import {
    blankRow, blankRows, CATEGORIES, COLS, costOf, CURRENCIES, entryOf, firstProblem, joinTotals, labelChoices, link, listTotals, pasteInto, problems, resolveChoice, resolveDay,
    resolveUnit, rowOf, rowUsed, serverProblems, totalsOf, withServerProblems, writeTotals, type Row,
} from "./expenseRules";

const row = (patch: Partial<Row>): Row => ({ ...blankRow(), spentOn: "2026-09-30", ...patch });

describe("an expense's cost", () => {
    it("is quantity × unit cost when both are given, otherwise the amount typed", () => {
        expect(costOf(row({ quantity: "12", unitCost: "8.5" }))).toBe(102);
        expect(costOf(row({ quantity: "12", amount: "300" }))).toBe(300);
        expect(costOf(row({}))).toBe(0);
    });

    it("keeps quantity, unit cost and amount agreeing", () => {
        expect(link(row({ quantity: "10", unitCost: "5.5" }), "unitCost").amount).toBe("55");
        // an amount typed over them sets the unit cost instead
        expect(link(row({ quantity: "3", unitCost: "5", amount: "10" }), "amount").unitCost).toBe("3.3333");
        // without both, the amount stands on its own
        expect(link(row({ quantity: "", unitCost: "5", amount: "990" }), "quantity").amount).toBe("990");
    });

    it("needs an item and a cost, and says which cell is missing", () => {
        expect(problems(row({ name: "Sand", quantity: "2", unitCost: "30" }))).toBeNull();
        expect(problems(row({ name: "Sand", amount: "60" }))).toBeNull();
        expect(problems(row({ quantity: "2" }))).toEqual({ name: "Say what the item is", unitCost: "Add a unit cost or type the amount", amount: "Add a unit cost or type the amount" });
        expect(problems(row({ name: "Sand", unitCost: "30" }))).toEqual({ quantity: "Add a quantity or type the amount", amount: "Add a quantity or type the amount" });
        expect(problems(row({ name: "Sand" }))?.amount).toBe("Type the amount, or a quantity and unit cost");
        expect(problems(row({ name: "Sand", quantity: "1.2345", unitCost: "3" }))?.quantity).toBe("At most 3 decimals");
    });

    it("says so on the cell when a number is larger than the API can keep", () => {
        expect(problems(row({ name: "Marble", quantity: "100000000000", unitCost: "1" }))?.quantity).toBe("Up to 99,999,999,999.999, with at most 3 decimals.");
        expect(problems(row({ name: "Marble", quantity: "99999999999", unitCost: "1000000" }))?.amount).toBe("Quantity × unit cost is too large");
        expect(problems(row({ name: "Marble", amount: "10000000000000" }))?.amount).toBe("Up to 9,999,999,999,999.99, with at most 2 decimals.");
    });

    it("needs the day it was spent, read as a day within the years the API takes", () => {
        const sand = { name: "Sand", amount: "60" };
        expect(problems(row({ ...sand, spentOn: "" }))?.spentOn).toBe("Say the day it was spent");
        expect(problems(row({ ...sand, spentOn: "nonsense" }))?.spentOn).toBe("Not a date - try 23/9/2026 or Sep 23");
        expect(problems(row({ ...sand, spentOn: "1999-12-31" }))?.spentOn).toBe("Between the years 2000 and 2099");
        expect(problems(row({ ...sand, spentOn: "2100-01-01" }))?.spentOn).toBe("Between the years 2000 and 2099");
        expect(problems(row({ ...sand, spentOn: "2026-02-28" }))).toBeNull();
    });

    it("names the first thing wrong in the order of the cells", () => {
        expect(firstProblem({ amount: "No amount", name: "No item" })).toBe("No item");
        expect(firstProblem({ spentOn: "No day" })).toBe("No day");
    });

    it("goes to the API without an amount when quantity and unit cost give it, and always with its day, currency, category and label", () => {
        expect(entryOf(row({ name: " Sand ", quantity: "2", unit: "tonne", unitCost: "30", amount: "60" })))
            .toEqual({
                name: "Sand", quantity: 2, unit: "tonne", unitCost: 30, amount: null, supplier: null, note: null,
                currency: "USD", spentOn: "2026-09-30", category: "materials", accountLabelId: null,
            });
        expect(entryOf(row({ name: "Crane", amount: "895000", supplier: "Clearview", currency: "LBP", spentOn: "2026-09-28", category: "equipment", accountLabelId: "3" })))
            .toEqual({
                name: "Crane", quantity: null, unit: null, unitCost: null, amount: 895000, supplier: "Clearview", note: null,
                currency: "LBP", spentOn: "2026-09-28", category: "equipment", accountLabelId: 3,
            });
        // a category it doesn't know is the default one
        expect(entryOf(row({ name: "Glass", amount: "5", category: "gifts" })).category).toBe("materials");
    });
});

describe("a row in use", () => {
    it("is one with something typed in: the day, currency, category and label start with a default", () => {
        expect(rowUsed(blankRow())).toBe(false);
        expect(rowUsed(row({ currency: "LBP", category: "fees", accountLabelId: "2" }))).toBe(false);
        expect(rowUsed(row({ supplier: "Holcim" }))).toBe(true);
        expect(rowUsed(row({ amount: "10" }))).toBe(true);
    });

    it("starts in dollars, spent today, under materials, with no label", () => {
        const blank = blankRow();
        expect(blank).toMatchObject({ currency: "USD", category: "materials", accountLabelId: "" });
        expect(blank.spentOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Set(blankRows(5).map((r) => r.key)).size).toBe(5);
    });

    it("comes from a recorded expense as its cells show it", () => {
        const recorded: Schemas["SiteExpenseResponse"] = {
            id: 12, name: "Scaffolding", quantity: null, unit: null, unitCost: null, cost: 895000, currency: "LBP", supplier: "Rentals", note: null,
            spentOn: "2026-09-28", category: "equipment", accountLabel: { id: 3, name: "Permits" },
            addedAt: "2026-09-29T07:00:00Z", addedOn: "2026-09-29", addedBy: { id: 11, name: "Tarek Salem" }, updatedAt: null, canEdit: true,
        };
        expect(rowOf(recorded)).toEqual({
            key: "expense-12", name: "Scaffolding", quantity: "", unit: "", unitCost: "", amount: "895000", currency: "LBP", supplier: "Rentals",
            spentOn: "2026-09-28", category: "equipment", accountLabelId: "3", note: "",
        });
        expect(rowOf({ ...recorded, accountLabel: null }).accountLabelId).toBe("");
    });
});

describe("the sheet", () => {
    it("takes the first unit a typed start matches, or the unit as typed", () => {
        expect(resolveUnit("ba")).toBe("bag");
        expect(resolveUnit("m")).toBe("m");
        expect(resolveUnit(" LI ")).toBe("litre");
        expect(resolveUnit("roll")).toBe("roll");
    });

    it("reads a day the way people write it, and keeps what it can't read", () => {
        expect(resolveDay("28/9/2026")).toBe("2026-09-28");
        expect(resolveDay("Sep 3 2026")).toBe("2026-09-03");
        expect(resolveDay("  later ")).toBe("later");
        expect(resolveDay("")).toBe("");
    });

    it("fills rows and columns from a block pasted from Excel, adding rows as needed", () => {
        const pasted = pasteInto(blankRows(2), 1, 0, "Sand\t2\tton\t30\r\nCement\t\t\t\t$1,200\n", COLS);
        expect(pasted).toHaveLength(12);
        expect(pasted[1]).toMatchObject({ name: "Sand", quantity: "2", unit: "tonne", unitCost: "30", amount: "60" });
        expect(pasted[2]).toMatchObject({ name: "Cement", amount: "1200" });
        // what isn't pasted keeps its default
        expect(pasted[1]).toMatchObject({ currency: "USD", category: "materials", accountLabelId: "" });
    });

    it("reads a currency, a supplier, a day, a category and a label from a pasted block", () => {
        const choices = { currency: CURRENCIES, category: CATEGORIES, accountLabelId: [{ value: "", label: "No label" }, { value: "1", label: "Concrete" }] };
        const pasted = pasteInto(blankRows(1), 0, 0, "Pump hire\t\t\t\t120000\tlbp\tRentals\t3/9/2026\tEquipment\tconcrete", COLS, choices);
        expect(pasted[0]).toMatchObject({
            name: "Pump hire", amount: "120000", currency: "LBP", supplier: "Rentals", spentOn: "2026-09-03", category: "equipment", accountLabelId: "1",
        });
    });

    it("leaves a day, currency, category or label that is empty or unknown as it was", () => {
        const choices = { currency: CURRENCIES, category: CATEGORIES };
        const [blank] = blankRows(1);
        const pasted = pasteInto([blank], 0, 0, "Sand\t2\tton\t30\t\t\t\t\tgifts\t", COLS, choices);
        expect(pasted[0]).toMatchObject({ name: "Sand", currency: "USD", spentOn: blank.spentOn, category: "materials", accountLabelId: "" });
        expect(pasteInto([blank], 0, 5, "EUR", COLS, choices)[0].currency).toBe("USD");
    });

    it("picks the option a pasted cell names, by value or label", () => {
        expect(resolveChoice(CATEGORIES, " Contractor ")).toBe("contractor");
        expect(resolveChoice(CATEGORIES, "fees")).toBe("fees");
        expect(resolveChoice(CATEGORIES, "gifts")).toBeNull();
    });
});

describe("the account label cell", () => {
    const labels = [
        { id: 1, name: "Concrete", position: 1, archived: false },
        { id: 2, name: "Finishing", position: 2, archived: false },
        { id: 4, name: "Old", position: 3, archived: true },
    ];

    it("offers no label and the labels that can still be picked", () => {
        expect(labelChoices(labels)).toEqual([{ value: "", label: "No label" }, { value: "1", label: "Concrete" }, { value: "2", label: "Finishing" }]);
        // before the labels have loaded there is only no label
        expect(labelChoices(undefined)).toEqual([{ value: "", label: "No label" }]);
    });

    it("keeps an expense's own label, even archived, for that expense only", () => {
        expect(labelChoices(labels, { id: 4, name: "Old" }).map((o) => o.label)).toEqual(["No label", "Concrete", "Finishing", "Old (archived)"]);
        // a label that is on offer is not listed twice
        expect(labelChoices(labels, { id: 2, name: "Finishing" })).toHaveLength(3);
        // not yet known to be archived while the labels load
        expect(labelChoices(undefined, { id: 4, name: "Old" }).map((o) => o.label)).toEqual(["No label", "Old"]);
    });
});

describe("what a list of expenses adds up to", () => {
    it("is a total for each currency, dollars first, and never one for both", () => {
        expect(totalsOf([
            { currency: "LBP", cost: 895000 }, { currency: "USD", cost: 100.5 }, { currency: "LBP", cost: 5000 }, { currency: "USD", cost: 0.25 },
        ])).toEqual([{ currency: "USD", total: 100.75 }, { currency: "LBP", total: 900000 }]);
        expect(totalsOf([])).toEqual([]);
    });

    it("joins two sets of totals", () => {
        expect(joinTotals([{ currency: "USD", total: 990 }], [{ currency: "LBP", total: 5 }, { currency: "USD", total: 10 }]))
            .toEqual([{ currency: "USD", total: 1000 }, { currency: "LBP", total: 5 }]);
    });

    it("comes from the API's totals with the dollars shown even when there are none", () => {
        expect(listTotals({ cost: 6726, byCurrency: [{ currency: "USD", total: 6726 }, { currency: "LBP", total: 4500000 }] }))
            .toEqual([{ currency: "USD", total: 6726 }, { currency: "LBP", total: 4500000 }]);
        expect(listTotals({ cost: 0, byCurrency: [{ currency: "LBP", total: 4500000 }] }))
            .toEqual([{ currency: "USD", total: 0 }, { currency: "LBP", total: 4500000 }]);
    });

    it("is written with each currency in its own form", () => {
        expect(writeTotals([{ currency: "USD", total: 55 }, { currency: "LBP", total: 4500000 }])).toBe("$55 + 4,500,000 LBP");
        expect(writeTotals([])).toBe("$0");
    });
});

describe("what the API refuses", () => {
    it("is put on the row and cell it names, counting only the rows that were sent", () => {
        const rows = [row({}), row({ name: "Sand", amount: "5" }), row({}), row({ name: "Glass", amount: "9" })];
        const refused = serverProblems(rows, {
            "items[0].unitCost": "Unit cost must be more than zero.", "items[1].accountLabelId": "This label is archived.", "items[5].name": "No such item.", items: "Add 1 to 100 expenses at a time.",
        });
        expect(refused).toEqual([null, { unitCost: "Unit cost must be more than zero." }, null, { accountLabelId: "This label is archived." }]);
    });

    it("comes after what the sheet found itself on the same cell", () => {
        const own = [{ amount: "Type the amount, or a quantity and unit cost" }, null, null];
        const server = [{ amount: "The API's words.", note: "Too long." }, { name: "Taken." }, null];
        expect(withServerProblems(own, server)).toEqual([
            { amount: "Type the amount, or a quantity and unit cost", note: "Too long." }, { name: "Taken." }, null,
        ]);
    });
});
