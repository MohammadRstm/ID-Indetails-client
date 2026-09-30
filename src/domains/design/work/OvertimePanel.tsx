import { useState } from "react";
import { useNavigate } from "react-router";
import { ProjectTile } from "@/shared/components/Data/Bits";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { addMonths, companyToday, fmtDayDate, fmtDur, fmtH, fmtMonthY, fmtRange, monthKey } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useMyOvertime } from "./workApi";
import { loadFailed } from "@/api/queryState";

type OvertimePanelProps = {
    /** Someone else's overtime (an admin on their profile); the signed-in person's own when left out. */
    userId?: number;
};

/** A person's overtime month by month, day by day and entry by entry (the prototype's UI.OvertimePanel). */
export default function OvertimePanel({ userId }: OvertimePanelProps) {
    const navigate = useNavigate();
    const thisMonth = monthKey(companyToday());
    const [month, setMonth] = useState(thisMonth);
    const [open, setOpen] = useState(false);
    const query = useMyOvertime(month, userId ?? null);
    const entryPath = (id: number) => (userId == null ? `/design/profile?entry=${id}` : `/design/people/${userId}?entry=${id}`);
    const ot = query.data;
    const isThisMonth = month === thisMonth;
    const days = ot?.days ?? [];
    const entries = ot?.entries ?? 0;

    return (
        <div className="panel mt">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Overtime</div>
                    <div className="panel-sub">Time logged outside {userId == null ? "your" : "their"} working hours, and everything on {userId == null ? "your" : "their"} days off.</div>
                </div>
                <div className="row" style={{ gap: 4 }}>
                    <button className="icon-btn" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><Icon name="chevronLeft" /></button>
                    <b style={{ fontSize: "12.5px", minWidth: 110, textAlign: "center" }}>{fmtMonthY(month)}</b>
                    <button className="icon-btn" aria-label="Next month" disabled={isThisMonth} onClick={() => setMonth(addMonths(month, 1))}><Icon name="chevronRight" /></button>
                </div>
            </div>
            <div className="panel-body">
                {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="your overtime" /> : !ot ? <SkeletonLines lines={2} /> : (
                    <>
                        <div className="row wrap" style={{ gap: "10px 22px", alignItems: "baseline" }}>
                            <div>
                                <div className="u">{isThisMonth ? "This month so far" : "That month"}</div>
                                <div className="hero-val" style={{ fontSize: 28 }}>{fmtH(ot.overtimeMinutes)}</div>
                            </div>
                            <div className="muted">{days.length} day{days.length === 1 ? "" : "s"} · {entries} entr{entries === 1 ? "y" : "ies"}</div>
                            <span className="grow" />
                            {days.length > 0 && (
                                <button className="link analytics-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
                                    <Icon name={open ? "chevronUp" : "chevronDown"} />{open ? "Hide details" : "Show details"}
                                </button>
                            )}
                        </div>
                        {days.length === 0 && <div className="hint mt-s">No overtime logged in {fmtMonthY(month)}.</div>}
                        {open && (
                            <div className="ot-days mt">
                                {days.map((d) => (
                                    <div key={d.date} className="ot-day">
                                        <div className="ot-day-head">
                                            <b>{fmtDayDate(d.date)}</b>
                                            {d.dayOff && <span className="badge badge-hold">Day off</span>}
                                            <span className="grow" />
                                            <b className="mono ot-text">{fmtDur(d.overtimeMinutes)}</b>
                                        </div>
                                        {d.entries.map((e) => (
                                            <div key={e.workEntryId} className="ot-item" role="link" tabIndex={0} title="Open this entry"
                                                onClick={() => navigate(entryPath(e.workEntryId))}
                                                onKeyDown={(ev) => { if (ev.key === "Enter") navigate(entryPath(e.workEntryId)); }}>
                                                <ProjectTile icon={e.projectIcon} tint={e.projectTint} size="sm" />
                                                <div className="grow" style={{ minWidth: 0 }}>
                                                    <div className="trunc">{e.description}</div>
                                                    <div className="muted" style={{ fontSize: "11.5px" }}>{e.projectTitle} · <span className="mono">{fmtRange(e.startedAt, e.endedAt)}</span></div>
                                                </div>
                                                <span className="mono muted nowrap" style={{ fontSize: 12 }}>
                                                    {fmtDur(e.overtimeMinutes)}{e.overtimeMinutes < e.minutes ? ` of ${fmtDur(e.minutes)}` : ""}
                                                    {e.madeUpMinutes ? <div className="hl-made" title="Counted as normal hours because the month was short">{fmtDur(e.madeUpMinutes)} made up</div> : null}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
