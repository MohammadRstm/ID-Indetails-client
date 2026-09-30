import { describe, expect, it } from "vitest";
import { loadFailed } from "./queryState";

describe("a failed load", () => {
    it("is one with nothing to show; a failed refresh keeps what it had", () => {
        expect(loadFailed({ isError: true, data: undefined })).toBe(true);
        expect(loadFailed({ isError: true, data: { items: [] } })).toBe(false);
        // an empty answer is still an answer
        expect(loadFailed({ isError: true, data: null })).toBe(false);
        expect(loadFailed({ isError: false, data: undefined })).toBe(false);
    });
});
