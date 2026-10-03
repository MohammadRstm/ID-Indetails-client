import { useNavigate } from "react-router";
import type { Schemas } from "@/api/types";
import { usePermissions } from "@/app/permissions/usePermissions";
import { canOpen } from "@/app/routing/routeTable";
import { fmtDur, fmtH, fmtMonthY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useMyHours, useMyPay } from "../work/workApi";

type Hours = Schemas["MyHoursResponse"];
type LedgerMonth = Schemas["MyLedgerMonthResponse"];

/** A month's standing on the hours its schedule asked for. */
function LedgerStatus({ month: l }: { month: LedgerMonth }) {
    if (l.status === "excused") return <span className="badge">Excused</span>;
    if (l.status === "short") return <span className="hl-flag">Short {fmtH(l.shortMinutes)}</span>;
    if (l.status === "behind") return <span className="hl-behind">{fmtH(l.shortMinutes)} behind</span>;
    return <span className="badge badge-ok">{l.inProgress ? "On track" : "Complete"}</span>;
}

/**
 * Month by month: what was owed, what was worked, what overtime covered (the prototype's UI.HoursBalance).
 * Shown to the employee themself, and to super admins on a profile.
 */
export function HoursBalance({ hours, self }: { hours: Hours; self: boolean }) {
    const months = hours.months;
    if (!hours.applies || months.length === 0) return null;
    const cur = months[0];
    return (
        <div className="panel mt">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Hours balance</div>
                    <div className="panel-sub">{self
                        ? "The hours your schedule asks for each month. Overtime first makes up any hours you're short, then counts as overtime."
                        : "Scheduled hours owed each month. Overtime first makes up missed hours, then is paid as overtime."}</div>
                </div>
            </div>
            <div className="panel-body">
                <div className="hl-now">
                    <div>
                        <span className="u">{cur.inProgress ? "This month so far" : fmtMonthY(cur.month)}</span>
                        {" "}<b className="mono">{fmtH(Math.min(cur.insideMinutes + cur.madeUpMinutes + cur.excusedMinutes, cur.expectedMinutes) || 0)}</b>
                        {" "}<span className="muted">of {fmtH(cur.expectedMinutes)}</span>
                    </div>
                    <div><LedgerStatus month={cur} /></div>
                    {cur.madeUpMinutes > 0 && <div className="muted">{fmtH(cur.madeUpMinutes)} of overtime counts as normal hours</div>}
                    {cur.inProgress && <div className="muted">{fmtH(cur.expectedFullMonthMinutes)} due over the whole month</div>}
                </div>
                <div className="tbl-wrap mt-s">
                    <table className="tbl tbl-min-sm">
                        <thead>
                            <tr>
                                <th>Month</th><th className="r">Expected</th><th className="r">In hours</th><th className="r">Made up</th>
                                <th className="r">Overtime paid</th><th className="r">Excused</th><th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {months.map((l) => (
                                <tr key={l.month}>
                                    <td className="nowrap"><b>{fmtMonthY(l.month)}</b>{l.inProgress && <div className="muted" style={{ fontSize: 11 }}>so far</div>}</td>
                                    <td className="r mono">{fmtH(l.expectedMinutes)}</td>
                                    <td className="r mono">{fmtH(l.insideMinutes)}</td>
                                    <td className="r mono">{l.madeUpMinutes ? fmtH(l.madeUpMinutes) : "-"}</td>
                                    <td className="r mono ot-text">{l.overtimePaidMinutes ? fmtH(l.overtimePaidMinutes) : "-"}</td>
                                    <td className="r mono" title={l.excuses.map((x) => x.note).join(" · ")}>{l.wholeMonthExcused ? "all" : l.excusedMinutes ? fmtH(l.excusedMinutes) : "-"}</td>
                                    <td><LedgerStatus month={l} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

/** The signed-in person's own balance. */
export function MyHoursBalance() {
    const hours = useMyHours();
    return hours.data ? <HoursBalance hours={hours.data} self /> : null;
}

/**
 * At the top of a Design employee's home: behind this month, or last month closed short (the prototype's
 * UI.BehindNotice).
 */
export function BehindNotice() {
    const navigate = useNavigate();
    const seesPay = canOpen(usePermissions(), "design", "pay");
    const hours = useMyHours();
    const months = hours.data?.applies ? hours.data.months : [];
    const cur = months.find((m) => m.inProgress);
    const last = months.find((m) => !m.inProgress);
    const flagged = last?.status === "short";
    // whether last month's missing hours come off a salary depends on how they were paid then
    const lastPay = useMyPay(last?.month.slice(0, 7) ?? "", flagged);
    const monthly = lastPay.data?.salary?.basis === "monthly";

    const lines = [];
    if (cur?.status === "behind") {
        const asked = cur.expectedMinutes - cur.excusedMinutes;
        lines.push(
            <div key="c"><b>You're {fmtH(cur.shortMinutes)} behind on your hours this month.</b>
                {" "}Up to yesterday your schedule asked for {fmtDur(asked)} and you've covered {fmtDur(asked - cur.shortMinutes)} of it.
                {" "}Log any time you missed, or work overtime to make it up before {fmtMonthY(cur.month).split(" ")[0]} ends.</div>,
        );
    }
    if (last && flagged) {
        lines.push(
            <div key="l" className={lines.length ? "mt-s" : ""}><b>{fmtMonthY(last.month)} closed {fmtH(last.shortMinutes)} short.</b>
                {" "}{monthly ? "Unless it's excused, the missing hours come off that month's salary." : "Hours that weren't worked weren't paid, and the month is marked short unless it's excused."}</div>,
        );
    }
    if (!lines.length) return null;
    return (
        <div className="banner attn mt pay-behind" role="status">
            <Icon name="clock" />
            <div className="grow">{lines}</div>
            {seesPay && <button className="btn btn-sm" onClick={() => navigate("/design/pay")}>See my hours & pay</button>}
        </div>
    );
}
