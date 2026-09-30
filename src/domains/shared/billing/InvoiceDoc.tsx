import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useCompanySettings } from "@/app/shell/shellQueries";
import Logo from "@/shared/components/Identity/Logo";
import { money } from "@/shared/format/money";
import { addDays, companyToday, fmtDateY } from "@/shared/format/time";
import { cx } from "@/shared/utils/cx";
import type { BillingSettings } from "./billingApi";
import type { DocFlash, DocInvoice } from "./invoiceDocData";

// Long invoices run over several pages: the letterhead opens the first, later ones carry a "continued"
// strip, and the totals, notes and payment details close the last.
const FIRST = 12, NEXT = 26, LAST_ALONE = 8, LAST = 20;

function pagesOf<T>(lines: T[]): { line: T; i: number }[][] {
    const pages: { line: T; i: number }[][] = [];
    let at = 0, size = FIRST;
    do {
        pages.push(lines.slice(at, at + size).map((line, k) => ({ line, i: at + k })));
        at += size;
        size = NEXT;
    } while (at < lines.length);
    const cap = pages.length === 1 ? LAST_ALONE : LAST;
    const last = pages[pages.length - 1];
    if (last.length > cap) pages.push(last.splice(cap));
    return pages;
}

type InvoiceDocProps = {
    invoice: DocInvoice;
    settings: BillingSettings | undefined;
    /** The invoice as it is being written: dates as they will be if it is sent today, empty lines marked. */
    preview?: boolean;
    flash?: DocFlash;
};

/**
 * The invoice the client receives (the prototype's BL.InvoiceDoc), laid out as the server's PDF is. It only
 * reads what is on the invoice: never hours, rates, labour cost, names of employees, profit or margin.
 */
export default function InvoiceDoc({ invoice: inv, settings, preview = false, flash }: InvoiceDocProps) {
    const company = useCompanySettings().data;
    const today = companyToday();
    const pages = pagesOf(inv.lines);
    const fl = (key: string) => (flash?.key === key ? `doc-flash f${flash.n % 2}` : "");
    const number = inv.number ?? "Draft";
    const contact = [company?.website, company?.address].filter(Boolean).join(" · ");
    const due = preview ? (inv.termsDays ? fmtDateY(addDays(today, inv.termsDays)) : "On receipt")
        : inv.dueOn ? fmtDateY(inv.dueOn) : inv.termsDays > 0 ? `Net ${inv.termsDays}` : "On receipt";
    const terms = inv.termsDays > 0 ? `Payment due within ${inv.termsDays} days of the invoice date.` : "Payment due on receipt.";
    const bank = [
        ["Account name", settings?.bankAccount], ["Bank", settings?.bankName], ["IBAN", settings?.iban], ["SWIFT", settings?.swift],
    ].filter((f): f is [string, string] => !!f[1]);

    return (
        <div className="doc-pages">
            {pages.map((rows, pi) => {
                const first = pi === 0, last = pi === pages.length - 1;
                return (
                    <div key={pi} className={cx("rep-page doc paged", preview && "preview")}>
                        {preview && first && <div className="doc-watermark">Draft</div>}
                        {first ? (
                            <div>
                                <div className="rep-head">
                                    <Logo size={34} />
                                    <div className="grow">
                                        <div className="rep-title">{company?.name ?? ""}</div>
                                        {contact && <div style={{ fontSize: "11.5px", color: "#46514F" }}>{contact}</div>}
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        <div className="doc-kind">Invoice</div>
                                        <div className="mono" style={{ fontSize: 13, fontWeight: 650 }}>{number}</div>
                                        {inv.voided && <div className="doc-void">VOID</div>}
                                    </div>
                                </div>

                                <div className="doc-meta">
                                    <div>
                                        <span>Billed to</span>
                                        <b>{inv.billToName}</b>
                                        {inv.billToContact && <div>{inv.billToContact}</div>}
                                    </div>
                                    <div>
                                        <span>Project</span>
                                        <b>{inv.projectTitle}</b>
                                    </div>
                                    <div>
                                        <span>Issue date</span>
                                        <b>{preview ? fmtDateY(today) : inv.issuedAt ? fmtDateY(inv.issuedAt) : "Not issued"}</b>
                                        {preview && <div className="doc-hint">if sent today</div>}
                                        <span style={{ marginTop: 8 }}>Due date</span>
                                        <b className={fl("terms")}>{due}</b>
                                        {preview && inv.termsDays > 0 && <div className="doc-hint">Net {inv.termsDays}</div>}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="stmt-cont">
                                <span><b>{company?.name ?? ""}</b> · Invoice {number}</span>
                                <span>{inv.projectTitle} · continued</span>
                            </div>
                        )}

                        <div className="rep-sec">
                            {first && <h3>Details</h3>}
                            {rows.length > 0 && (
                                <table className="tbl doc-lines">
                                    <thead><tr><th>Description</th><th className="r" style={{ width: 130 }}>Amount</th></tr></thead>
                                    <tbody>
                                        {rows.map(({ line, i }) => (
                                            <tr key={i} className={fl(`line-${i}`)}>
                                                <td>{line.description || (preview ? <span className="doc-ph">Description of line {i + 1}</span> : "")}</td>
                                                <td className="r mono">{preview && !line.amount ? <span className="doc-ph">$0</span> : money.exact(line.amount || 0)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            {last ? (
                                <div className="doc-tot">
                                    <div><span>Subtotal</span><b className={cx("mono", fl("total"))}>{money.exact(inv.total)}</b></div>
                                    <div className="big"><span>Total</span><b className={cx("mono", fl("total"))}>{money.exact(inv.total)}</b></div>
                                    {inv.paid > 0.5 && <div><span>Received to date</span><b className="mono">{money.exact(-inv.paid)}</b></div>}
                                    <div className="due"><span>Amount due</span><b className={cx("mono", fl("total"))}>{money.exact(inv.balance)}</b></div>
                                </div>
                            ) : <div className="stmt-carry">continued on the next page</div>}
                        </div>

                        {last && inv.notes && (
                            <div className={cx("rep-sec", fl("notes"))}><h3>Notes</h3><p style={{ fontSize: 12, color: "#46514F" }}>{inv.notes}</p></div>
                        )}

                        {last && (
                            <div className="rep-sec">
                                <h3>How to pay</h3>
                                {bank.length > 0 && (
                                    <div className="rep-sum" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
                                        {bank.map(([k, v]) => <div key={k}><span>{k}</span><b className={k === "IBAN" || k === "SWIFT" ? "mono" : undefined} style={{ fontSize: k === "IBAN" ? 12 : "12.5px" }}>{v}</b></div>)}
                                    </div>
                                )}
                                <p style={{ marginTop: 10, fontSize: "11.5px", color: "#46514F" }}>
                                    <span className={fl("terms")}>{terms}</span> Please quote the invoice number with your transfer.{settings?.termsText ? ` ${settings.termsText}` : ""}
                                </p>
                            </div>
                        )}

                        <div className="rep-foot">
                            <span>{last ? settings?.footer ?? "" : number}</span>
                            <span className="mono">{pages.length > 1 ? `Page ${pi + 1} of ${pages.length}` : number}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * The document laid out at its real page width and shrunk to fit the column, so the preview is the actual
 * document, smaller, not a separate mock-up that could drift from it (the prototype's ScaledDoc).
 */
export function ScaledDoc({ children }: { children: ReactNode }) {
    const outer = useRef<HTMLDivElement>(null);
    const inner = useRef<HTMLDivElement>(null);
    const [fit, setFit] = useState({ k: 1, h: 0 });
    useLayoutEffect(() => {
        const measure = () => {
            const page = inner.current?.firstElementChild as HTMLElement | null | undefined;
            if (!outer.current || !page) return;
            const k = Math.min(1, outer.current.clientWidth / page.offsetWidth);
            const h = Math.ceil(page.offsetHeight * k);
            setFit((f) => (Math.abs(f.k - k) < 0.001 && f.h === h ? f : { k, h }));
        };
        measure();
        const ro = new ResizeObserver(measure);
        if (outer.current) ro.observe(outer.current);
        const page = inner.current?.firstElementChild;
        if (page) ro.observe(page);
        return () => ro.disconnect();
    }, []);
    return (
        <div className="doc-scale" ref={outer} style={{ height: fit.h ? fit.h : undefined }}>
            <div className="doc-scale-in" ref={inner} style={{ transform: `scale(${fit.k})` }}>{children}</div>
        </div>
    );
}
