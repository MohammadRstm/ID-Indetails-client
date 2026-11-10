import { useState } from "react";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { plural } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import type { Project } from "../../shared/projects/projectsApi";
import { boqTotal, KIND_LABEL } from "./boqRules";
import { useBoq, type Boq, type BoqList, type BoqSummary } from "./boqsApi";

const cents = (amount: number) => money.exact(amount, "USD", { cents: true, twoDecimals: true });
const quantityText = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const percentText = (fraction: number) => `${Math.round(fraction * 10000) / 100}%`;

/**
 * Under a client BOQ: the site's other BOQs, internal drafts first (the engineers' estimates), then the other client
 * BOQs and the VOs. Clicking one opens it here, read-only and scrolling on its own, so it can be read line by line while
 * the client BOQ is written above; clicking it again closes it. Lines are copied with "Copy lines from…".
 */
export default function BoqReferences({ project, boq, list }: { project: Project; boq: Boq; list: BoqList | undefined }) {
    const others = [...(list?.internal ?? []), ...(list?.client ?? []), ...(list?.vos ?? [])].filter((b) => b.id !== boq.id && b.lineCount > 0);
    const [open, setOpen] = useState<number | null>(null);
    if (others.length === 0) return null;

    return (
        <section className="boq-refs mt" aria-label="Other BOQs">
            <div className="spread" style={{ marginBottom: 6 }}>
                <span className="u">Other BOQs · {others.length}</span>
                <span className="muted" style={{ fontSize: 12 }}>Open one to read it here while you write this BOQ</span>
            </div>
            <div className="chips" role="tablist" aria-label="Other BOQs">
                {others.map((b) => (
                    <button key={b.id} type="button" role="tab" aria-selected={open === b.id} className={cx("chip", open === b.id && "on")}
                        title={`${KIND_LABEL[b.kind]} by ${b.author.name}`} onClick={() => setOpen(open === b.id ? null : b.id)}>
                        <Icon name="file" />
                        {b.number ?? b.title}
                        <span className="cnt">{plural(b.lineCount, "line")} · {cents(boqTotal(b))}</span>
                    </button>
                ))}
            </div>
            {open != null && <OpenBoq project={project} summary={others.find((b) => b.id === open)!} />}
        </section>
    );
}

function OpenBoq({ project, summary }: { project: Project; summary: BoqSummary }) {
    const query = useBoq(project.id, summary.id);
    const boq = query.data;
    return (
        <div className="boq-ref panel mt-s" role="tabpanel" aria-label={summary.number ?? summary.title}>
            <div className="boq-ref-head">
                <div className="grow">
                    <b>{summary.number ? `${summary.number} · ${summary.title}` : summary.title}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                        {KIND_LABEL[summary.kind]} by {summary.author.name} · {plural(summary.lineCount, "line")} · {cents(boqTotal(summary))}
                        {summary.status === "agreed" ? " · agreed" : ""}
                    </div>
                </div>
            </div>
            {!boq ? <div className="panel-body"><SkeletonLines lines={6} /></div> : (
                <div className="boq-ref-scroll">
                    <table className="sh boq-ref-table" aria-label={`Lines of ${summary.number ?? summary.title}`}>
                        <colgroup>
                            <col style={{ width: 36 }} />
                            <col style={{ width: 86 }} />
                            <col />
                            <col style={{ width: 90 }} />
                            <col style={{ width: 64 }} />
                            <col style={{ width: 90 }} />
                            <col style={{ width: 64 }} />
                            <col style={{ width: 100 }} />
                            <col style={{ width: 120 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="sh-n">#</th>
                                <th>Code</th>
                                <th>Description</th>
                                <th className="r">Quantity</th>
                                <th className="r">Waste</th>
                                <th className="r">Final qty</th>
                                <th>Unit</th>
                                <th className="r">Unit cost</th>
                                <th className="r">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {boq.lines.map((l, i) => (
                                <tr key={l.id} className={cx(l.nature === "permit" && "boq-ref-permit")}>
                                    <td className="sh-n">{i + 1}</td>
                                    <td className="mono">{l.code ?? ""}</td>
                                    <td>{l.nature === "permit" ? `Permit: ${l.description}` : l.description}</td>
                                    <td className="r mono">{quantityText(l.quantity)}</td>
                                    <td className="r mono">{l.wasteRate ? percentText(l.wasteRate) : ""}</td>
                                    <td className="r mono">{quantityText(l.finalQuantity)}</td>
                                    <td>{l.unit ?? ""}</td>
                                    <td className="r mono">{cents(l.rate)}</td>
                                    <td className="r mono">{cents(l.totalUsd)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
