import { fmtDateY } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import type { TimeOff, TimeOffStatus } from "./timeOffApi";

const WORDS: Record<TimeOffStatus, string> = {
    pending: "Waiting for a decision",
    approved: "Approved",
    declined: "Declined",
    withdrawn: "Withdrawn",
    expired: "Expired",
    cancelled: "Cancelled",
    rejected: "Rejected",
    ended: "Ended early",
};

/** A request's status: amber while it waits, green once approved (with Paid or Unpaid), grey for everything else. */
export function TimeOffStatusBadge({ request }: { request: Pick<TimeOff, "status" | "isPaid"> }) {
    const { status, isPaid } = request;
    const pay = isPaid == null ? "" : isPaid ? " · Paid" : " · Unpaid";
    const takenWithPay = status === "approved";
    return (
        <span className={cx("badge", status === "pending" && "badge-hold", takenWithPay && "badge-active")}>
            {WORDS[status]}{status === "approved" || status === "rejected" || status === "ended" ? pay : ""}
        </span>
    );
}

/** What was said or done about a request, in a line each: the decision note, how it ended, and the end note. */
export function TimeOffDecisionNotes({ request: r }: { request: TimeOff }) {
    const lines: string[] = [];
    if (r.decisionNote) lines.push(`${r.decidedByName ? `${r.decidedByName}: ` : "Note: "}${r.decisionNote}`);
    if (r.status === "rejected" && r.endedOn) lines.push(`Taken back on ${fmtDateY(r.endedOn)}${r.endedByName ? ` by ${r.endedByName}` : ""}. The days before it stay time off.`);
    if (r.status === "ended" && r.endedOn) lines.push(`Ended on ${fmtDateY(r.endedOn)} because the person left, moved or became an admin. The days before it stay time off.`);
    if (r.endNote) lines.push(`${r.endedByName ? `${r.endedByName}: ` : "Note: "}${r.endNote}`);
    if (lines.length === 0) return null;
    return <>{lines.map((l) => <div key={l} className="muted" style={{ fontSize: 11.5 }}>{l}</div>)}</>;
}
