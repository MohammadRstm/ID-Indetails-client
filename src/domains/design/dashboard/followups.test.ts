import { describe, expect, it } from "vitest";
import type { Schemas } from "@/api/types";
import { followups } from "./followups";

type Work = Schemas["AttentionItemResponse"];
type Money = Schemas["MoneyAttentionResponse"];

const work = (kind: Work["kind"], extra: Partial<Work> = {}): Work => ({ kind, projectId: 1, title: "Villa Mounir interiors", days: null, progressPct: null, count: null, people: null, ...extra });
const cash = (kind: Money["kind"], extra: Partial<Money> = {}): Money => ({
    kind, projectId: 2, projectTitle: "Beit Misk show apartment", invoiceId: null, invoiceNumber: null, daysOverdue: null, amount: null, revenue: null, usedPct: null, clientName: null, ...extra,
});
const TODAY = "2026-09-30";
const noTarget = () => null;

describe("the overview's follow-ups", () => {
    it("says what needs attention in the prototype's words", () => {
        const items = followups([
            work("idle", { days: 9 }),
            work("closeout", { progressPct: 94 }),
            work("on_hold", { days: 12 }),
            work("not_logging", { projectId: null, title: null, count: 5, people: [{ id: 3, name: "Sarah Haddad" }, { id: 4, name: "Omar Fares" }, { id: 5, name: "Lina Saad" }] }),
        ], [], TODAY, (id) => (id === 1 ? "2026-10-14" : null));
        expect(items.map((f) => [f.text, f.sub])).toEqual([
            ["Villa Mounir interiors has had no work logged in 9 days", "Last entry Sep 21"],
            ["Villa Mounir interiors is at 94% progress", "Target Oct 14 · ready to mark as done?"],
            ["Villa Mounir interiors has been on hold for 12 days", "Resume it or close it out"],
            ["5 employees have not logged work this week", "Sarah Haddad, Omar Fares, Lina Saad +2 more"],
        ]);
    });

    it("puts money that is owed first and client work without cover last, six at most", () => {
        const items = followups(
            [work("idle", { days: 9 }), work("on_hold", { days: 3 })],
            [
                cash("cost_high", { amount: 9000, revenue: 10000, usedPct: 90 }),
                cash("overdue_invoice", { invoiceNumber: "ID-2026-003", daysOverdue: 10, amount: 7800, clientName: "Mounir Aoun" }),
                cash("no_payment"),
                cash("finished_owed", { amount: 1200 }),
                cash("no_payment", { projectId: 3, projectTitle: "Studio Nour brand space" }),
            ],
            TODAY, noTarget);
        expect(items.map((f) => f.text)).toEqual([
            "ID-2026-003 is 10 days overdue",
            "Beit Misk show apartment is finished but still owed $1.2k",
            "Villa Mounir interiors has had no work logged in 9 days",
            "Villa Mounir interiors has been on hold for 3 days",
            "Beit Misk show apartment has used 90% of its payment in cost",
            "Beit Misk show apartment has no customer payment recorded",
        ]);
        expect(items[0].sub).toBe("$7.8k from Mounir Aoun");
    });

    it("reads without money for people who don't see it", () => {
        expect(followups([work("idle", { days: 7 })], undefined, TODAY, noTarget)).toHaveLength(1);
    });
});
