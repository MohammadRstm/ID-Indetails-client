import type { Schemas } from "@/api/types";
import { money } from "@/shared/format/money";
import { DOMAIN_LABEL } from "@/shared/format/labels";
import { fmtDate, fmtDayDate, fmtDur, fmtH, fmtMonthY, fmtTime } from "@/shared/format/time";
import type { IconName } from "@/shared/icons/icons";

export type FeedEvent = Schemas["ActivityItemResponse"];

/** Names of people the feed mentions by id (a project's new owner, whose pay changed). */
export type NameOf = (userId: number) => string | undefined;

type Payload = Record<string, unknown>;
type Words = { icon: IconName; text: (e: FeedEvent, p: Payload, names: NameOf) => string };

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);
const project = (e: FeedEvent) => e.project?.name || "a project";
const client = (e: FeedEvent) => e.client?.name || "a client";
/** " - $1,200", or nothing when the amount is hidden (no financial:view). */
const dash = (amount: number | null, currency?: string | null) => (amount == null ? "" : ` - ${money.fmt(amount, currency ?? "USD")}`);
const quoted = (v: unknown) => (str(v) ? ` “${str(v)}”` : "");
const person = (p: Payload, names: NameOf, key: string, fallback: string) => {
    const id = num(p[key]);
    return (id != null && names(id)) || fallback;
};
const subject = (e: FeedEvent, names: NameOf) => (e.subjectId != null && names(e.subjectId)) || "an employee";
const entryLength = (p: Payload) => (num(p.minutes) != null ? `a ${fmtDur(num(p.minutes)!)} entry` : "an entry");
const from = (v: unknown) => (str(v) ? ` from ${fmtDate(str(v)!)}` : "");
/** How much of a month was excused: "7h", "3 days off", "all of September 2026". Older events only say the kind. */
const excused = (p: Payload) => {
    const month = str(p.month) ? fmtMonthY(str(p.month)!) : "the month";
    const minutes = num(p.minutes);
    const days = num(p.days);
    const amount = p.kind === "WholeMonth" ? `all of ${month}`
        : p.kind === "Days" ? `${days ? `${days} ${days === 1 ? "day" : "days"}` : "days"} off in ${month}`
            : `${minutes != null ? fmtH(minutes) : "some hours"} in ${month}`;
    return `${amount}${p.isPaid === false ? ", unpaid" : ""}`;
};
/** A company expense's name, and the details its event carries. */
const overhead = (p: Payload) => ({ name: str(p.name) ?? "a company expense", currency: str(p.currency) ?? "USD", d: (p.details ?? {}) as Payload });

/*
 * What each recorded event says, after the name of whoever did it (the prototype's EVENT_STYLE). Amounts
 * come only to people with financial:view, so every sentence reads as well without them.
 */
const WORDS: Record<string, Words> = {
    // work
    work_entry_logged: { icon: "clock", text: (e, p) => `logged ${num(p.minutes) != null ? fmtDur(num(p.minutes)!) : "work"} on ${project(e)}` },
    work_entry_updated: { icon: "edit", text: (e, p) => `edited ${entryLength(p)} on ${project(e)}` },
    work_entry_deleted: { icon: "trash", text: (e, p) => `deleted ${entryLength(p)} on ${project(e)}` },
    work_entry_restored: { icon: "refresh", text: (e, p) => `restored ${entryLength(p)} on ${project(e)}` },
    work_entry_commented: { icon: "chat", text: (e) => `commented on work on ${project(e)}` },

    // projects
    project_created: { icon: "plus", text: (e) => `created project ${project(e)}` },
    project_updated: { icon: "edit", text: (e) => `updated ${project(e)}'s details` },
    project_owner_set: {
        icon: "user",
        text: (e, p, names) => {
            const from = num(p.prevOwnerId) != null ? names(num(p.prevOwnerId)!) : undefined;
            return `made ${person(p, names, "ownerId", "someone")} the owner of ${project(e)}${from ? ` (was ${from})` : ""}`;
        },
    },
    project_client_set: { icon: "briefcase", text: (e, p) => (p.clientId != null ? `${project(e)} assigned to ${client(e)}` : `${project(e)} set as an internal project`) },
    project_hold: { icon: "pause", text: (e) => `put ${project(e)} on hold` },
    project_resumed: { icon: "play", text: (e) => `resumed ${project(e)}` },
    project_completed: { icon: "checkCircle", text: (e) => `marked ${project(e)} as completed` },
    project_archived: { icon: "archive", text: (e) => `archived ${project(e)}` },
    project_reopened: { icon: "refresh", text: (e) => `reopened ${project(e)}` },
    progress_set: {
        icon: "trendUp",
        text: (e) => (e.amount == null ? `updated ${project(e)}'s progress`
            : `set ${project(e)} progress to ${e.amount}%${e.prevAmount != null ? ` (was ${e.prevAmount}%)` : ""}`),
    },
    requirement_added: { icon: "plus", text: (e, p) => `added${quoted(p.text)} to ${project(e)}'s requirements` },
    requirement_updated: { icon: "edit", text: (e, p) => `edited${quoted(p.text) || " a requirement"} on ${project(e)}` },
    requirement_done: { icon: "checkCircle", text: (e, p) => `completed${quoted(p.text) || " a requirement"} on ${project(e)}` },
    requirement_reopened: { icon: "refresh", text: (e, p) => `reopened${quoted(p.text) || " a requirement"} on ${project(e)}` },
    requirement_deleted: { icon: "trash", text: (e, p) => `removed${quoted(p.text) || " a requirement"} from ${project(e)}` },
    meeting_created: {
        icon: "calendar",
        text: (e, p) => {
            const at = str(p.startsAt);
            return `scheduled a meeting on ${project(e)}${str(p.topic) ? ` · ${str(p.topic)}` : ""}${at ? `, ${fmtDayDate(at)} at ${fmtTime(at)}` : ""}`;
        },
    },
    meeting_updated: { icon: "calendar", text: (e, p) => `updated a meeting on ${project(e)}${str(p.topic) ? ` · ${str(p.topic)}` : ""}` },
    meeting_deleted: { icon: "x", text: (e, p) => `cancelled a meeting on ${project(e)}${str(p.topic) ? ` · ${str(p.topic)}` : ""}` },
    client_added: { icon: "briefcase", text: (e) => `added ${client(e)} as a client` },
    client_updated: { icon: "edit", text: (e) => `updated ${client(e)}'s details` },
    client_archived: { icon: "archive", text: (e) => `archived ${client(e)}` },
    client_restored: { icon: "refresh", text: (e) => `restored ${client(e)}` },
    client_deleted: { icon: "trash", text: (e) => `deleted ${client(e)}` },

    // money
    revenue_set: { icon: "card", text: (e) => (e.amount == null ? `set the customer payment for ${project(e)}` : `set the customer payment for ${project(e)} to ${money.fmt(e.amount)}`) },
    revenue_changed: {
        icon: "card",
        text: (e) => (e.amount == null ? `changed the payment for ${project(e)}`
            : `changed the payment for ${project(e)} from ${money.fmt(e.prevAmount ?? 0)} to ${money.fmt(e.amount)}`),
    },
    project_fee_set: { icon: "card", text: (e) => `set ${project(e)}'s fee${e.amount == null ? "" : ` to ${money.fmt(e.amount)}`}` },
    material_markup_set: { icon: "card", text: (e, p) => `changed the material markup on ${project(e)}${num(p.markup) != null ? ` to ${money.pct(num(p.markup)!)}` : ""}` },
    expense_added: { icon: "plus", text: (e, p) => `added ${e.amount == null ? "an" : `a ${money.fmt(e.amount, str(p.currency) ?? "USD")}`} expense to ${project(e)}${str(p.label) ? ` - ${str(p.label)}` : ""}` },
    expense_removed: { icon: "trash", text: (e, p) => `removed ${e.amount == null ? "an" : `a ${money.fmt(e.amount, str(p.currency) ?? "USD")}`} expense from ${project(e)}` },
    material_added: { icon: "plus", text: (e, p) => `added ${str(p.name) ?? "a material"} to ${project(e)}${dash(e.amount)}` },
    material_updated: { icon: "edit", text: (e, p) => `updated ${str(p.name) ?? "a material"} on ${project(e)}${dash(e.amount)}` },
    material_removed: { icon: "trash", text: (e, p) => `removed ${str(p.name) ?? "a material"} from ${project(e)}` },
    material_priced: { icon: "card", text: (e, p) => `priced ${str(p.name) ?? "a material"} on ${project(e)}${e.amount == null ? "" : ` at ${money.fmt(e.amount)}`}` },
    labour_week_submitted: { icon: "userPlus", text: (e, p) => `reported labour for ${project(e)}${str(p.weekStart) ? ` - week of ${fmtDate(str(p.weekStart)!)}` : ""}${dash(e.amount)}` },
    labour_week_updated: { icon: "edit", text: (e, p) => `updated the labour for ${project(e)}${str(p.weekStart) ? ` - week of ${fmtDate(str(p.weekStart)!)}` : ""}${dash(e.amount)}` },
    labour_defaults_set: {
        icon: "user",
        text: (e, p) => `changed the labour defaults on ${project(e)}${num(p.workers) != null ? ` to ${num(p.workers)} workers` : ""}${e.amount == null ? "" : ` at ${money.fmt(e.amount)} a day`}`,
    },
    project_finalized: { icon: "checkCircle", text: (e) => `closed ${project(e)}${e.amount == null ? "" : ` at ${money.fmt(e.amount)} revenue`}` },

    // billing
    invoice_created: { icon: "file", text: (e, p) => `drafted ${str(p.number) ? `invoice ${str(p.number)}` : "an invoice"} for ${project(e)}${dash(e.amount)}` },
    invoice_updated: { icon: "edit", text: (e) => `edited a draft invoice for ${project(e)}${dash(e.amount)}` },
    invoice_discarded: { icon: "trash", text: (e) => `discarded a draft invoice for ${project(e)}` },
    invoice_issued: { icon: "file", text: (e, p) => `issued ${str(p.number) ?? "an invoice"} for ${project(e)}${dash(e.amount)}` },
    invoice_sent: {
        icon: "send",
        text: (e, p) => `sent ${str(p.number) ?? "an invoice"} to ${client(e)}${p.channel === "whatsapp" ? " on WhatsApp" : p.channel === "email" ? " by email" : ""}`,
    },
    invoice_voided: { icon: "x", text: (_e, p) => `voided ${str(p.number) ?? "an invoice"}${str(p.reason) ? ` - ${str(p.reason)}` : ""}` },
    payment_recorded: {
        icon: "card",
        text: (e, p) => `recorded ${e.amount == null ? "a payment" : money.fmt(e.amount)} received from ${client(e)}${str(p.invoiceNumber) ? ` against ${str(p.invoiceNumber)}` : " on account"}`,
    },
    payment_applied: { icon: "card", text: (_e, p) => `applied a payment to ${str(p.invoiceNumber) ?? "an invoice"}` },
    payment_voided: { icon: "x", text: (e, p) => `voided ${e.amount == null ? "a" : `a ${money.fmt(e.amount)}`} payment${str(p.reason) ? ` - ${str(p.reason)}` : ""}` },
    statement_created: { icon: "file", text: (e, p) => `drafted ${str(p.number) ? `statement ${str(p.number)}` : "a statement"} for ${project(e)}${dash(e.amount)}` },
    statement_sent: {
        icon: "send",
        text: (e, p) => `sent ${str(p.number) ? `statement ${str(p.number)}` : "a statement"} to ${client(e)}${p.channel === "whatsapp" ? " on WhatsApp" : p.channel === "email" ? " by email" : ""}`,
    },
    billing_settings_updated: { icon: "settings", text: () => "updated the billing settings" },
    exchange_rate_set: { icon: "card", text: (e, p) => `set the ${str(p.currency) ?? "exchange"} rate${e.amount == null ? "" : ` to ${e.amount.toLocaleString("en-US")} per USD`}` },

    // people
    employee_updated: { icon: "edit", text: (e, _p, names) => (e.subjectId === e.actor?.id ? "updated their profile" : `updated ${subject(e, names)}'s profile`) },
    employee_deactivated: { icon: "lock", text: (e, _p, names) => `deactivated ${subject(e, names)}` },
    employee_reactivated: { icon: "refresh", text: (e, _p, names) => `reactivated ${subject(e, names)}` },
    sessions_ended: { icon: "lock", text: (e, _p, names) => `ended every session of ${subject(e, names)} and suspended their sign-in` },
    sign_in_restored: { icon: "refresh", text: (e, _p, names) => `restored ${subject(e, names)}'s sign-in` },
    employee_email_changed: { icon: "mail", text: (e, _p, names) => (e.subjectId === e.actor?.id ? "changed their sign-in address" : `changed ${subject(e, names)}'s sign-in address`) },
    role_changed: { icon: "shield", text: (e, p, names) => `changed ${subject(e, names)}'s access${str(p.to) ? ` to ${str(p.to)!.replace("_", " ")}` : ""}` },
    employee_moved: { icon: "arrowRight", text: (e, p, names) => `moved ${subject(e, names)} to ${DOMAIN_LABEL[str(p.to) ?? ""] ?? "another business"}` },
    pay_changed: { icon: "card", text: (e, p, names) => `changed ${subject(e, names)}'s pay${str(p.effectiveFrom) ? ` from ${fmtDate(str(p.effectiveFrom)!)}` : ""}` },
    team_created: { icon: "people", text: (_e, p) => `created the ${str(p.name) ?? "new"} team` },
    team_renamed: { icon: "edit", text: (_e, p) => `renamed the ${str(p.from) ?? ""} team to ${str(p.to) ?? "a new name"}` },
    team_deleted: { icon: "trash", text: (_e, p) => `deleted the ${str(p.name) ?? ""} team` },
    permission_granted: { icon: "shield", text: (e, _p, names) => `changed ${subject(e, names)}'s permissions` },
    permission_revoked: { icon: "shield", text: (e, _p, names) => `changed ${subject(e, names)}'s permissions` },
    permission_reset: { icon: "shield", text: (e, _p, names) => `reset ${subject(e, names)}'s permissions` },
    role_auto_promoted: { icon: "shield", text: (e, _p, names) => `${subject(e, names)}'s access changed with their permissions` },
    role_auto_demoted: { icon: "shield", text: (e, _p, names) => `${subject(e, names)}'s access changed with their permissions` },

    // hours and schedules
    schedule_changed: {
        icon: "calendar",
        text: (e, p, names) => (p.followsDefault === true
            ? `put ${subject(e, names)} back on the company's working hours${from(p.effectiveFrom)}`
            : `changed ${subject(e, names)}'s working hours${from(p.effectiveFrom)}`),
    },
    working_time_changed: { icon: "clock", text: (_e, p) => `changed the company's working hours${from(p.effectiveFrom)}` },
    hours_excused: { icon: "checkCircle", text: (e, p, names) => `excused ${subject(e, names)} for ${excused(p)}` },
    hours_excuse_removed: { icon: "x", text: (e, p, names) => `removed ${subject(e, names)}'s excuse for ${excused(p)}` },

    // company expenses (the payload names the line; amounts only for financial:view)
    overhead_added: {
        icon: "plus",
        text: (e, p) => {
            const o = overhead(p);
            return o.d.replaces != null ? `carried ${o.name} on in ${o.currency}${dash(e.amount, o.currency)}` : `added ${o.name} to the company expenses${dash(e.amount, o.currency)}`;
        },
    },
    overhead_updated: { icon: "edit", text: (_e, p) => `updated ${overhead(p).name}'s details` },
    overhead_amount_changed: {
        icon: "card",
        text: (e, p) => {
            const o = overhead(p);
            return `changed ${o.name}'s monthly cost${e.amount == null ? "" : ` to ${money.fmt(e.amount, o.currency)}`}${str(o.d.fromMonth) ? ` from ${fmtMonthY(str(o.d.fromMonth)!)}` : ""}`;
        },
    },
    overhead_currency_changed: {
        icon: "card",
        text: (_e, p) => {
            const o = overhead(p);
            // either the line changed currency, or it ended and a new line carries on in the new one
            return str(o.d.previousCurrency) ? `changed ${o.name} from ${str(o.d.previousCurrency)} to ${o.currency}`
                : `ended ${o.name} in ${o.currency}${str(o.d.endedOn) ? ` on ${fmtDate(str(o.d.endedOn)!)}` : ""} to change its currency`;
        },
    },
    overhead_cancelled: { icon: "pause", text: (_e, p) => { const o = overhead(p); return `cancelled ${o.name}${str(o.d.endedOn) ? `, ending ${fmtDate(str(o.d.endedOn)!)}` : ""}`; } },
    overhead_resumed: { icon: "play", text: (_e, p) => `resumed ${overhead(p).name}` },
    overhead_removed: { icon: "trash", text: (_e, p) => `removed ${overhead(p).name} from the company expenses` },

    // settings
    domain_settings_updated: { icon: "settings", text: (e) => `updated the ${DOMAIN_LABEL[e.domain ?? ""] ?? "domain"} settings` },
    company_settings_updated: { icon: "settings", text: () => "updated the company settings" },
};

const FALLBACK: Words = { icon: "info", text: (e) => e.kind.replace(/_/g, " ") };

export function feedWords(e: FeedEvent, names: NameOf): { icon: IconName; text: string } {
    const w = WORDS[e.kind] ?? FALLBACK;
    const payload = e.payload && typeof e.payload === "object" ? (e.payload as Payload) : {};
    return { icon: w.icon, text: w.text(e, payload, names) };
}
