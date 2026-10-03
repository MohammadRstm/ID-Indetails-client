import { describe, expect, it } from "vitest";
import { blankRow, blankRows, COLS, costOf, entryOf, link, pasteInto, problems, resolveUnit, type Row } from "./materialRules";

const row = (patch: Partial<Row>): Row => ({ ...blankRow(), ...patch });

describe("a material's cost", () => {
    it("is quantity × unit cost when both are given, otherwise the total typed", () => {
        expect(costOf(row({ quantity: "12", unitCost: "8.5" }))).toBe(102);
        expect(costOf(row({ quantity: "12", amount: "300" }))).toBe(300);
        expect(costOf(row({}))).toBe(0);
    });

    it("keeps quantity, unit cost and total agreeing", () => {
        expect(link(row({ quantity: "10", unitCost: "5.5" }), "unitCost").amount).toBe("55");
        // a total typed over them sets the unit cost instead
        expect(link(row({ quantity: "3", unitCost: "5", amount: "10" }), "amount").unitCost).toBe("3.3333");
        // without both, the total stands on its own
        expect(link(row({ quantity: "", unitCost: "5", amount: "990" }), "quantity").amount).toBe("990");
    });

    it("needs a type and a cost, and says which cell is missing", () => {
        expect(problems(row({ name: "Sand", quantity: "2", unitCost: "30" }))).toBeNull();
        expect(problems(row({ name: "Sand", amount: "60" }))).toBeNull();
        expect(problems(row({ quantity: "2" }))).toEqual({ name: "Say what type it is", unitCost: "Add a unit cost or type the total", amount: "Add a unit cost or type the total" });
        expect(problems(row({ name: "Sand" }))?.amount).toBe("Type the total, or a quantity and unit cost");
        expect(problems(row({ name: "Sand", quantity: "1.2345", unitCost: "3" }))?.quantity).toBe("At most 3 decimals");
    });

    it("says so on the cell when a number is larger than the API can keep", () => {
        expect(problems(row({ name: "Marble", quantity: "100000000000", unitCost: "1" }))?.quantity).toBe("Up to 99,999,999,999.999, with at most 3 decimals.");
        expect(problems(row({ name: "Marble", quantity: "99999999999", unitCost: "1000000" }))?.amount).toBe("Quantity × unit cost is too large");
        expect(problems(row({ name: "Marble", amount: "10000000000000" }))?.amount).toBe("Up to 9,999,999,999,999.99, with at most 2 decimals.");
        expect(problems(row({ name: "Marble", amount: "10", clientPrice: "10000000000000" }))?.clientPrice).toBe("Up to 9,999,999,999,999.99, with at most 2 decimals.");
    });

    it("goes to the API without a total when quantity and unit cost give it", () => {
        expect(entryOf(row({ name: " Sand ", quantity: "2", unit: "tonne", unitCost: "30", amount: "60" })))
            .toEqual({ name: "Sand", quantity: 2, unit: "tonne", unitCost: 30, amount: null, supplier: null, note: null });
        expect(entryOf(row({ name: "Glass", amount: "9400", supplier: "Clearview" })))
            .toEqual({ name: "Glass", quantity: null, unit: null, unitCost: null, amount: 9400, supplier: "Clearview", note: null });
    });
});

describe("the sheet", () => {
    it("takes the first unit a typed start matches, or the unit as typed", () => {
        expect(resolveUnit("ba")).toBe("bag");
        expect(resolveUnit("m")).toBe("m");
        expect(resolveUnit(" LI ")).toBe("litre");
        expect(resolveUnit("roll")).toBe("roll");
    });

    it("fills rows and columns from a block pasted from Excel, adding rows as needed", () => {
        const pasted = pasteInto(blankRows(2), 1, 0, "Sand\t2\tton\t30\r\nCement\t\t\t\t$1,200\n", COLS);
        expect(pasted).toHaveLength(12);
        expect(pasted[1]).toMatchObject({ name: "Sand", quantity: "2", unit: "tonne", unitCost: "30", amount: "60" });
        expect(pasted[2]).toMatchObject({ name: "Cement", amount: "1200" });
    });
});
