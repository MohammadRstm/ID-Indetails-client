import { money } from "@/shared/format/money";
import { fmtDateY } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import { DocContinued, DocLetterhead } from "../../shared/billing/DocHead";
import type { DocFlash } from "../../shared/billing/invoiceDocData";
import type { Statement } from "./statementsApi";

type TypeRow = Statement["types"][number];
type Row = { type: TypeRow } | { hidden: { count: number; total: number } };

// Fewer rows on the first page, which carries the letterhead; the totals and payment summary close the last.
const FIRST = 16, NEXT = 30;

function pagesOf(rows: Row[]): Row[][] {
    const pages: Row[][] = [];
    let at = 0, size = FIRST;
    do {
        pages.push(rows.slice(at, at + size));
        at += size;
        size = NEXT;
    } while (at < rows.length);
    return pages;
}

const amountOrDash = (v: number) => (v === 0 ? "-" : money.exact(v));

/**
 * A client's materials statement (the prototype's EX.StatementDoc), laid out as the server's PDF is: one row
 * per material type at the client's prices, and where payment stands. Never cost, markup, supplier, labour
 * or profit. It is not an invoice, and says so.
 */
export default function StatementDoc({ statement: s, flash }: { statement: Statement; flash?: DocFlash }) {
    const split = s.mode === "detail" && s.includesEarlier;
    const kind = "Materials statement";
    const rows: Row[] = s.mode === "total" ? [] : [
        ...s.types.map((type) => ({ type })),
        ...(s.hiddenTypes?.count ? [{ hidden: s.hiddenTypes }] : []),
    ];
    const pages = pagesOf(rows);
    const fl = (key: string) => (flash?.key === key ? `doc-flash f${flash.n % 2}` : "");
    const head = split
        ? <tr><th>Material</th><th style={{ width: 96 }}>Quantity</th><th className="r" style={{ width: 112 }}>On earlier statements</th><th className="r" style={{ width: 100 }}>New this time</th><th className="r" style={{ width: 104 }}>Total</th></tr>
        : <tr><th>Material</th><th style={{ width: 120 }}>Quantity</th><th className="r" style={{ width: 130 }}>Amount</th></tr>;

    return (
        <div className="stmt-pages">
            {pages.map((page, i) => {
                const first = i === 0, last = i === pages.length - 1;
                return (
                    <div key={i} className={cx("rep-page doc stmt-doc", s.isPreview && "preview")}>
                        {s.isPreview && first && <div className="doc-watermark">Preview</div>}
                        {first ? (
                            <div>
                                <DocLetterhead kind={kind} number={s.number} />
                                <div className="doc-meta">
                                    <div><span>Prepared for</span><b>{s.client.displayName}</b></div>
                                    <div><span>Project</span><b>{s.projectTitle}</b></div>
                                    <div><span>Date</span><b>{fmtDateY(s.date)}</b></div>
                                </div>
                            </div>
                        ) : <DocContinued kind={kind} number={s.number} projectTitle={s.projectTitle} />}

                        <div className="rep-sec">
                            {first && <h3>Material type</h3>}
                            {s.mode === "total" ? (
                                <table className="tbl doc-lines">
                                    <thead><tr><th>Description</th><th className="r" style={{ width: 150 }}>Amount</th></tr></thead>
                                    <tbody>
                                        <tr className={fl("total")}>
                                            <td>
                                                Materials supplied{s.since ? ` since ${fmtDateY(s.since)}` : " to date"}
                                                <div className="stmt-sub">{s.count === 1 ? "1 item" : `${s.count} items`}</div>
                                            </td>
                                            <td className="r mono">{money.exact(s.total)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            ) : (
                                <table className={cx("tbl doc-lines stmt-typed", !split && "plain")}>
                                    <thead>{head}</thead>
                                    <tbody>
                                        {rows.length === 0 && <tr><td colSpan={split ? 5 : 3}><span className="doc-ph">No materials selected</span></td></tr>}
                                        {page.map((row, k) => "hidden" in row ? (
                                            <tr key={k} className="stmt-hidden-row">
                                                <td colSpan={split ? 4 : 2}>{row.hidden.count === 1 ? "1 more material type" : `${row.hidden.count} more material types`} from earlier statements, not listed again</td>
                                                <td className="r mono">{money.exact(row.hidden.total)}</td>
                                            </tr>
                                        ) : (
                                            <tr key={row.type.key} className={fl(`t:${row.type.key}`)}>
                                                <td>{row.type.label}{row.type.deliveries > 1 && <div className="stmt-sub">{row.type.deliveries} deliveries</div>}</td>
                                                <td className="mono">{row.type.quantity ?? "-"}</td>
                                                {split && <td className="r mono">{amountOrDash(row.type.earlier)}</td>}
                                                {split && <td className="r mono">{amountOrDash(row.type.new)}</td>}
                                                <td className="r mono">{split ? <b>{money.exact(row.type.total)}</b> : money.exact(row.type.total)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            {last ? (
                                <div className="doc-tot">
                                    {split && (
                                        <>
                                            <div><span>On earlier statements</span><b className="mono">{money.exact(s.earlierTotal)}</b></div>
                                            <div><span>New this time</span><b className="mono">{money.exact(s.newTotal)}</b></div>
                                        </>
                                    )}
                                    <div className={cx("big", fl("total"))}><span>Materials total</span><b className="mono">{money.exact(s.total)}</b></div>
                                </div>
                            ) : <div className="stmt-carry">continued on the next page</div>}
                        </div>

                        {last && (
                            <div className="rep-sec">
                                <h3>Payment summary</h3>
                                <div className="doc-tot" style={{ marginLeft: 0, width: "min(380px, 100%)" }}>
                                    <div><span>Received from you so far</span><b className="mono">{money.exact(s.received)}</b></div>
                                    {s.paidAhead > 0
                                        ? <div className="due"><span>Paid in advance</span><b className="mono">{money.exact(s.paidAhead)}</b></div>
                                        : <div className="due"><span>Remaining amount</span><b className="mono">{money.exact(s.remaining)}</b></div>}
                                </div>
                                <p style={{ marginTop: 8, fontSize: 11, color: "#6B7674" }}>
                                    The remaining amount is what is left of everything agreed on this project so far, after the payments above.
                                </p>
                            </div>
                        )}
                        <div className="rep-foot">
                            <span>{last ? "This is a statement of materials for your information. It is not an invoice." : s.number}</span>
                            <span className="mono">{pages.length > 1 ? `Page ${i + 1} of ${pages.length}` : s.number}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
