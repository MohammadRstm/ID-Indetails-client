import { Link } from "react-router";
import { loadFailed } from "@/api/queryState";
import { errorMessage } from "@/api/errors";
import { PageHead } from "@/shared/components/Data/Panel";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { PersonLine } from "@/shared/components/Identity/People";
import { fmtDayDate, fmtH } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useNotLogging, useRemind, useRemindAll, type NotLoggingPerson } from "./notLoggingApi";

const employees = (n: number) => `${n} employee${n === 1 ? "" : "s"}`;
const minutes = (value: number | null) => (value == null ? "-" : fmtH(value));

/**
 * The employees who have logged nothing this week, where an admin can send each of them a reminder to log their
 * hours, or all of them at once. Each person can be reminded once a day.
 */
export default function NotLoggingPage() {
    const query = useNotLogging();
    const remind = useRemind();
    const remindAll = useRemindAll();
    const people = query.data?.people ?? [];
    // the hours are only sent to whoever may see everyone's work
    const showHours = people.some((p) => p.loggedMinutes != null);
    const toRemind = people.filter((p) => !p.remindedToday).length;
    const busy = remind.isPending || remindAll.isPending;

    function sendOne(person: NotLoggingPerson) {
        remind.mutate(person.id, {
            onSuccess: () => toast({ text: `Reminded ${person.name}`, sub: "They've been asked to log their hours for this week.", icon: "checkCircle" }),
            onError: (e) => toast({ text: `${person.name} wasn't reminded`, sub: errorMessage(e), icon: "alert" }),
        });
    }

    function sendAll() {
        remindAll.mutate(undefined, {
            onSuccess: ({ reminded, skipped }) => {
                const left = skipped ? `${employees(skipped)} already reminded today ${skipped === 1 ? "was" : "were"} skipped.` : undefined;
                toast(reminded
                    ? { text: `Reminded ${employees(reminded)}`, sub: left, icon: "checkCircle" }
                    : { text: "Nobody to remind", sub: left ?? "Nobody is left to remind today.", icon: "bell" });
            },
            onError: (e) => toast({ text: "The reminders weren't sent", sub: errorMessage(e), icon: "alert" }),
        });
    }

    return (
        <div className="page">
            <PageHead
                crumbs={<><Link to="/design/overview">Overview</Link><Icon name="chevronRight" /><span>Not logged this week</span></>}
                title="Not logged this week"
                sub={query.data ? `Nothing logged since ${fmtDayDate(query.data.weekStart)} · ${employees(people.length)}` : " "}
                actions={<button className="btn btn-primary" disabled={!query.data || toRemind === 0 || busy} onClick={sendAll}><Icon name="send" />Remind all</button>} />

            <div className="panel">
                {loadFailed(query) ? <div className="panel-body"><LoadError error={query.error} retry={() => query.refetch()} what="the employees" /></div>
                    : !query.data ? <div className="panel-body"><SkeletonLines lines={6} /></div>
                    : people.length === 0 ? <Empty art="done" title="Everyone has logged work this week" text="Nobody is waiting for a reminder." />
                    : (
                        <div className="tbl-wrap">
                            <table className="tbl tbl-min">
                                <thead>
                                    <tr>
                                        <th>Employee</th>
                                        {showHours && <th className="r">Logged</th>}
                                        {showHours && <th className="r" title="What their schedule asks for, up to today">Expected so far</th>}
                                        {showHours && <th className="r">Overtime</th>}
                                        <th className="r">Reminder</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {people.map((p) => (
                                        <tr key={p.id}>
                                            <td><PersonLine person={{ id: p.id, name: p.name, photoFileId: p.photoFileId }} size={30} link sub={p.email} /></td>
                                            {showHours && <td className="r mono">{minutes(p.loggedMinutes)}</td>}
                                            {showHours && <td className="r mono">{minutes(p.expectedMinutes)}</td>}
                                            {showHours && <td className={cx("r mono", p.overtimeMinutes ? "ot-text" : "muted")}>{p.overtimeMinutes ? fmtH(p.overtimeMinutes) : "-"}</td>}
                                            <td className="r">
                                                <button className="btn btn-sm" disabled={p.remindedToday || busy} onClick={() => sendOne(p)}>
                                                    <Icon name={p.remindedToday ? "check" : "send"} />{p.remindedToday ? "Reminded today" : "Remind"}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            </div>
        </div>
    );
}
