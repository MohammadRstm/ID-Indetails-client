import { useRef, useState, type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import Pager from "@/shared/components/Data-Tables/Pager";
import { Money } from "@/shared/components/Data/Money";
import { PageHead } from "@/shared/components/Data/Panel";
import { StatusBadge } from "@/shared/components/Data/Pills";
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
import {
    BOX_ENTRY_LABEL, BOX_NOTE_MAX, useBox, useBoxEntries, useDecideBox, useMoveMoney, type Box, type BoxEntryKind, type BoxProject,
} from "./boxApi";

const ENTRIES_PAGE = 30;

/** A safe door, its dial and the balance under it: the box at a glance. */
function Vault({ balance, contributing }: { balance: number; contributing: number }) {
    return (
        <div className="panel box-vault mt">
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

/** The projects putting money in, and those in the red that have left the box: each once. */
function projectsOf(box: Box): BoxProject[] {
    return [...box.contributing, ...box.inTheRed.filter((r) => !box.contributing.some((c) => c.id === r.id))];
}

type Standing = "all" | "red" | "green";
type Sort = "profit" | "contributed" | "fromBox" | "title";

const SORTS: { value: Sort; label: string }[] = [
    { value: "profit", label: "Deepest in the red first" },
    { value: "contributed", label: "Most put in first" },
    { value: "fromBox", label: "Most from the box first" },
    { value: "title", label: "Name, A to Z" },
];

/** How red a project's profit cell is, in %: the deeper in the red, from a light 12% tint up to 60% for the deepest. */
function redness(cashProfit: number, deepest: number): number | null {
    if (cashProfit >= 0 || deepest <= 0) return null;
    return Math.round(12 + Math.min(1, -cashProfit / deepest) * 48);
}

const tinted = (red: number | null): CSSProperties | undefined =>
    red == null ? undefined : { background: `color-mix(in srgb, var(--loss) ${red}%, transparent)`, fontWeight: 600 };

/** The vault, then every project of the box with filters and sorting; a project in the red takes money from here. */
function Contributors({ box, onMove }: { box: Box; onMove: (p: BoxProject) => void }) {
    const [search, setSearch] = useState("");
    const [standing, setStanding] = useState<Standing>("all");
    const [sort, setSort] = useState<Sort>("profit");
    const all = projectsOf(box);
    const deepest = Math.max(0, ...all.map((p) => -p.cashProfit));
    const words = search.trim().toLowerCase().split(" ").filter(Boolean);
    const rows = all
        .filter((p) => standing === "all" || (standing === "red" ? p.cashProfit < 0 : p.cashProfit >= 0))
        .filter((p) => words.every((w) => `${p.title} ${p.clientName ?? ""}`.toLowerCase().includes(w)))
        .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title)
            : sort === "contributed" ? b.contributed - a.contributed
                : sort === "fromBox" ? b.fromBox - a.fromBox
                    : a.cashProfit - b.cashProfit);
    const red = all.filter((p) => p.cashProfit < 0).length;

    return (
        <>
            <Vault balance={box.balance} contributing={box.contributing.length} />

            <div className="panel mt" aria-label="Projects">
                <div className="panel-head">
                    <div className="grow">
                        <div className="panel-title">Projects</div>
                        <div className="panel-sub">
                            What each site put in, what the box moved to it, and its profit so far. {red ? `${plural(red, "site")} in the red.` : "No site is in the red."}
                        </div>
                    </div>
                </div>
                <div className="panel-body">
                    <div className="row wrap" style={{ gap: 8 }}>
                        <SearchInput value={search} onChange={setSearch} placeholder="Search a project or client" width={240} aria-label="Search the projects" />
                        <Segmented aria-label="Profit so far" value={standing} onChange={setStanding}
                            options={[{ value: "all", label: "All" }, { value: "red", label: "In the red" }, { value: "green", label: "In the green" }]} />
                        <Select value={sort} onChange={setSort} aria-label="Sort the projects" options={SORTS} />
                    </div>
                </div>
                {all.length === 0 ? <Empty art="search" title="No project puts money in yet" />
                    : rows.length === 0 ? <Empty art="search" title="No project matches" text="Try other words, or show every project." />
                        : (
                            <table className="tbl">
                                <thead>
                                    <tr><th>Project</th><th>Status</th><th className="r">Put in</th><th className="r">From the box</th><th className="r">Profit so far</th><th /></tr>
                                </thead>
                                <tbody>
                                    {rows.map((p) => (
                                        <tr key={p.id}>
                                            <td><ProjectLink p={p} /></td>
                                            <td>
                                                <StatusBadge status={p.status} />
                                                {p.boxState === "pending" && <span className="badge" style={{ marginLeft: 6 }}>Decision due</span>}
                                                {p.boxState === "removed" && <span className="badge" style={{ marginLeft: 6 }}>Out of the box</span>}
                                            </td>
                                            <td className="r mono">{money.exact(p.contributed)}</td>
                                            <td className="r mono">{p.fromBox ? money.exact(p.fromBox) : "-"}</td>
                                            <td className={p.cashProfit < 0 ? "r mono down" : "r mono up"} style={tinted(redness(p.cashProfit, deepest))}
                                                data-red={redness(p.cashProfit, deepest) ?? undefined}>
                                                {money.exact(p.cashProfit)}
                                            </td>
                                            <td className="r">
                                                {p.cashProfit < 0 && (
                                                    <button className="btn btn-sm" disabled={box.balance <= 0} onClick={() => onMove(p)} aria-label={`Move money to ${p.title}`}>
                                                        <Icon name="send" />Move money
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colSpan={2}><b>Total put in</b></td>
                                        <td className="r mono" style={{ fontWeight: 700 }}>{money.exact(box.contributedTotal)}</td>
                                        <td colSpan={3} />
                                    </tr>
                                </tfoot>
                            </table>
                        )}
            </div>

            {box.pending.length > 0 && <Pending projects={box.pending} />}
        </>
    );
}

const KIND_OPTIONS: { value: BoxEntryKind | ""; label: string }[] = [
    { value: "", label: "Every movement" },
    ...(Object.keys(BOX_ENTRY_LABEL) as BoxEntryKind[]).map((k) => ({ value: k, label: BOX_ENTRY_LABEL[k] })),
];

/** Every movement in and out of the box, newest first: searched and filtered on the server, 30 a page. */
function Transactions({ projects }: { projects: BoxProject[] }) {
    const [search, setSearch] = useState("");
    const [kind, setKind] = useState<BoxEntryKind | "">("");
    const [project, setProject] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [page, setPage] = useState(1);
    const words = useDebounce({ value: search.trim(), debounceTimeMs: 300 });
    const entries = useBoxEntries({ search: words, kind, projectId: project ? +project : null, from, to, page, pageSize: ENTRIES_PAGE });
    const anchor = useRef<HTMLDivElement>(null);
    const data = entries.data;
    const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
    const filtered = !!(words || kind || project || from || to);

    return (
        <div className="panel mt" ref={anchor} aria-label="Transactions">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Transactions</div>
                    {data && <div className="panel-sub">{plural(data.totalCount, "movement")}</div>}
                </div>
            </div>
            <div className="panel-body">
                <div className="row wrap" style={{ gap: 8 }}>
                    <SearchInput value={search} onChange={reset(setSearch)} placeholder="Search project, note or person" width={240} aria-label="Search the transactions" />
                    <Select value={kind} onChange={reset(setKind)} aria-label="Filter by movement" options={KIND_OPTIONS} />
                    <Select value={project} onChange={reset(setProject)} aria-label="Filter by project"
                        options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: String(p.id), label: p.title }))]} />
                    <DateInput className="input" style={{ width: 140 }} value={from} max={to || undefined} onChange={reset(setFrom)} placeholder="From" aria-label="From day" />
                    <DateInput className="input" style={{ width: 140 }} value={to} min={from || undefined} onChange={reset(setTo)} placeholder="To" aria-label="To day" />
                    {filtered && (
                        <button className="btn btn-sm btn-quiet" onClick={() => { setSearch(""); setKind(""); setProject(""); setFrom(""); setTo(""); setPage(1); }}>Clear</button>
                    )}
                </div>
            </div>
            {loadFailed(entries) ? <div className="panel-body"><LoadError error={entries.error} retry={() => entries.refetch()} what="the transactions" /></div>
                : !data ? <div className="panel-body"><SkeletonLines lines={4} /></div>
                    : data.items.length === 0 ? (
                        <Empty art="search" title={filtered ? "No movement matches" : "Nothing yet"}
                            text={filtered ? "Try other words, another project or other days." : "Client payments of Execution sites appear here as they arrive."} />
                    ) : (
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

type BoxTab = "contributors" | "transactions";

/** Execution's box: the pool of its sites' client payments, and where it went (financial:view). */
export default function BoxPage() {
    const box = useBox();
    const [params, setParams] = useSearchParams();
    const tab: BoxTab = params.get("tab") === "transactions" ? "transactions" : "contributors";
    const [moving, setMoving] = useState<BoxProject | null>(null);
    const b = box.data;
    function pick(next: BoxTab) {
        if (next === "contributors") params.delete("tab");
        else params.set("tab", next);
        setParams(params, { replace: true });
    }

    return (
        <div className="page">
            <PageHead title="The box" sub="Every Execution site's client payments go into one box. Sites in the red are kept going from it." />
            <Tabs value={tab} onChange={pick} items={[{ key: "contributors", label: "Contributors" }, { key: "transactions", label: "Transactions" }]} />
            {loadFailed(box) ? <LoadError error={box.error} retry={() => box.refetch()} what="the box" />
                : !b ? <SkeletonLines lines={6} />
                    : tab === "contributors" ? <Contributors box={b} onMove={setMoving} />
                        : <Transactions projects={projectsOf(b)} />}
            {b && moving && <MoveMoneyModal project={moving} balance={b.balance} onClose={() => setMoving(null)} />}
        </div>
    );
}
