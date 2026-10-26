import { useRef, useState } from "react";
import { Link } from "react-router";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import Pager from "@/shared/components/Data-Tables/Pager";
import { Money } from "@/shared/components/Data/Money";
import { PageHead } from "@/shared/components/Data/Panel";
import { StatusBadge } from "@/shared/components/Data/Pills";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { plural } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import { fmtDateY } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { BOX_ENTRY_LABEL, BOX_NOTE_MAX, useBox, useBoxEntries, useDecideBox, useMoveMoney, type BoxProject } from "./boxApi";

const ENTRIES_PAGE = 20;

/** A safe door, its dial and the balance under it: the box at a glance. */
function Vault({ balance, contributing }: { balance: number; contributing: number }) {
    return (
        <div className="panel box-vault">
            <svg viewBox="0 0 120 120" width="112" height="112" aria-hidden="true" className="box-vault-art">
                <rect x="8" y="8" width="104" height="104" rx="14" fill="var(--panel-2, var(--line))" stroke="var(--ink-3)" strokeWidth="3" />
                <rect x="20" y="20" width="80" height="80" rx="9" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeDasharray="4 4" />
                <circle cx="60" cy="60" r="20" fill="none" stroke="var(--accent)" strokeWidth="4" />
                <circle cx="60" cy="60" r="4" fill="var(--accent)" />
                {[0, 60, 120, 180, 240, 300].map((a) => (
                    <line key={a} x1="60" y1="38" x2="60" y2="44" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" transform={`rotate(${a} 60 60)`} />
                ))}
                <rect x="96" y="44" width="8" height="32" rx="3" fill="var(--ink-3)" />
            </svg>
            <div>
                <div className="u">In the box</div>
                <Money value={balance} size="xl" tone={balance < 0 ? "down" : ""} />
                <div className="muted" style={{ fontSize: 12 }}>
                    What Execution clients paid, pooled from {plural(contributing, "project")}, less what was moved to sites in the red.
                </div>
            </div>
        </div>
    );
}

function ProjectLink({ p }: { p: BoxProject }) {
    return (
        <>
            <Link to={`/execution/projects/${p.id}`} style={{ fontWeight: 600 }}>{p.title}</Link>
            {p.clientName && <div className="muted" style={{ fontSize: 11.5 }}>{p.clientName}</div>}
        </>
    );
}

/** Money from the box to a project in the red: never more than the box holds or what brings the project to zero. */
function MoveMoneyModal({ project, balance, onClose }: { project: BoxProject; balance: number; onClose: () => void }) {
    const move = useMoveMoney();
    const deficit = -project.cashProfit;
    const most = Math.max(0, Math.min(balance, deficit));
    const [amount, setAmount] = useState(Math.round(most * 100) / 100);
    const [note, setNote] = useState("");
    const errors = useFormErrors();
    const amountError = amount <= 0 ? "Enter an amount."
        : amount > deficit + 0.001 ? `${money.exact(deficit)} brings the project back to zero: move at most that.`
            : amount > balance + 0.001 ? `The box holds ${money.exact(balance)}.` : false;
    const noteError = note.trim().length > BOX_NOTE_MAX && `At most ${BOX_NOTE_MAX} characters.`;

    function submit() {
        if (move.isPending) return;
        if (amountError || noteError) return errors.tried();
        move.mutate({ projectId: project.id, amount, note: note.trim() || undefined }, {
            onSuccess: () => {
                toast({ text: `${money.fmt(amount)} moved to ${project.title}`, sub: "From the box", icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal size="sm" title="Move money" sub={`From the box to ${project.title}`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{move.error && <FieldError message={errorMessage(move.error)} />}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={move.isPending} onClick={submit}><Icon name="send" />Move money</button>
                </>
            }>
            <div className="field">
                <label className="label required" htmlFor="box-amount">Amount</label>
                <AmountField id="box-amount" value={amount} currency="USD" currencies={false} onChange={setAmount} onBlur={errors.touch("amount")} />
                <div className="hint">It is {money.exact(deficit)} in the red; the box holds {money.exact(balance)}. It counts in the project's profit as from the box.</div>
                <FieldError message={errors.show("amount", amountError)} />
            </div>
            <div className="field mt">
                <label className="label" htmlFor="box-note">Note</label>
                <AutoGrowTextarea id="box-note" className="input" minRows={2} maxRows={6} maxLength={BOX_NOTE_MAX} value={note}
                    placeholder="e.g. Covers the tiles until the client pays." onChange={(e) => setNote(e.target.value)} onBlur={errors.touch("note")} />
                <FieldError message={errors.show("note", noteError)} />
            </div>
        </Modal>
    );
}

function Pending({ projects }: { projects: BoxProject[] }) {
    const decide = useDecideBox();
    function run(p: BoxProject, decision: "remove" | "keep") {
        decide.mutate({ projectId: p.id, decision }, {
            onSuccess: () => toast({ text: decision === "remove" ? `${p.title}'s revenue left the box` : `${p.title} stays in the box`, icon: "checkCircle" }),
            onError: (e) => toast({ text: "Nothing changed", sub: errorMessage(e), icon: "alert" }),
        });
    }
    return (
        <div className="panel mt" aria-label="Waiting for a decision">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Waiting for a decision</div>
                    <div className="panel-sub">Closed by someone who can't see money. Remove each one's revenue from the box, or keep it.</div>
                </div>
            </div>
            <table className="tbl">
                <thead><tr><th>Project</th><th>Status</th><th className="r">Put in</th><th /></tr></thead>
                <tbody>
                    {projects.map((p) => (
                        <tr key={p.id}>
                            <td><ProjectLink p={p} /></td>
                            <td><StatusBadge status={p.status} /></td>
                            <td className="r mono">{money.exact(p.contributed)}</td>
                            <td className="r">
                                <div className="row end" style={{ gap: 6 }}>
                                    <button className="btn btn-sm btn-primary" disabled={decide.isPending} onClick={() => run(p, "remove")}>Remove</button>
                                    <button className="btn btn-sm" disabled={decide.isPending} onClick={() => run(p, "keep")}>Keep</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Transactions() {
    const [page, setPage] = useState(1);
    const entries = useBoxEntries(page, ENTRIES_PAGE);
    const anchor = useRef<HTMLDivElement>(null);
    const data = entries.data;
    return (
        <div className="panel mt" ref={anchor} aria-label="Transactions">
            <div className="panel-head"><div className="panel-title">Transactions</div></div>
            {loadFailed(entries) ? <div className="panel-body"><LoadError error={entries.error} retry={() => entries.refetch()} what="the transactions" /></div>
                : !data ? <div className="panel-body"><SkeletonLines lines={4} /></div>
                    : data.items.length === 0 ? <Empty art="search" title="Nothing yet" text="Client payments of Execution sites appear here as they arrive." />
                        : (
                            <>
                                <table className="tbl">
                                    <thead><tr><th>Date</th><th>What</th><th>Project</th><th>By</th><th className="r">Amount</th></tr></thead>
                                    <tbody>
                                        {data.items.map((e) => (
                                            <tr key={e.id}>
                                                <td className="mono">{fmtDateY(e.createdAt)}</td>
                                                <td>
                                                    {BOX_ENTRY_LABEL[e.kind]}
                                                    {e.note && <div className="muted" style={{ fontSize: 11.5 }}>{e.note}</div>}
                                                </td>
                                                <td><Link to={`/execution/projects/${e.project.id}`}>{e.project.title}</Link></td>
                                                <td>{e.by?.name ?? <span className="muted">Automatic</span>}</td>
                                                <td className={e.amount < 0 ? "r mono down" : "r mono up"}>{e.amount > 0 ? "+" : e.amount < 0 ? "−" : ""}{money.exact(Math.abs(e.amount))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <Pager page={page} pageSize={ENTRIES_PAGE} total={data.totalCount} onPage={setPage} anchor={anchor} />
                            </>
                        )}
        </div>
    );
}

/** Execution's box: the pool of its sites' client payments, and where it went (financial:view). */
export default function BoxPage() {
    const box = useBox();
    const [moving, setMoving] = useState<BoxProject | null>(null);
    const b = box.data;

    return (
        <div className="page">
            <PageHead title="The box" sub="Every Execution site's client payments go into one box. Sites in the red are kept going from it." />
            {loadFailed(box) ? <LoadError error={box.error} retry={() => box.refetch()} what="the box" />
                : !b ? <SkeletonLines lines={6} />
                    : (
                        <>
                            <Vault balance={b.balance} contributing={b.contributing.length} />

                            {b.pending.length > 0 && <Pending projects={b.pending} />}

                            <div className="panel mt" aria-label="In the red">
                                <div className="panel-head">
                                    <div>
                                        <div className="panel-title">In the red</div>
                                        <div className="panel-sub">Sites that have spent more than they got. Money moved here counts in their profit as from the box.</div>
                                    </div>
                                </div>
                                {b.inTheRed.length === 0 ? <Empty art="search" title="No site is in the red" />
                                    : (
                                        <table className="tbl">
                                            <thead><tr><th>Project</th><th>Status</th><th className="r">From the box</th><th className="r">Profit so far</th><th /></tr></thead>
                                            <tbody>
                                                {b.inTheRed.map((p) => (
                                                    <tr key={p.id}>
                                                        <td><ProjectLink p={p} /></td>
                                                        <td><StatusBadge status={p.status} /></td>
                                                        <td className="r mono">{p.fromBox ? money.exact(p.fromBox) : "-"}</td>
                                                        <td className="r mono down">{money.exact(p.cashProfit)}</td>
                                                        <td className="r">
                                                            <button className="btn btn-sm" disabled={b.balance <= 0} onClick={() => setMoving(p)} aria-label={`Move money to ${p.title}`}>
                                                                <Icon name="send" />Move money
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                            </div>

                            <div className="panel mt" aria-label="Contributing projects">
                                <div className="panel-head">
                                    <div>
                                        <div className="panel-title">Contributing projects</div>
                                        <div className="panel-sub">Open sites, and closed ones kept in the box: what their clients paid in.</div>
                                    </div>
                                </div>
                                {b.contributing.length === 0 ? <Empty art="search" title="No project puts money in yet" />
                                    : (
                                        <table className="tbl">
                                            <thead><tr><th>Project</th><th>Status</th><th className="r">From the box</th><th className="r">Put in</th></tr></thead>
                                            <tbody>
                                                {b.contributing.map((p) => (
                                                    <tr key={p.id}>
                                                        <td><ProjectLink p={p} /></td>
                                                        <td><StatusBadge status={p.status} />{p.boxState === "pending" && <span className="badge" style={{ marginLeft: 6 }}>Decision due</span>}</td>
                                                        <td className="r mono">{p.fromBox ? money.exact(p.fromBox) : "-"}</td>
                                                        <td className="r mono">{money.exact(p.contributed)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr>
                                                    <td colSpan={3}><b>Total put in</b></td>
                                                    <td className="r mono" style={{ fontWeight: 700 }}>{money.exact(b.contributedTotal)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    )}
                            </div>

                            <Transactions />
                            {moving && <MoveMoneyModal project={moving} balance={b.balance} onClose={() => setMoving(null)} />}
                        </>
                    )}
        </div>
    );
}
