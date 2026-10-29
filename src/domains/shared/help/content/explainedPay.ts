import { P } from "@/app/permissions/codes";
import { or as orFact } from "../helpFacts";
import {
    and, formula, has, isEmployee, list, note, only, or, para, sees, tracksOwnHours, type Article,
} from "../helpModel";

/** They log Design work. */
const logs = and(sees("design"), has(P.WORK_ENTRY_CREATE, P.WORK_ENTRY_VIEW_OWN));
const designEmployee = and(isEmployee, sees("design"), has(P.WORK_ENTRY_VIEW_OWN));
const seesSalaries = has(P.SALARY_VIEW);

export const explainedPay: Article[] = [
    {
        id: "working-day",
        title: "The working day, required hours and the paid break",
        category: "pay",
        who: or(logs, seesSalaries, has(P.WORKING_TIME_MANAGE), has(P.SCHEDULE_MANAGE)),
        summary: (f) => (f.hasBreak === false && f.day && f.paid
            ? `Your company's day, ${f.day}, has no separate break: all ${f.paid} of it are logged, required and paid.`
            : `A working day asks for its hours minus the break, but the break is paid. ${f.day && f.required && f.paid ? `Your company's day, ${f.day}, asks for ${f.required} of work and pays ${f.paid}.` : ""}`.trim()),
        ask: ["required hours", "working day", "break", "paid break", "lunch", "7 hours", "8 hours", "how many hours a day"],
        blocks: [
            formula("Required hours = the day's span − the break (for a day longer than 6 hours)",
                (f) => (f.hasBreak === false && f.day && f.paid
                    ? `Your company has no break: ${f.day} is ${f.paid}, and all ${f.paid} of work are required and paid.`
                    : f.day && f.breakTime && f.required && f.paid
                        ? `Your company: ${f.day} is ${f.paid}; minus the ${f.breakTime} break, ${f.required} of work is required. All ${f.paid} are paid.`
                        : "9:00 AM to 5:00 PM is 8 hours; minus a 1-hour break, 7 hours of work are required, and all 8 are paid.")),
            list(
                "The break is taken whenever you like, and is always paid without being logged. It is never taken off pay.",
                "With no break set, the whole day is logged and required.",
                "A day of 6 hours or less has no break: all of it is required.",
                (f) => `Working days: ${orFact(f.days, "set by the company")}. Other days are days off.`,
                "Someone can have their own schedule (other days or hours); the break and the overtime rate still come from the company.",
            ),
        ],
        related: ["overtime", "hours-balance", "pay"],
    },
    {
        id: "overtime",
        title: "What counts as overtime",
        category: "pay",
        who: or(logs, has(P.WORK_ENTRY_VIEW_ALL), seesSalaries),
        summary: "Overtime is time outside your hours, all the time worked on a day off, and time inside your hours beyond what the day requires.",
        ask: ["overtime", "what is overtime", "how is overtime calculated", "extra hours", "weekend", "after hours", "late"],
        blocks: [
            para("It is worked out for each person and day (the day an entry starts on), against their schedule that day:"),
            list(
                "**A day off**: every minute is overtime.",
                "**A working day**: minutes before the start or after the end are overtime.",
                "And if the minutes inside the hours add up to more than the day requires, the extra is overtime too (taken from the latest entries).",
            ),
            formula("Overtime = the time outside your hours + the time inside them beyond what the day requires",
                (f) => (f.hasBreak === false && f.day
                    ? `Logging all of ${f.day} on a working day is exactly what the day requires: none of it is overtime, only time before or after it.`
                    : f.day && f.required
                        ? `Logging all of ${f.day} on a working day puts ${f.paid ?? "the whole day"} inside your hours against ${f.required} required, so the difference is overtime, paid on top of the paid break.`
                        : "Logging all of 9:00 AM to 5:00 PM on a 9-to-5 day puts 8 hours inside your hours against 7 required: 1 hour is overtime, paid on top of the paid break.")),
            list(
                "Work past midnight counts on the day it started; the minutes after midnight are outside your hours, so they're overtime.",
                "Overtime depends on your whole day across all projects, not one entry.",
                (f) => `Overtime is paid at the true hourly rate × ${orFact(f.multiplier, "the company's overtime rate")}: an hourly rate itself, or for a salary the salary ÷ 173.33 (a standard month), whatever the month.`,
            ),
            only(or(tracksOwnHours, seesSalaries), note("For Design employees, overtime first makes up any hours missing that month; only what's left is paid as overtime. The part that made up hours is paid as normal hours.")),
        ],
        related: ["working-day", "hours-balance", "pay", "overtime-rate"],
    },
    {
        id: "hours-balance",
        title: "Your hours balance: expected, made up, behind and short",
        category: "pay",
        who: or(tracksOwnHours, seesSalaries),
        summary: "Each month compares the hours your working days asked for with the hours you worked inside your hours.",
        ask: ["hours balance", "expected hours", "made up", "short", "behind", "on track", "missing hours", "missed days", "hours ledger"],
        blocks: [
            list(
                "**Expected**: the required hours of each of the month's working days, from the day the person joined (and to their last day, if they left). While the month runs, it counts up to yesterday.",
                "**Excused**: hours and days a super admin excused; they count as done.",
                "**In hours**: work inside the person's hours.",
                "**Made up**: overtime used to cover missing hours, paid as normal hours.",
                "**Short**: what is still missing.",
            ),
            formula("Short = Expected − Excused − In hours − Made up (never below 0)"),
            list(
                "**Behind** during the month, **Short** once it has ended; otherwise **On track** or **Complete**; **Excused** when the whole month was excused.",
                "A **missed day** is a working day with no work inside the hours and no excuse.",
                "Today's work already counts, though today isn't expected until it's over.",
                "Nothing carries over: each month starts at zero.",
            ),
            note("The balance is for Design's employees. Admins, Execution staff and super admins don't have one."),
            only(seesSalaries, para("After a month ends, Salaries flags those who were short, and you're told on the 1st who was short the month before.")),
        ],
        related: ["overtime", "deductions", "excuses", "closed-months"],
    },
    {
        id: "pay",
        title: "How pay is calculated",
        category: "pay",
        who: or(designEmployee, seesSalaries, has(P.EMPLOYEE_PAY_MANAGE)),
        summary: "Pay is a monthly salary or an hourly rate, plus overtime, minus any deductions. It is worked out fresh from the records each time.",
        ask: ["how is pay calculated", "salary calculation", "hourly rate", "monthly salary", "pay", "173", "true hourly rate", "31 days", "28 days", "pro rata", "overtime pay", "base pay"],
        blocks: [
            para("**A monthly salary**"),
            formula("Pay = salary + overtime pay − deductions",
                "The salary is the same every month, whatever its length. It is shared by working days in a month someone joins or leaves (or has days away): joining halfway pays about half."),
            formula("An hour of a salary this month = salary ÷ the month's paid hours",
                "The paid hours of every working day in the month, the break included. A month with more working days makes each hour worth less: $1,760 is $10 an hour in a month of 22 working days (176 paid hours), $11 in one of 20. It prices deductions, so a missed day always costs that day's share."),
            formula("True hourly rate of a salary = salary ÷ 173.33",
                "173.33 hours is a standard month: a 40-hour paid week × 52 weeks ÷ 12 months (a part-time week scales it). Overtime is paid from it, whatever the month: a $1,733.30 salary's overtime starts from $10 an hour."),
            para("**An hourly rate**"),
            formula("Pay = (hours inside your hours + hours made up) × rate + the paid break of each working day you worked + overtime pay",
                "The break is paid on top, for every working day with some work inside your hours. With no break set, the whole day is logged instead, so nothing is added."),
            formula("Overtime pay = overtime hours (after any making up) × true hourly rate × overtime rate"),
            list(
                "The pay in force at the month's end prices a salaried month, even after a mid-month raise; hourly work is priced at each day's rate.",
                "Pay is per currency and never converted.",
                "Nothing is stored: a late excuse or a pay change dated in the past changes the figures at once.",
            ),
            only(or(seesSalaries, has(P.EMPLOYEE_PAY_MANAGE)), list(
                "Admins and super admins are paid a fixed monthly salary: they log no hours, so they earn no overtime and nothing is deducted for hours.",
                "Execution staff log no hours, so they're paid their salary.",
            )),
        ],
        related: ["deductions", "overtime", "working-day", "my-pay-estimates"],
    },
    {
        id: "deductions",
        title: "Deductions: missed hours and unpaid leave",
        category: "pay",
        who: or(tracksOwnHours, seesSalaries, has(P.EMPLOYEE_PAY_MANAGE)),
        summary: "On a monthly salary, a month that ends short loses the missing hours, and a whole missed day costs the whole paid day, break included.",
        ask: ["deduction", "deducted", "missed day", "missing hours", "unpaid leave", "salary cut", "why was my pay lower", "short month"],
        blocks: [
            list(
                "Only a monthly salary is deducted; an hourly rate simply pays the hours worked.",
                "Missed hours are deducted once the month has ended and is still short.",
                "A whole missed working day costs the full paid day, break included; missing hours on days you did work cost only those hours.",
                "The deduction never goes above the month's base pay.",
            ),
            formula("Deduction = deducted hours × the month's hourly rate (the salary ÷ the month's paid hours)",
                (f) => (f.required && f.paid
                    ? `With your company's day (${f.required} required, ${f.paid} paid), a missed day costs ${f.paid}; 3 missing hours on a day you worked cost 3 hours.`
                    : "On a 9-to-5 day with a 1-hour break, a missed day costs 8 hours (7 required + the paid break); 3 missing hours on a day you worked cost 3 hours.")),
            list(
                "**Unpaid leave**: unpaid hours come off as they are; an unpaid day off costs the whole paid day; an unpaid month costs the month's salary.",
                "**Paid excuses** deduct nothing.",
            ),
        ],
        related: ["hours-balance", "excuses", "pay"],
    },
    {
        id: "my-pay-estimates",
        title: "The estimates on My pay",
        category: "pay",
        who: designEmployee,
        summary: "While a month runs, My pay shows what you've earned so far and what the month comes to if things stay as they are.",
        ask: ["earned so far", "full month estimate", "as things stand", "would lose", "estimate", "my pay this month"],
        blocks: [
            list(
                "**Earned so far**: your base pay for the share of the month's required hours so far, plus overtime pay.",
                "**Full month, as things stand**: the month's base pay plus overtime, minus what you'd lose if the month ended short by what you're behind today.",
                "Catching up the hours you're behind removes what you'd lose.",
                "Once the month ends, the figure is the month's pay.",
            ),
        ],
        related: ["pay", "hours-balance", "deductions"],
    },
    {
        id: "closed-months",
        title: "Closed months",
        category: "pay",
        who: or(logs, seesSalaries),
        summary: "From the 1st, last month is closed: its entries can't change, and its hours are final for pay. There's no button to close a month.",
        ask: ["closed month", "month closed", "can't edit last month", "lock", "month end", "previous month"],
        blocks: [
            list(
                "**For logging**: from the 1st, nobody can add, change or delete last month's entries. On the 1st itself, last month is still open for logging.",
                "**For pay**: from the 1st, last month is over: someone short is flagged, and on a monthly salary the missing hours are deducted.",
                "Nothing is frozen: a correction afterwards is made with an excuse, and a pay change dated in the past re-prices the month.",
            ),
        ],
        related: ["hours-balance", "excuses"],
    },
    {
        id: "excuses",
        title: "Excused hours and days",
        category: "pay",
        who: or(has(P.HOURS_EXCUSE), tracksOwnHours),
        summary: "A super admin can excuse hours, days or a whole month, paid or unpaid. Excused time counts as done.",
        ask: ["excused", "excuse", "day off", "sick", "leave", "vacation", "holiday", "unpaid leave"],
        blocks: [
            list(
                "**Paid** (the default): the hours stop counting as missing; pay is unchanged.",
                "**Unpaid**: the hours stop counting as missing, but on a monthly salary the time is deducted.",
                "A month can be excused afterwards; never a future month, and never by the person themselves.",
            ),
            only(tracksOwnHours, para("You're told when hours of yours are excused, and they show on My pay.")),
        ],
        related: ["deductions", "hours-balance"],
    },
    {
        id: "joining-leaving",
        title: "Joining, leaving and coming back",
        category: "pay",
        who: or(seesSalaries, has(P.EMPLOYEE_MANAGE)),
        summary: "Someone is paid from the day they accept their invitation to their last working day. A month partly worked is shared by working days.",
        ask: ["joined mid month", "left mid month", "pro rata", "last working day", "rehired", "came back", "partial month", "pay gap"],
        blocks: [
            list(
                "Their employment starts the day they accept the invitation, and ends on the last working day set when they're deactivated, which is paid.",
                "A monthly salary is shared by working days in a month they joined or left: joining halfway pays about half.",
                "Coming back the next day: nothing changes. Coming back later the same month: you choose whether the days away are paid. Coming back in a later month: a new start, and the time away is unpaid.",
                "A month entirely away isn't listed in Salaries.",
            ),
        ],
        related: ["deactivate", "pay"],
    },
    {
        id: "project-pay-vs-salaries",
        title: "Why Project pay and Salaries don't match",
        category: "pay",
        who: seesSalaries,
        summary: "Project pay shows what each project paid for the hours logged on it. Salaries is what each person is owed. The difference is the paid break and deductions.",
        ask: ["project pay vs salaries", "doesn't match", "difference", "project pay", "labour cost"],
        blocks: [
            list(
                "Project pay prices each entry as Salaries does: hours inside a person's hours (and hours made up) at their rate that day (a salary's rate that month), overtime at their true hourly rate × the overtime rate.",
                "It leaves out the paid break and deductions, which belong to the person's month, not to a project.",
                "Time with no pay record on its day is shown as unpriced, and paid 0.",
                "Admins and super admins log no hours; any they logged before counts as normal hours.",
            ),
        ],
        related: ["salaries", "project-cost"],
    },
    {
        id: "work-activity",
        title: "Busy, steady, quiet and idle",
        category: "pay",
        who: has(P.WORK_ENTRY_VIEW_ALL),
        summary: "The activity labels on people and projects come from the last 14 days of logged work.",
        ask: ["busy", "steady", "quiet", "idle", "activity level", "streak", "quiet gap", "workload"],
        blocks: [
            list(
                "**Busy**: 45 hours a week or more over the last 14 days. **Steady**: 15 or more. **Quiet**: any work. Nothing: no work at all.",
                "A project is **idle** after 7 days without work (counted from its start when there's none).",
                "A **quiet gap** on a timeline is 4 or more days without work.",
                "A **streak** is the longest run of days in a row with work, over the last year.",
            ),
        ],
    },
];
