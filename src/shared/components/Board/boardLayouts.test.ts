import { describe, expect, it } from "vitest";
import { resolveOrder } from "./boardLayouts";

describe("a saved board order", () => {
    it("is the default until someone saves one", () => {
        expect(resolveOrder(null, ["a", "b", "c"])).toEqual(["a", "b", "c"]);
    });

    it("drops cards the page no longer has, and puts new ones where they are by default", () => {
        expect(resolveOrder(["c", "gone", "a"], ["a", "b", "c"])).toEqual(["c", "b", "a"]);
        expect(resolveOrder(["b", "a"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
    });
});
