import { describe, expect, it } from "vitest";
import { P } from "@/app/permissions/codes";
import { grouped, PERMISSION_SECTIONS } from "./permissionWords";

describe("the permission groups", () => {
    it("hold every permission exactly once", () => {
        const placed = PERMISSION_SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.codes));
        expect([...placed].sort()).toEqual(Object.values(P).sort());
        expect(new Set(placed).size).toBe(placed.length);
    });

    it("leave out empty groups, keep their order, and put a code no group knows under Other", () => {
        const list = [{ code: P.WEBSITE_MANAGE }, { code: P.PROJECT_VIEW }, { code: "new:thing" }];
        expect(grouped(list).map((s) => [s.title, s.groups.map((g) => [g.title, g.items.map((i) => i.code)])])).toEqual([
            ["Projects", [["Projects", [P.PROJECT_VIEW]]]],
            ["Services", [["Website", [P.WEBSITE_MANAGE]]]],
            ["Other", [["Other", ["new:thing"]]]],
        ]);
    });
});
