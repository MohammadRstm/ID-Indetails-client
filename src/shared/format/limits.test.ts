import { describe, expect, it } from "vitest";
import { AMOUNT, fitNumber, MARKUP_PERCENT, MONTH_HOURS, QUANTITY, RATE, upTo, WORKERS } from "./limits";

describe("the largest numbers that can be typed", () => {
    it("take an amount up to 13 digits and 2 decimals, and refuse the key that goes past", () => {
        expect(fitNumber("9999999999999.99", AMOUNT)).toBe("9999999999999.99");
        expect(fitNumber("99999999999999", AMOUNT)).toBeNull();
        expect(fitNumber("10.555", AMOUNT)).toBeNull();
        expect(fitNumber("1.2.3", AMOUNT)).toBeNull();
        // leading zeros and anything that isn't a digit don't count
        expect(fitNumber("$ 0012,500.5", AMOUNT)).toBe("0012500.5");
    });

    it("keep each number within what the API allows for it", () => {
        expect(fitNumber("10000", WORKERS)).toBe("10000");
        expect(fitNumber("10001", WORKERS)).toBeNull();
        expect(fitNumber("12.", WORKERS)).toBeNull();
        expect(fitNumber("500", MARKUP_PERCENT)).toBe("500");
        expect(fitNumber("500.5", MARKUP_PERCENT)).toBeNull();
        expect(fitNumber("744", MONTH_HOURS)).toBe("744");
        expect(fitNumber("745", MONTH_HOURS)).toBeNull();
        expect(fitNumber("999999999999.123456", RATE)).toBe("999999999999.123456");
        expect(fitNumber("1000000000000", RATE)).toBeNull();
        expect(fitNumber("1.2345", QUANTITY)).toBeNull();
    });

    it("always let characters be taken away, so a number from elsewhere can be corrected", () => {
        expect(fitNumber("10.555", AMOUNT, "10.5555")).toBe("10.555");
        expect(fitNumber("10.5555", AMOUNT, "10.555")).toBeNull();
    });

    it("say how far a number goes, in words", () => {
        expect(upTo(AMOUNT)).toBe("Up to 9,999,999,999,999.99, with at most 2 decimals.");
        expect(upTo(WORKERS)).toBe("Up to 10,000.");
        expect(upTo(QUANTITY)).toBe("Up to 99,999,999,999.999, with at most 3 decimals.");
    });
});
