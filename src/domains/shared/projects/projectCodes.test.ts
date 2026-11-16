import { describe, expect, it } from "vitest";
import { buildingCodeError, buildingCodeOf, fullCode, projectCodeError, projectLabel, typedCode } from "./projectCodes";

describe("a project's codes", () => {
    it("suggests the initials of the name as its building code, as the API does", () => {
        expect(buildingCodeOf("Villa Kadmous")).toBe("VK");
        expect(buildingCodeOf("Mila 2 Concrete")).toBe("M2C");
        expect(buildingCodeOf("Rawda Residences, Block B")).toBe("RRBB");
        expect(buildingCodeOf("Abi-Nader villa (phase 12)")).toBe("ANVP12");
        expect(buildingCodeOf("Test(1)")).toBe("T1");
        // small words are skipped, but "A" is a block's name as often as a word
        expect(buildingCodeOf("The house of the Khoury family")).toBe("HKF");
        expect(buildingCodeOf("Beit el Hana, Block A")).toBe("BHBA");
        expect(buildingCodeOf("Élysée tower")).toBe("ET");
        expect(buildingCodeOf("Harbour Offices, floor 3, new tower, block A, east wing")).toBe("HOF3NTBAEW");
        expect(buildingCodeOf("مشروع")).toBe("X");
        expect(buildingCodeOf("")).toBe("X");
    });

    it("are typed in capitals without spaces, and say what is wrong with them", () => {
        expect(typedCode("id26 q4001")).toBe("ID26Q4001");
        expect(projectCodeError("ID26Q4001")).toBe(false);
        expect(projectCodeError("ID26Q5001")).toMatch(/^Use the form ID26Q4001/);
        expect(projectCodeError("ID26Q401")).toMatch(/^Use the form ID26Q4001/);
        expect(projectCodeError("")).toBe("Give the project its code, such as ID26Q4001.");
        expect(buildingCodeError("VK2")).toBe(false);
        expect(buildingCodeError("V-K")).toBe("Use 1 to 10 letters (A to Z) or digits.");
        expect(buildingCodeError("ABCDEFGHIJK")).toBe("Use 1 to 10 letters (A to Z) or digits.");
        expect(fullCode("ID26Q4001", "VK")).toBe("ID26Q4001-VK");
    });

    it("come first where projects are picked from a list", () => {
        expect(projectLabel({ title: "Villa Kadmous", code: "ID26Q4001-VK" })).toBe("ID26Q4001-VK · Villa Kadmous");
        expect(projectLabel({ title: "Villa Kadmous" })).toBe("Villa Kadmous");
    });
});
