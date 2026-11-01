import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import Pager from "@/shared/components/Data-Tables/Pager";
import { Money } from "@/shared/components/Data/Money";
import { PageHead } from "@/shared/components/Data/Panel";
import Tabs from "@/shared/components/Data/Tabs";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import { SearchInput, Segmented } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { plural } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import { fmtDateY } from "@/shared/format/time";
import useDebounce from "@/shared/hooks/useDebounce";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { useProjects } from "../../shared/projects/projectsApi";
import {
    POCKET_NOTE_MAX, useApprovePocketRequest, useDenyPocketRequest, usePocket, usePocketEntries,
    type PocketEntry, type PocketEntryKind, type PocketRequest,
} from "./pocketApi";

const CONTRIBUTIONS_PAGE = 20;
const MOVES_PAGE = 30;

/** A pocket, stitched and slightly open: the pocket money at a glance. */
function PocketArt() {
    return (
        <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true" className="pocket-art">
            <path d="M22 26h76v40c0 22-17 38-38 38S22 88 22 66z" fill="var(--panel-2, var(--line))" stroke="var(--ink-3)" strokeWidth="3" strokeLinejoin="round" />
            <path d="M22 26h76l-6 16H28z" fill="var(--accent-soft)" stroke="var(--ink-3)" strokeWidth="3" strokeLinejoin="round" />
            <path d="M30 34h60M32 70c4 16 16 26 28 26s24-10 28-26" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
            <circle cx="60" cy="62" r="11" fill="var(--accent)" />
            <path d="M60 56v12M56.5 59.5h6a2.5 2.5 0 0 1 0 5h-5" fill="none" stroke="var(--surface)" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function MoneyIn({ amount }: { amount: number }) {
    return <span className={amount < 0 ? "mono down" : "mono up"}>{amount > 0 ? "+" : "−"}{money.exact(Math.abs(amount))}</span>;
}

/** Pays a site what the super admin chooses: the suggestion by default, at most what the pocket holds. */
function ApproveModal({ request, balance, onClose }: { request: PocketRequest; balance: number; onClose: () => void }) {
    const approve = useApprovePocketRequest();
    const suggested = request.suggestedNow ?? request.suggestedAmount;
    const [amount, setAmount] = useState(Math.min(suggested, Math.max(0, balance)));
    const [note, setNote] = useState("");
    const errors = useFormErrors();
    const amountError = amount <= 0 ? "Enter an amount." : amount > balance + 0.001 ? `The pocket money holds ${money.exact(balance)}.` : false;
    const noteError = note.trim().length > POCKET_NOTE_MAX && `At most ${POCKET_NOTE_MAX} characters.`;

    function submit() {
        if (approve.isPending) return;
        if (amountError || noteError) return errors.tried();
        approve.mutate({ id: request.id, amount, note: note.trim() || undefined }, {
            onSuccess: () => {
                toast({ text: `${money.fmt(amount)} paid to ${request.project.title}`, sub: "From the pocket money", icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal size="sm" title="Approve the request" sub={request.project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{approve.error && <FieldError message={errorMessage(approve.error)} />}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={approve.isPending} onClick={submit}><Icon name="check" />Approve and pay</button>
                </>
            }>
            <div className="field">
                <label className="label required" htmlFor="pocket-amount">Amount</label>
                <AmountField id="pocket-amount" value={amount} currency="USD" currencies={false} onChange={setAmount} onBlur={errors.touch("amount")} />
                <div className="hint">
                    Suggested {money.exact(suggested)}: what brings the site back to a 10% margin. The pocket money holds {money.exact(balance)}.
                </div>
                <FieldError message={errors.show("amount", amountError)} />
            </div>
            <div className="field mt">
                <label className="label" htmlFor="pocket-approve-note">Note</label>
                <AutoGrowTextarea id="pocket-approve-note" className="input" minRows={2} maxRows={6} maxLength={POCKET_NOTE_MAX} value={note}
                    onChange={(e) => setNote(e.target.value)} onBlur={errors.touch("note")} />
                <FieldError message={errors.show("note", noteError)} />
            </div>
        </Modal>
    );
}

function DenyModal({ request, onClose }: { request: PocketRequest; onClose: () => void }) {
    const deny = useDenyPocketRequest();
    const [note, setNote] = useState("");
    function submit() {
        if (deny.isPending || note.trim().length > POCKET_NOTE_MAX) return;
        deny.mutate({ id: request.id, note: note.trim() || undefined }, {
            onSuccess: () => {
                toast({ text: "Request denied", sub: request.project.title, icon: "checkCircle" });
                onClose();
            },
        });
    }
    return (
        <Modal size="sm" title="Deny the request?" sub={`${request.project.title} gets nothing from the pocket money.`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{deny.error && <FieldError message={errorMessage(deny.error)} />}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-danger" disabled={deny.isPending} onClick={submit}>Deny</button>
                </>
            }>
            <div className="field">
                <label className="label" htmlFor="pocket-deny-note">Why (optional)</label>
                <AutoGrowTextarea id="pocket-deny-note" className="input" minRows={2} maxRows={6} maxLength={POCKET_NOTE_MAX} value={note}
                    onChange={(e) => setNote(e.target.value)} />
            </div>
        </Modal>
    );
}

function Requests({ requests, balance }: { requests: PocketRequest[]; balance: number }) {
    const [approving, setApproving] = useState<PocketRequest | null>(null);
    const [denying, setDenying] = useState<PocketRequest | null>(null);
    return (
        <div className="panel mt" aria-label="Waiting for a decision">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Waiting for a decision</div>
                    <div className="panel-sub">Sites asking the pocket money for money. Approve the amount you choose, or deny it.</div>
                </div>
            </div>
            <table className="tbl">
                <thead><tr><th>Site</th><th>Asked</th><th className="r">Profit so far</th><th className="r">Suggested</th><th /></tr></thead>
                <tbody>
                    {requests.map((r) => (
                        <tr key={r.id}>
                            <td>
                                <Link to={`/execution/projects/${r.project.id}?tab=financials`} style={{ fontWeight: 600 }}>{r.project.title}</Link>
                                {r.note && <div className="muted" style={{ fontSize: 11.5 }}>{r.note}</div>}
                            </td>
                            <td>
                                {fmtDateY(r.requestedAt)}
                                <div className="muted" style={{ fontSize: 11.5 }}>{r.requestedBy?.name ?? "Raised by the system"}</div>
                            </td>
                            <td className={(r.cashProfit ?? 0) < 0 ? "r mono down" : "r mono"}>{r.cashProfit != null ? money.exact(r.cashProfit) : "-"}</td>
                            <td className="r mono">{money.exact(r.suggestedNow ?? r.suggestedAmount)}</td>
                            <td className="r">
                                <div className="row end" style={{ gap: 6 }}>
                                    <button className="btn btn-sm btn-primary" onClick={() => setApproving(r)} aria-label={`Approve ${r.project.title}`}>Approve</button>
                                    <button className="btn btn-sm" onClick={() => setDenying(r)} aria-label={`Deny ${r.project.title}`}>Deny</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {approving && <ApproveModal request={approving} balance={balance} onClose={() => setApproving(null)} />}
            {denying && <DenyModal request={denying} onClose={() => setDenying(null)} />}
        </div>
    );
}

function MovesTable({ items, out }: { items: PocketEntry[]; out?: boolean }) {
    return (
        <table className="tbl">
            <thead><tr><th>Date</th><th>{out ? "Paid to" : "From"}</th><th>Note</th><th>By</th><th className="r">Amount</th></tr></thead>
            <tbody>
                {items.map((e) => (
                    <tr key={e.id}>
                        <td className="mono">{fmtDateY(e.createdAt)}</td>
                        <td><Link to={`/execution/projects/${e.project.id}?tab=financials`}>{e.project.title}</Link></td>
                        <td className="muted">{e.note ?? "-"}</td>
                        <td>{e.by.name}</td>
                        <td className="r"><MoneyIn amount={e.amount} /></td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/** The latest contributions first, a page at a time to go further back. */
function Contributions() {
    const [page, setPage] = useState(1);
    const entries = usePocketEntries({ kind: "contribution", page, pageSize: CONTRIBUTIONS_PAGE });
    const anchor = useRef<HTMLDivElement>(null);
    const data = entries.data;
    return (
        <div className="panel mt" ref={anchor} aria-label="Contributions">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Contributions</div>
                    <div className="panel-sub">Money moved into the pocket from each site, latest first.</div>
                </div>
            </div>
            {loadFailed(entries) ? <div className="panel-body"><LoadError error={entries.error} retry={() => entries.refetch()} what="the contributions" /></div>
                : !data ? <div className="panel-body"><SkeletonLines lines={4} /></div>
                    : data.items.length === 0 ? <Empty art="search" title="Nothing moved in yet" text="Move part of a site's money in from its Financials tab." />
                        : (
                            <>
                                <MovesTable items={data.items} />
                                <Pager page={page} pageSize={CONTRIBUTIONS_PAGE} total={data.totalCount} onPage={setPage} anchor={anchor} />
                            </>
                        )}
        </div>
    );
}

type Direction = "in" | "out";

/** Every movement, incoming or outgoing, searched and filtered by the API, 30 a page. */
function Transactions() {
    const [direction, setDirection] = useState<Direction>("in");
    const [search, setSearch] = useState("");
    const [project, setProject] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [page, setPage] = useState(1);
    const words = useDebounce({ value: search.trim(), debounceTimeMs: 300 });
    const kind: PocketEntryKind = direction === "in" ? "contribution" : "payout";
    const entries = usePocketEntries({ kind, search: words, projectId: project ? +project : null, from, to, page, pageSize: MOVES_PAGE });
    const sites = useProjects({ domain: "execution", pageSize: 100 }).data?.items ?? [];
    const anchor = useRef<HTMLDivElement>(null);
    const data = entries.data;
    const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
    const filtered = !!(words || project || from || to);

    return (
        <div className="panel mt" ref={anchor} aria-label="Transactions">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Transactions</div>
                    {data && <div className="panel-sub">{plural(data.totalCount, "movement")}</div>}
                </div>
                <Segmented aria-label="Direction" value={direction} onChange={reset(setDirection)}
                    options={[{ value: "in", label: "Incoming" }, { value: "out", label: "Outgoing" }]} />
            </div>
            <div className="panel-body">
                <div className="row wrap" style={{ gap: 8 }}>
                    <SearchInput value={search} onChange={reset(setSearch)} placeholder="Search site, note or person" width={240} aria-label="Search the transactions" />
                    <Select value={project} onChange={reset(setProject)} aria-label="Filter by site"
                        options={[{ value: "", label: "All sites" }, ...sites.map((p) => ({ value: String(p.id), label: p.title }))]} />
                    <DateInput className="input" style={{ width: 140 }} value={from} max={to || undefined} onChange={reset(setFrom)} placeholder="From" aria-label="From day" />
                    <DateInput className="input" style={{ width: 140 }} value={to} min={from || undefined} onChange={reset(setTo)} placeholder="To" aria-label="To day" />
                    {filtered && (
                        <button className="btn btn-sm btn-quiet" onClick={() => { setSearch(""); setProject(""); setFrom(""); setTo(""); setPage(1); }}>Clear</button>
                    )}
                </div>
            </div>
            {loadFailed(entries) ? <div className="panel-body"><LoadError error={entries.error} retry={() => entries.refetch()} what="the transactions" /></div>
                : !data ? <div className="panel-body"><SkeletonLines lines={4} /></div>
                    : data.items.length === 0 ? (
                        <Empty art="search" title={filtered ? "No movement matches" : direction === "in" ? "Nothing moved in yet" : "Nothing paid out yet"}
                            text={filtered ? "Try other words, another site or other days." : undefined} />
                    ) : (
                        <>
                            <MovesTable items={data.items} out={direction === "out"} />
                            <Pager page={page} pageSize={MOVES_PAGE} total={data.totalCount} onPage={setPage} anchor={anchor} />
                        </>
                    )}
        </div>
    );
}

type PocketTab = "pocket" | "transactions";

/** Execution's pocket money (financial:view): money set aside from sites, and paid back to those that run short. */
export default function PocketPage() {
    const pocket = usePocket();
    const [params, setParams] = useSearchParams();
    const tab: PocketTab = params.get("tab") === "transactions" ? "transactions" : "pocket";
    const p = pocket.data;
    function pick(next: PocketTab) {
        if (next === "pocket") params.delete("tab");
        else params.set("tab", next);
        setParams(params, { replace: true });
    }

    return (
        <div className="page">
            <PageHead title="Pocket money" sub="Money set aside from Execution sites by hand, and paid back to sites that run short when a super admin approves." />
            <Tabs value={tab} onChange={pick} items={[{ key: "pocket", label: "Pocket" }, { key: "transactions", label: "Transactions" }]} />
            {tab === "transactions" ? <Transactions />
                : loadFailed(pocket) ? <LoadError error={pocket.error} retry={() => pocket.refetch()} what="the pocket money" />
                    : !p ? <SkeletonLines lines={6} />
                        : (
                            <>
                                <div className="panel mt pocket-hero" aria-label="In the pocket">
                                    <PocketArt />
                                    <div className="u">In the pocket</div>
                                    <Money value={p.balance} size="xl" tone={p.balance < 0 ? "down" : ""} />
                                    <div className="muted" style={{ fontSize: 12 }}>
                                        {money.exact(p.contributedTotal)} moved in · {money.exact(p.paidOutTotal)} paid out
                                    </div>
                                </div>
                                <Contributions />
                                {p.pending.length > 0 && <Requests requests={p.pending} balance={p.balance} />}
                            </>
                        )}
        </div>
    );
}
