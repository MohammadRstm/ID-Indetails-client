import { describe, expect, it } from "vitest";
import { feedWords, type FeedEvent } from "./feedWords";

const event = (kind: string, extra: Partial<FeedEvent> = {}): FeedEvent => ({
    id: 1, kind, group: "projects", domain: "design", occurredAt: "2026-09-30T08:00:00Z", isDemo: false,
    actor: { id: 2, name: "Nadia Karam" }, project: { id: 4, name: "Beit Misk show apartment" }, client: { id: 3, name: "Hala Rizk" },
    subjectType: null, subjectId: null, amount: null, prevAmount: null, payload: null, workEntry: null,
    ...extra,
});
const names = (id: number) => ({ 3: "Sarah Haddad", 4: "Omar Fares", 9: "Yara Mansour" } as Record<number, string>)[id];
const say = (e: FeedEvent) => feedWords(e, names).text;

describe("what the activity feed says", () => {
    it("gives amounts to people who see money, and reads as well without them", () => {
        expect(say(event("revenue_changed", { amount: 12000, prevAmount: 9500 }))).toBe("changed the payment for Beit Misk show apartment from $9.5k to $12k");
        expect(say(event("revenue_changed"))).toBe("changed the payment for Beit Misk show apartment");
        expect(say(event("payment_recorded", { amount: 4000, payload: { invoiceNumber: "ID-2026-002" } }))).toBe("recorded $4k received from Hala Rizk against ID-2026-002");
        expect(say(event("payment_recorded"))).toBe("recorded a payment received from Hala Rizk on account");
        expect(say(event("progress_set", { amount: 60, prevAmount: 40 }))).toBe("set Beit Misk show apartment progress to 60% (was 40%)");
        expect(say(event("progress_set"))).toBe("updated Beit Misk show apartment's progress");
    });

    it("names the people an event is about", () => {
        expect(say(event("project_owner_set", { payload: { ownerId: 3, prevOwnerId: 4 } }))).toBe("made Sarah Haddad the owner of Beit Misk show apartment (was Omar Fares)");
        expect(say(event("pay_changed", { subjectType: "user", subjectId: 9, payload: { effectiveFrom: "2026-10-01" } }))).toBe("changed Yara Mansour's pay from Oct 1");
        expect(say(event("pay_changed", { subjectType: "user", subjectId: 99 }))).toBe("changed an employee's pay");
        expect(say(event("employee_updated", { subjectType: "user", subjectId: 2 }))).toBe("updated their profile");
    });

    it("tells a project given a client from one made internal", () => {
        expect(say(event("project_client_set", { payload: { clientId: 3, prevClientId: null } }))).toBe("Beit Misk show apartment assigned to Hala Rizk");
        expect(say(event("project_client_set", { client: null, payload: { clientId: null, prevClientId: 3 } }))).toBe("Beit Misk show apartment set as an internal project");
    });

    it("words logged work and meetings from their payload", () => {
        expect(say(event("work_entry_deleted", { payload: { minutes: 60 } }))).toBe("deleted a 1h 00m entry on Beit Misk show apartment");
        expect(say(event("meeting_created", { payload: { topic: "Client presentation", startsAt: "2026-10-03T07:00:00Z" } })))
            .toBe("scheduled a meeting on Beit Misk show apartment · Client presentation, Sat, Oct 3 at 10:00 AM");
    });

    it("says something for a kind it doesn't know", () => {
        expect(feedWords(event("something_new"), names)).toEqual({ icon: "info", text: "something new" });
    });
});
