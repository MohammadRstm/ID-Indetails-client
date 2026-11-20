import { useRef, useState } from "react";
import { loadFailed } from "@/api/queryState";
import Pager from "@/shared/components/Data-Tables/Pager";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { PersonLine } from "@/shared/components/Identity/People";
import Modal from "@/shared/components/Overlays/Modal";
import { fmtDateY, fmtMonthY } from "@/shared/format/time";
import { clickable } from "@/shared/utils/clickable";
import { AdvanceStatusBadge } from "./AdvanceStatusBadge";
import { amountOf, monthKey } from "./advanceMonths";
import {
    ApproveAdvanceModal, CancelAdvanceModal, ChangeMonthsModal, DeclineAdvanceModal, SettleAdvanceModal,
} from "./SalaryAdvanceWindows";
import { useSalaryAdvance, useSalaryAdvances, type SalaryAdvance, type SalaryAdvanceView } from "./salaryAdvancesApi";

const PAGE_SIZE = 10;

type Acting = { kind: "approve" | "decline" | "change" | "cancel" | "settle"; advance: SalaryAdvance };

const LISTS: { view: SalaryAdvanceView; title: string; sub: string; empty: string; emptyText: string }[] = [
    { view: "pending", title: "Waiting", sub: "Requests nobody has decided on yet. Approve one to choose the months it comes off, or decline it.",
        empty: "No requests waiting", emptyText: "When someone asks for an advance, it is listed here." },
    { view: "open", title: "Being paid back", sub: "Advances still coming off pay, and those whose person left with something unsettled.",
        empty: "Nothing is being paid back", emptyText: "Advances that are given appear here until they are paid back or settled." },
    { view: "closed", title: "Closed", sub: "Advances paid back or settled, and requests that were declined, withdrawn or cancelled.",
        empty: "No closed advances", emptyText: "Finished advances appear here." },
];

const BEHIND = "A month took less than was planned, so the rest moves on to the next month.";
const UNSETTLED = "They left with something still owed. Mark it repaid in cash, or write it off.";

/** The months an advance comes off: what each takes, ticked once the month has closed. */
function MonthChips({ advance }: { advance: SalaryAdvance }) {
    if (advance.months.length === 0) return <span className="muted">-</span>;
    return (
        <div className="row wrap" style={{ gap: 6 }}>
            {advance.months.map((m) => (
                <span key={m.month} className="badge" title={fmtMonthY(m.month)}>
                    {fmtMonthY(m.month).slice(0, 3)}{monthKey(m.month).slice(2, 4) !== monthKey(advance.months[0].month).slice(2, 4) ? ` ${monthKey(m.month).slice(2, 4)}` : ""} −{amountOf(m.closed ? (m.taken ?? m.planned) : m.planned, advance.currency)}{m.closed ? " ✓" : ""}
                </span>
            ))}
        </div>
    );
}

/** The status, with what is wrong with it: behind on the plan, or left unsettled. */
function StatusCell({ advance }: { advance: SalaryAdvance }) {
    return (
        <div className="row wrap" style={{ gap: 6 }}>
            <AdvanceStatusBadge advance={{ status: advance.status, left: advance.left, settledKind: advance.settlement?.kind }} />
            {advance.unsettled && <span className="badge badge-hold" title={UNSETTLED}>Left unsettled</span>}
            {advance.behind && <span className="badge badge-hold" title={BEHIND}>Behind</span>}
        </div>
    );
}

/** The actions an advance allows right now. */
function Actions({ advance, onAct }: { advance: SalaryAdvance; onAct: (kind: Acting["kind"]) => void }) {
    const who = advance.person.name;
    return (
        <div className="row end wrap" style={{ gap: 6 }}>
            {advance.canDecide && (
                <>
                    <button className="btn btn-sm btn-primary" aria-label={`Approve ${who}'s advance`} onClick={(e) => { e.stopPropagation(); onAct("approve"); }}>Approve</button>
                    <button className="btn btn-sm" aria-label={`Decline ${who}'s advance`} onClick={(e) => { e.stopPropagation(); onAct("decline"); }}>Decline</button>
                </>
            )}
            {advance.canChange && (
                <>
                    <button className="btn btn-sm" aria-label={`Change ${who}'s months`} onClick={(e) => { e.stopPropagation(); onAct("change"); }}>Change months</button>
                    <button className="btn btn-sm" aria-label={`Settle ${who}'s advance`} onClick={(e) => { e.stopPropagation(); onAct("settle"); }}>Settle</button>
                </>
            )}
            {advance.canCancel && (
                <button className="btn btn-sm" aria-label={`Cancel ${who}'s advance`} onClick={(e) => { e.stopPropagation(); onAct("cancel"); }}>Cancel</button>
            )}
        </div>
    );
}

/** One of the three lists, a page at a time. */
function AdvanceList({ list, onOpen, onAct }: { list: (typeof LISTS)[number]; onOpen: (id: number) => void; onAct: (kind: Acting["kind"], advance: SalaryAdvance) => void }) {
    const [page, setPage] = useState(1);
    const query = useSalaryAdvances(list.view, page);
    const anchor = useRef<HTMLDivElement>(null);
    const data = query.data;
    return (
        <div className="panel mt" ref={anchor} aria-label={list.title}>
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">{list.title}{data ? ` · ${data.totalCount}` : ""}</div>
                    <div className="panel-sub">{list.sub}</div>
                </div>
            </div>
            {loadFailed(query) ? <div className="panel-body"><LoadError error={query.error} retry={() => query.refetch()} what="the advances" /></div>
                : !data ? <div className="panel-body"><SkeletonLines lines={3} /></div>
                    : data.items.length === 0 ? <Empty art="time" title={list.empty} text={list.emptyText} />
                        : (
                            <>
                                <div className="tbl-wrap">
                                    <table className="tbl">
                                        <thead>
                                            <tr><th>Person</th><th className="r">Amount</th><th>Comes off</th><th className="r">Left</th><th>Status</th><th /></tr>
                                        </thead>
                                        <tbody>
                                            {data.items.map((a) => (
                                                <tr key={a.id} className="click" {...clickable(() => onOpen(a.id))}>
                                                    <td>
                                                        <PersonLine person={{ id: a.person.id, name: a.person.name, photoFileId: a.person.photoFileId }} link={false} sub={a.person.departmentName ?? false} />
                                                        {a.reason && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{a.reason}</div>}
                                                    </td>
                                                    <td className="r mono nowrap">
                                                        {amountOf(a.amount, a.currency)}
                                                        {a.askedAmount != null && a.askedAmount !== a.amount && (
                                                            <div className="muted" style={{ fontSize: "10.5px", fontFamily: "inherit" }}>asked {amountOf(a.askedAmount, a.currency)}</div>
                                                        )}
                                                    </td>
                                                    <td><MonthChips advance={a} /></td>
                                                    <td className="r mono nowrap">
                                                        {a.left != null ? amountOf(a.left, a.currency) : "-"}
                                                        {a.repaid != null && a.repaid > 0 && (
                                                            <div className="muted" style={{ fontSize: "10.5px", fontFamily: "inherit" }}>{amountOf(a.repaid, a.currency)} repaid</div>
                                                        )}
                                                    </td>
                                                    <td><StatusCell advance={a} /></td>
                                                    <td className="r"><Actions advance={a} onAct={(kind) => onAct(kind, a)} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <Pager page={page} pageSize={PAGE_SIZE} total={data.totalCount} onPage={setPage} anchor={anchor} />
                            </>
                        )}
        </div>
    );
}

/** One advance in full, opened from a list or from a link (a notification). */
function AdvanceDetail({ id, onClose, onAct }: { id: number; onClose: () => void; onAct: (kind: Acting["kind"], advance: SalaryAdvance) => void }) {
    const query = useSalaryAdvance(id);
    const a = query.data;
    const cur = a?.currency ?? "USD";
    return (
        <Modal size="sm" title={a ? `${a.person.name}'s advance` : "Salary advance"} sub={a ? amountOf(a.amount, cur) : undefined} onClose={onClose}
            foot={a ? (
                <>
                    <div className="grow"><Actions advance={a} onAct={(kind) => onAct(kind, a)} /></div>
                    <button className="btn" onClick={onClose}>Close</button>
                </>
            ) : <button className="btn" onClick={onClose}>Close</button>}>
            {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="this advance" />
                : !a ? <SkeletonLines lines={6} /> : (
                    <>
                        <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}><StatusCell advance={a} /></div>
                        <div className="pay-lines">
                            {a.askedAmount != null && a.askedAmount !== a.amount && <div><span>Asked for</span><span className="mono">{amountOf(a.askedAmount, cur)}</span></div>}
                            <div><span>{a.status === "approved" ? "Given" : "Amount"}</span><span className="mono">{amountOf(a.amount, cur)}</span></div>
                            {a.givenOn && <div><span>Given on</span><span>{fmtDateY(a.givenOn)}</span></div>}
                            {a.repaid != null && <div><span>Repaid so far</span><span className="mono">{amountOf(a.repaid, cur)}</span></div>}
                            {a.left != null && <div className="pay-total"><span>Left to repay</span><span className="mono">{amountOf(a.left, cur)}</span></div>}
                        </div>
                        {a.reason && <p style={{ margin: "10px 0 0" }}><span className="muted">Reason: </span>{a.reason}</p>}
                        {a.months.length > 0 && (
                            <div className="mt">
                                <div className="u" style={{ marginBottom: 6 }}>Comes off</div>
                                <div className="pay-lines">
                                    {a.months.map((m) => (
                                        <div key={m.month}>
                                            <span>{fmtMonthY(m.month)}{m.closed ? " (closed)" : ""}</span>
                                            <span className="mono">{m.closed && m.taken != null ? `−${amountOf(m.taken, cur)}` : `−${amountOf(m.planned, cur)} planned`}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {a.settlement && (
                            <p style={{ margin: "10px 0 0" }}>
                                {a.settlement.kind === "cash" ? "Repaid in cash" : "Written off"}: {amountOf(a.settlement.amount, cur)} on {fmtDateY(a.settlement.settledOn)}
                                {a.settlement.settledByName ? `, by ${a.settlement.settledByName}` : ""}.
                                {a.settlement.note && <span className="muted"> {a.settlement.note}</span>}
                            </p>
                        )}
                        <div className="hint mt-s">
                            Asked {fmtDateY(a.createdAt)}
                            {a.decidedAt ? `. Decided ${fmtDateY(a.decidedAt)}${a.decidedByName ? ` by ${a.decidedByName}` : ""}` : ""}
                            {a.recordedByName ? `. Recorded by ${a.recordedByName}` : ""}
                            {a.cancelledAt ? `. Cancelled ${fmtDateY(a.cancelledAt)}` : ""}.
                            {a.decisionNote ? ` Note: ${a.decisionNote}` : ""}
                        </div>
                    </>
                )}
        </Modal>
    );
}

/**
 * Everyone's salary advances (salary_advance:manage): the requests waiting, the advances being paid back, and the
 * closed ones. Approving, declining, changing months, cancelling and settling open their own windows.
 */
export default function SalaryAdvances({ openId, onOpen }: { openId: number | null; onOpen: (id: number | null) => void }) {
    const [acting, setActing] = useState<Acting | null>(null);
    const act = (kind: Acting["kind"], advance: SalaryAdvance) => setActing({ kind, advance });
    const done = () => setActing(null);
    return (
        <>
            {LISTS.map((list) => <AdvanceList key={list.view} list={list} onOpen={onOpen} onAct={act} />)}
            {openId != null && <AdvanceDetail id={openId} onClose={() => onOpen(null)} onAct={act} />}
            {acting?.kind === "approve" && <ApproveAdvanceModal advance={acting.advance} onClose={done} />}
            {acting?.kind === "decline" && <DeclineAdvanceModal advance={acting.advance} onClose={done} />}
            {acting?.kind === "change" && <ChangeMonthsModal advance={acting.advance} onClose={done} />}
            {acting?.kind === "cancel" && <CancelAdvanceModal advance={acting.advance} onClose={done} />}
            {acting?.kind === "settle" && <SettleAdvanceModal advance={acting.advance} onClose={done} />}
        </>
    );
}
