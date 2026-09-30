import type { Schemas } from "@/api/types";
import { money } from "@/shared/format/money";
import { addDays, fmtDate } from "@/shared/format/time";
import type { IconName } from "@/shared/icons/icons";

export type Followup = { key: string; icon: IconName; tone: "warn" | "ok" | "info"; text: string; sub: string; projectId: number | null };

type WorkItem = Schemas["AttentionItemResponse"];
type MoneyItem = Schemas["MoneyAttentionResponse"];

const MAX = 6;

function workFollowup(a: WorkItem, i: number, today: string, targetOf: (projectId: number) => string | null | undefined): Followup | null {
    const title = a.title ?? "A project";
    const key = `${a.kind}-${a.projectId ?? i}`;
    switch (a.kind) {
        case "idle":
            return { key, icon: "alert", tone: "warn", projectId: a.projectId, text: `${title} has had no work logged in ${a.days} days`, sub: `Last entry ${fmtDate(addDays(today, -(a.days ?? 0)))}` };
        case "closeout": {
            const target = a.projectId != null ? targetOf(a.projectId) : null;
            return { key, icon: "checkCircle", tone: "ok", projectId: a.projectId, text: `${title} is at ${a.progressPct}% progress`, sub: `Target ${target ? fmtDate(target) : "-"} · ready to mark as done?` };
        }
        case "on_hold":
            return { key, icon: "pause", tone: "warn", projectId: a.projectId, text: a.days != null ? `${title} has been on hold for ${a.days} days` : `${title} is on hold`, sub: "Resume it or close it out" };
        case "not_logging": {
            const n = a.count ?? a.people?.length ?? 0;
            const names = (a.people ?? []).map((p) => p.name);
            return {
                key, icon: "people", tone: "info", projectId: null,
                text: `${n} employee${n === 1 ? " has" : "s have"} not logged work this week`,
                sub: `${names.join(", ")}${n > names.length ? ` +${n - names.length} more` : ""}`,
            };
        }
        default:
            return null;
    }
}

function moneyFollowup(m: MoneyItem): Followup {
    const key = `${m.kind}-${m.invoiceId ?? m.projectId}`;
    switch (m.kind) {
        case "overdue_invoice":
            return { key, icon: "alert", tone: "warn", projectId: m.projectId, text: `${m.invoiceNumber ?? "An invoice"} is ${m.daysOverdue} days overdue`, sub: `${money.fmt(m.amount ?? 0)} from ${m.clientName ?? "a client"}` };
        case "finished_owed":
            return { key, icon: "card", tone: "warn", projectId: m.projectId, text: `${m.projectTitle} is finished but still owed ${money.fmt(m.amount ?? 0)}`, sub: "Completion and payment are tracked separately" };
        case "no_payment":
            return { key, icon: "alert", tone: "warn", projectId: m.projectId, text: `${m.projectTitle} has no customer payment recorded`, sub: "Add one so its profit can be tracked" };
        case "cost_high":
            return { key, icon: "alert", tone: "warn", projectId: m.projectId, text: `${m.projectTitle} has used ${m.usedPct}% of its payment in cost`, sub: `${money.fmt(m.amount ?? 0)} of ${money.fmt(m.revenue ?? 0)}` };
    }
}

/**
 * The overview's "Needs attention", in the prototype's order: money that is owed (overdue invoices,
 * finished work still owed), then the work (idle, ready to close, on hold, people not logging), then client
 * work without a payment or whose cost runs high. Six at most.
 */
export function followups(work: WorkItem[], moneyItems: MoneyItem[] | undefined, today: string, targetOf: (projectId: number) => string | null | undefined): Followup[] {
    const owed = (moneyItems ?? []).filter((m) => m.kind === "overdue_invoice" || m.kind === "finished_owed").map(moneyFollowup);
    const rest = (moneyItems ?? []).filter((m) => m.kind === "no_payment" || m.kind === "cost_high").map(moneyFollowup);
    const items = work.map((a, i) => workFollowup(a, i, today, targetOf)).filter((f): f is Followup => !!f);
    return [...owed, ...items, ...rest].slice(0, MAX);
}
