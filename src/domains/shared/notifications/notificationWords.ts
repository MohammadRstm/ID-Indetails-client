import type { Schemas } from "@/api/types";
import { AREAS } from "@/app/routing/areas";
import { companyToday, daysBetween, fmtDate, fmtDayDate, fmtDur, fmtH, fmtMonthY, fmtRange, dayKey } from "@/shared/format/time";
import type { IconName } from "@/shared/icons/icons";

export type Notification = Schemas["NotificationResponse"];

/** Who is reading: their words ("your", "you can log work") and their pages depend on it. */
export type Reader = {
    userId: number;
    isAdmin: boolean;
    /** They log Design work and keep it in My work: the words about logging are for them. */
    logsWork: boolean;
    /** Their own business, or the one they are looking at; a notification about a project uses the project's. */
    domain: "design" | "execution" | null;
};

export type NotificationView = {
    text: string;
    sub?: string;
    icon: IconName;
    /** Where a click goes, if anywhere. Checked against the reader's permissions before going. */
    route?: string;
    /** A client's page needs the client's business, which the notification doesn't carry. */
    clientId?: number;
};

type Payload = Record<string, unknown>;

const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" ? v : 0);
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const ROLE: Record<string, string> = { super_admin: "super admin", admin: "admin", employee: "employee" };
const BLOCKED_KIND: Record<string, string> = {
    expense: "An expense", material_add: "New expenses", material_update: "An expense change", labour_week: "A labour week",
    work_entry_create: "Logged hours", work_entry_update: "Changed hours", payment: "A lower payment", pricing: "A lower supervision rate",
    boq_agree: "Agreeing a BOQ or VO", boq_withdraw: "Withdrawing the agreement of a BOQ or VO",
};
const areaLabel = (d: unknown) => AREAS[d as "design" | "execution"]?.label ?? "";

/**
 * The words, icon and link of each notification (the prototype's HL.notify calls, in its voice). The API only
 * stores the kind, who, the project, the subject and a few facts, so the client writes the sentence; kinds the
 * prototype never had are written the same way. Amounts are never in a notification.
 */
export function describe(note: Notification, reader: Reader): NotificationView {
    const p = (note.payload ?? {}) as Payload;
    const who = note.actor?.name ?? "Someone";
    const title = note.project?.title ?? s(p.projectTitle);
    const d = (note.project?.domain as Reader["domain"]) ?? reader.domain;
    const project = note.project && d ? `/${d}/projects/${note.project.id}` : undefined;
    const requirements = project && `${project}?tab=requirements`;
    // the client portal is a Design project's tab
    const discussion = note.project ? `/design/projects/${note.project.id}?tab=portal&part=discussion` : undefined;
    const logsWork = reader.logsWork && d === "design";
    // pages about the reader themself: an employee's own profile or pay; admins have none of their own
    const mine = !reader.isAdmin && reader.domain ? `/${reader.domain}/profile` : undefined;
    const by = note.actor ? `By ${who}` : undefined;

    switch (note.kind) {
        case "requirement_assigned":
            return { text: `${who} assigned you a requirement on ${title}`, sub: `${s(p.text)}${p.deadline ? ` · due ${fmtDate(s(p.deadline))}` : ""}`, icon: "checkCircle", route: requirements };
        case "requirements_added":
            return {
                text: note.count > 1 ? `${note.count} requirements added to ${title}` : `A requirement was added to ${title}`,
                sub: p.latestText ? `Latest: ${s(p.latestText)}` : undefined, icon: "checkCircle", route: requirements,
            };
        case "requirement_done":
            return { text: `${who} completed a requirement on ${title}`, sub: s(p.text), icon: "checkCircle", route: requirements };
        case "requirement_due_soon":
            return { text: `A requirement on ${title} is due tomorrow`, sub: s(p.text), icon: "clock", route: requirements };
        case "requirement_overdue":
            return { text: `A requirement on ${title} is overdue`, sub: `${s(p.text)}${p.deadline ? ` · was due ${fmtDate(s(p.deadline))}` : ""}`, icon: "alert", route: requirements };

        case "work_logged":
            return {
                text: `${s(p.authorName) || who} logged ${fmtDur(n(p.minutes))} on ${title}`, sub: s(p.description) || undefined, icon: "clock",
                route: note.actor && note.subjectId ? `/design/people/${note.actor.id}?entry=${note.subjectId}` : undefined,
            };
        case "work_digest": {
            const day = dayKey(note.createdAt);
            return {
                text: `${day === companyToday() ? "Today's work" : `Work on ${fmtDate(day)}`}: ${plural(note.count, "entry", "entries")} logged · ${fmtDur(n(p.minutes))}`,
                sub: p.latestName ? `Latest: ${s(p.latestName)} on ${s(p.projectTitle) || title}` : undefined, icon: "clock", route: "/design/activity",
            };
        }
        case "entry_comment":
            return {
                text: `${s(p.authorName) || who} commented on your work entry`,
                sub: `${s(p.entryDescription)}${p.text ? ` - “${s(p.text)}”` : ""}`, icon: "chat",
                route: note.subjectId ? (reader.isAdmin ? `/design/people/${reader.userId}?entry=${note.subjectId}` : `/design/profile?entry=${note.subjectId}`) : undefined,
            };
        case "weekly_summary":
            return {
                text: `Weekly summary: you logged ${fmtDur(n(p.minutes))} last week`,
                sub: `Across ${plural(n(p.projects), "project")} · ${plural(n(p.entries), "entry", "entries")}`, icon: "reports", route: "/design/my-work",
            };

        case "meeting_scheduled": {
            const start = s(p.startsAt), end = s(p.endsAt);
            return {
                text: `${s(p.authorName) || who} scheduled a meeting on ${title}`,
                sub: start ? `${fmtDayDate(start)} · ${fmtRange(start, end || start)}${p.topic ? ` · ${s(p.topic)}` : ""}` : undefined,
                icon: "calendar", route: d ? `/${d}/meetings` : undefined,
            };
        }
        case "materials_added":
            return { text: `${who} added ${plural(n(p.count), "expense")} to ${title}`, icon: "list", route: project };
        case "labour_week_submitted":
            return { text: `${who} ${p.updated ? "updated" : "submitted"} a labour report for ${title}`, sub: p.weekStart ? `Week of ${fmtDate(s(p.weekStart))}` : undefined, icon: "projects", route: project };

        case "project_created":
            return { text: `New project added: ${title}`, sub: `Created by ${who}${logsWork ? " · you can log work against it now" : ""}`, icon: "projects", route: project };
        case "project_status_changed": {
            const change = s(p.change);
            const text = change === "complete" ? `${title} was marked completed`
                : change === "hold" ? `${title} was put on hold`
                    : change === "resume" ? `${title} was resumed` : `${title} was reopened`;
            const sub = !logsWork ? by
                : change === "complete" ? "It has been removed from your active projects - your logged work is still in My Work"
                    : change === "hold" ? "New work entries are paused until it resumes" : "You can log work against it again";
            return { text, sub, icon: "projects", route: project };
        }
        case "project_owner_set":
            return { text: `You're now the owner of ${title}`, sub: by ? `Set by ${who}` : undefined, icon: "projects", route: project };
        case "project_nearly_done":
            return { text: `${title} reached ${n(p.progressPct)}% progress`, sub: "Ready to close out?", icon: "trendUp", route: project };
        case "project_idle":
            return { text: `${title} has had no work logged for ${n(p.days)} days`, sub: p.lastWorkOn ? `Last entry: ${fmtDate(s(p.lastWorkOn))}` : "Nothing logged on it yet", icon: "trendUp", route: project };
        case "change_blocked":
            return {
                text: `A change on ${title} was stopped at zero profit`,
                sub: `${BLOCKED_KIND[s(p.kind)] ?? "A change"}${note.actor ? ` by ${who}` : ""} · force it or dismiss it`,
                icon: "alert", route: project && note.subjectId ? `${project}?blocked=${note.subjectId}` : project,
            };
        case "profit_low":
            return { text: `${title} is close to zero profit`, sub: `${n(p.marginPct)}% margin left`, icon: "trendUp", route: project };
        case "profit_at_zero":
            return { text: `${title} is at zero profit or below`, sub: `${n(p.marginPct)}% margin`, icon: "alert", route: project };
        case "project_cost_high":
            return { text: `${title} has used ${n(p.usedPct)}% of its payment in cost`, sub: "Worth a look before it runs over", icon: "trendUp", route: project };
        case "project_closed":
            return { text: `${title} closed at ${n(p.marginPct)}% margin`, sub: by, icon: "trendUp", route: project };

        case "invoice_issued":
            return { text: `${s(p.number) || "An invoice"} was issued`, sub: `${title}${note.actor ? ` · by ${who}` : ""}`, icon: "file", route: project && note.subjectId ? `${project}?invoice=${note.subjectId}` : project };
        case "invoice_overdue": {
            const days = p.dueOn ? daysBetween(s(p.dueOn), companyToday()) : 0;
            return { text: `${s(p.number) || "An invoice"} is ${days > 0 ? `${plural(days, "day")} overdue` : "overdue"}`, sub: title, icon: "alert", route: project && note.subjectId ? `${project}?invoice=${note.subjectId}` : project };
        }
        case "invoice_sent_automatically":
            return {
                text: p.to ? `${s(p.number) || "An invoice"} was emailed to ${s(p.to)}` : `${s(p.number) || "An invoice"} was issued - already paid on account, so not emailed`,
                sub: `${title} · as you scheduled`, icon: "send", route: project && note.subjectId ? `${project}?invoice=${note.subjectId}` : project,
            };
        case "invoice_send_due":
            return {
                text: `A scheduled invoice on ${title} is due to go out`, sub: "There's no email address to send it to - send it yourself",
                icon: "calendar", route: project && note.subjectId ? `${project}?send=${note.subjectId}` : project,
            };
        case "invoice_send_failed":
            return {
                text: `A scheduled invoice on ${title} couldn't be emailed`, sub: `${p.sendTo ? `To ${s(p.sendTo)} · ` : ""}it is tried again every hour`,
                icon: "alert", route: project && note.subjectId ? `${project}?invoice=${note.subjectId}` : project,
            };
        case "invoice_reminder_due":
            return {
                text: `${s(p.number) || "An invoice"} is due a reminder`, sub: `${title} · the client has no email address - chase it yourself`,
                icon: "alert", route: project && note.subjectId ? `${project}?send=${note.subjectId}` : project,
            };
        case "invoice_draft_waiting":
            return {
                text: `A draft invoice on ${title} is still waiting`, sub: p.createdOn ? `Drafted ${fmtDate(s(p.createdOn))} · ready to send to the client` : "Ready to send to the client",
                icon: "file", route: project && note.subjectId ? `${project}?invoice=${note.subjectId}` : project,
            };
        case "payment_recorded":
            return {
                text: `A payment was recorded on ${title}`,
                sub: `${p.invoiceNumber ? `Against ${s(p.invoiceNumber)}` : p.isInitial ? "The initial payment" : "On account"}${note.actor ? ` · by ${who}` : ""}`,
                icon: "card", route: project,
            };
        case "pocket_requested":
            return {
                text: `${title} asks for pocket money`,
                sub: note.actor ? `Asked by ${who} · approve or deny it` : "Raised by the system · approve or deny it",
                icon: "card", route: "/execution/pocket",
            };
        case "quote_due":
            return {
                text: `${title} may need a quote`,
                sub: note.actor ? `Created by ${who} · send it or not` : "Send it or not",
                // an Execution site has no quotes: its price comes from BOQs
                icon: "file", route: project && d === "design" ? `${project}?quote=new` : project,
            };
        case "client_added":
            return { text: `${s(p.organisation) || s(p.name) || "A client"} added as a client`, sub: by, icon: "briefcase", clientId: note.subjectId ?? undefined };

        case "portal_client_message":
            return {
                text: note.count > 1 ? `${note.count} new client messages in ${title}` : `${s(p.authorName) || who} sent a message in ${title}'s client portal`,
                icon: "chat", route: discussion,
            };
        case "portal_client_comment":
            return {
                text: note.count > 1
                    ? `${note.count} new client comments on ${s(p.itemTitle) || "a file"} in ${title}`
                    : `${s(p.authorName) || who} commented on ${s(p.itemTitle) || "a file"} in ${title}`,
                icon: "chat", route: discussion && note.subjectId ? `${discussion}&item=${note.subjectId}` : discussion,
            };
        case "portal_mention":
            return {
                text: `${s(p.authorName) || who} mentioned you in ${title}'s client portal`,
                icon: "chat", route: discussion && note.subjectType === "comment" && note.subjectId ? `${discussion}&item=${note.subjectId}` : discussion,
            };
        case "project_file_comment": {
            // the Project files tab finds the section of the file whose comments it opens
            const files = note.project ? `/design/projects/${note.project.id}?tab=files` : undefined;
            return {
                text: note.count > 1
                    ? `${note.count} new comments on ${s(p.fileTitle) || "a file"} in ${title}`
                    : `${s(p.authorName) || who} commented on ${s(p.fileTitle) || "a file"} in ${title}`,
                icon: "chat", route: files && note.subjectId ? `${files}&comments=${note.subjectId}` : files,
            };
        }

        case "invitation_accepted": {
            const domain = p.domain as Reader["domain"];
            return {
                text: `${who} accepted their invitation`, sub: [ROLE[s(p.role)] ? `${ROLE[s(p.role)][0].toUpperCase()}${ROLE[s(p.role)].slice(1)}` : null, domain ? areaLabel(domain) : null].filter(Boolean).join(" · ") || undefined,
                icon: "userPlus", route: domain && note.subjectId ? `/${domain}/people/${note.subjectId}` : undefined,
            };
        }
        case "role_changed":
            return { text: `You're now ${/^[aeiou]/.test(ROLE[s(p.to)] ?? "") ? "an" : "a"} ${ROLE[s(p.to)] ?? s(p.to)}`, sub: p.automatic ? "After a change to your permissions" : by, icon: "shield", route: mine };
        case "domain_changed":
            return { text: `You were moved to ${areaLabel(p.to) || "another business"}`, sub: by, icon: "shield", route: p.to ? `/${s(p.to)}` : undefined };
        case "team_changed":
            return { text: p.teamId == null ? "You were taken out of your team" : "You were moved to another team", sub: by, icon: "people", route: mine };
        case "permissions_changed": {
            const granted = (p.granted as unknown[] | undefined)?.length ?? 0, revoked = (p.revoked as unknown[] | undefined)?.length ?? 0, reset = (p.reset as unknown[] | undefined)?.length ?? 0;
            const parts = [granted ? `${granted} granted` : null, revoked ? `${revoked} taken away` : null, reset ? "some reset to your role's" : null].filter(Boolean);
            return { text: "Your permissions changed", sub: [parts.join(" · "), by].filter(Boolean).join(" · ") || undefined, icon: "shield", route: mine };
        }
        case "pay_changed": {
            const from = s(p.effectiveFrom);
            return {
                text: from && from > companyToday() ? `Your pay changes from ${fmtDate(from)}` : `Your pay changed${from ? ` from ${fmtDate(from)}` : ""}`,
                sub: by, icon: "card", route: logsWork ? "/design/pay" : mine,
            };
        }
        case "schedule_changed": {
            const from = s(p.effectiveFrom), when = from ? ` from ${fmtDate(from)}` : "";
            return { text: p.followsDefault ? `You're back on the company's working week${when}` : `Your working schedule changes${when}`, sub: by, icon: "calendar", route: mine };
        }
        case "hours_excused": {
            const month = s(p.month), paid = p.isPaid !== false, days = (p.days as unknown[] | undefined)?.length ?? 0;
            const text = p.kind === 2 ? `${fmtMonthY(month)} ${paid ? "excused" : "marked unpaid"} as a whole`
                : p.kind === 1 ? `${plural(days, paid ? "day off" : "unpaid day off", paid ? "days off" : "unpaid days off")}${paid ? " excused" : ""} in ${fmtMonthY(month)}`
                    : `${fmtH(n(p.minutes))} ${paid ? "excused" : "of unpaid leave"} in ${fmtMonthY(month)}`;
            return { text, sub: by, icon: "checkCircle", route: logsWork ? "/design/pay" : mine };
        }
        case "hours_short": {
            const people = (p.people as { name?: string; shortMinutes?: number }[] | undefined) ?? [];
            const count = n(p.count) || people.length;
            return {
                text: `${plural(count, "employee")} finished ${fmtMonthY(s(p.month))} short of their hours`,
                sub: people.slice(0, 3).map((x) => `${(x.name ?? "").split(" ")[0]} ${fmtH(x.shortMinutes ?? 0)}`).join(" · ") || undefined,
                icon: "people", route: `/company/salaries?month=${s(p.month)}`,
            };
        }
        default:
            return { text: note.kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), icon: "bell", route: project };
    }
}
