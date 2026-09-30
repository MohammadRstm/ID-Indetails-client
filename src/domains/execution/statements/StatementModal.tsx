import { useState, type ReactNode } from "react";
import { downloadFile } from "@/api/download";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCompanySettings } from "@/app/shell/shellQueries";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { Segmented } from "@/shared/components/Forms/Filters";
import Modal from "@/shared/components/Overlays/Modal";
import { plural } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import { companyToday, fmtDateY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { channelsOf, waLink, type Channel } from "../../shared/billing/channels";
import { ScaledDoc } from "../../shared/billing/InvoiceDoc";
import type { DocFlash } from "../../shared/billing/invoiceDocData";
import { useClient } from "../../shared/clients/clientsApi";
import type { Project } from "../../shared/projects/projectsApi";
import { useAllMaterials, useSetMaterialPrice, type Material } from "../materials/materialsApi";
import { isSiteOpen, markupText, siteMoneyOf } from "../projects/siteMoney";
import StatementDoc from "./StatementDoc";
import { useCreateStatement, useEmailStatement, useRecordStatementDelivery, useStatement, useStatementPreview, useStatements, type Statement, type StatementChoice } from "./statementsApi";

const QUICK = [5, 10, 25];
const r2 = (n: number) => Math.round(n * 100) / 100;
const typeKey = (name: string) => name.trim().split(/\s+/).join(" ").toLowerCase();
const detailOf = (m: Material) => (m.quantity ? `${m.quantity}${m.unit ? ` ${m.unit}` : ""}` : "");

type Props = { project: Project; statementId: number | null; onMade: (id: number) => void; onClose: () => void };

/**
 * A client statement (the prototype's EX.StatementModal): the materials on the site at the client's prices,
 * and where payment stands, for the client's information. It is not an invoice, records no payment and
 * changes nothing that is owed. A new one is built beside a preview of what the client receives; a saved one
 * shows the figures of the day it was made.
 */
export default function StatementModal({ project, statementId, onMade, onClose }: Props) {
    return statementId != null
        ? <SavedStatement project={project} id={statementId} onClose={onClose} />
        : <NewStatement project={project} onMade={onMade} onClose={onClose} />;
}

/**
 * Saving the PDF and sending, for a statement that is already made or is made on the way. A statement made on
 * the way (`afterMade`) switches the window to the saved statement only once the rest is done, so a send that
 * fails is still told; since the window then changes, that failure is a toast.
 */
function useOutgoing(project: Project, onClose: () => void, afterMade?: (id: number) => void) {
    const permissions = usePermissions();
    const company = useCompanySettings().data;
    const client = useClient(project.client?.id).data;
    const deliver = useRecordStatementDelivery();
    const email = useEmailStatement();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const canSend = permissions.has(P.STATEMENT_SEND);
    const firstName = (client?.name ?? project.client?.displayName ?? "").split(" ")[0];

    /** `work` gets the statement made, says when it closed the window, and throws what went wrong. */
    async function run(made: () => Promise<Statement>, work: (s: Statement) => Promise<"closed" | void>, failed: string) {
        setBusy(true);
        setError(null);
        let madeId: number | null = null, closed = false;
        try {
            const s = await made();
            if (afterMade) madeId = s.id!;
            closed = (await work(s)) === "closed";
        } catch (e) {
            if (madeId != null) toast({ text: failed, sub: `The statement was made. ${errorMessage(e)}`, icon: "alert" });
            else setError(e);
        } finally {
            setBusy(false);
            if (madeId != null && !closed) afterMade?.(madeId);
        }
    }
    return {
        busy, error, canSend, firstName, channels: channelsOf(client?.contacts),
        savePdf: (made: () => Promise<Statement>) => run(made, async (s) => {
            if (canSend) await deliver.mutateAsync({ id: s.id!, body: { channel: "download" } });
            await downloadFile(`/statements/${s.id}/pdf`, `${s.number.toLowerCase()}.pdf`);
            toast({ text: `${s.number} downloaded`, sub: "A statement only - nothing is owed or paid because of it", icon: "download" });
        }, "The PDF wasn't downloaded"),
        send: (made: () => Promise<Statement>, ch: Channel) => {
            // the chat opens in a tab of its own; it is opened now, while the click still allows it
            const tab = ch.channel === "whatsapp" ? window.open("", "_blank") : null;
            if (tab) tab.opener = null;
            return run(made, async (s) => {
                try {
                    if (ch.channel === "email") await email.mutateAsync({ id: s.id!, to: ch.value });
                    else {
                        await deliver.mutateAsync({ id: s.id!, body: { channel: "whatsapp", recipient: ch.value } });
                        const text = `Hello ${firstName} - here is the materials statement ${s.number} for ${s.projectTitle}: materials ${money.exact(s.total)}, `
                            + `received so far ${money.exact(s.received)}, remaining ${money.exact(s.remaining)}. ${company?.name ?? ""}`;
                        if (tab) tab.location.href = waLink(ch.value, text.trim());
                    }
                    toast({
                        text: `${s.number} ${ch.channel === "whatsapp" ? "shared on WhatsApp" : `emailed to ${ch.value}`}`,
                        sub: "A statement only - nothing is owed or paid because of it", icon: "send",
                    });
                    onClose();
                    return "closed";
                } catch (e) {
                    tab?.close();
                    throw e;
                }
            }, "The statement wasn't sent");
        },
    };
}

type FrameProps = {
    project: Project;
    title: string;
    doc: Statement | undefined;
    flash?: DocFlash;
    firstName: string;
    foot: ReactNode;
    onClose: () => void;
    children: ReactNode;
};

function Frame({ project, title, doc, flash, firstName, foot, onClose, children }: FrameProps) {
    return (
        <Modal size="xl inv-editor" flush onClose={onClose} title={title} sub={`${project.title} · ${project.client?.displayName ?? "no client"}`} foot={foot}>
            <div className="inv-edit">
                <div className="inv-edit-form">{children}</div>
                <div className="inv-edit-preview">
                    <div className="inv-edit-cap">
                        <Icon name="file" />What {firstName || "the client"} will receive
                        <span className="grow" /><span className="mono">{doc ? `${doc.number}.pdf` : ""}</span>
                    </div>
                    {doc ? <ScaledDoc><StatementDoc statement={doc} flash={flash} /></ScaledDoc> : <SkeletonLines lines={10} />}
                </div>
            </div>
        </Modal>
    );
}

type FootProps = { total: number; summary: string; saved: boolean; canGo: boolean; out: ReturnType<typeof useOutgoing>; onPdf: () => void; onSend: () => void; onClose: () => void };

function Foot({ total, summary, saved, canGo, out, onPdf, onSend, onClose }: FootProps) {
    return (
        <>
            <div className="grow mono" style={{ fontSize: "12.5px", fontWeight: 650 }}>
                {money.exact(total)}
                <span className="muted" style={{ fontWeight: 400, fontFamily: "inherit" }}> · {summary}</span>
                {out.error != null && <span className="err" style={{ fontFamily: "inherit", fontWeight: 400 }}> · {errorMessage(out.error)}</span>}
            </div>
            <button className="btn" onClick={onClose}>{saved ? "Close" : "Cancel"}</button>
            <button className="btn" disabled={!canGo || out.busy} onClick={onPdf}><Icon name="download" />Save PDF</button>
            {out.canSend && (
                <button className="btn btn-primary" disabled={!canGo || out.busy || out.channels.length === 0}
                    title={out.channels.length ? undefined : "No email or WhatsApp saved for this client"} onClick={onSend}>
                    <Icon name="send" />Send to client…
                </button>
            )}
        </>
    );
}

function SavedStatement({ project, id, onClose }: { project: Project; id: number; onClose: () => void }) {
    const statement = useStatement(project.id, id);
    const out = useOutgoing(project, onClose);
    const [sending, setSending] = useState(false);
    const s = statement.data;
    const made = async () => s!;

    return (
        <Frame project={project} title={s?.number ?? "Client statement"} doc={s} firstName={out.firstName} onClose={onClose}
            foot={<Foot total={s?.total ?? 0} summary={s ? (s.mode === "total" ? "total only" : plural(s.count, "material")) : ""} saved canGo={!!s} out={out}
                onPdf={() => out.savePdf(made)} onSend={() => setSending(true)} onClose={onClose} />}>
            {statement.isError ? <LoadError error={statement.error} retry={() => statement.refetch()} what="the statement" />
                : s && (
                    <div className="banner">
                        <Icon name="info" />
                        <div className="grow">
                            Made {fmtDateY(s.createdAt)}{s.deliveries.length ? ` · sent ${plural(s.deliveries.length, "time")}` : ""}.
                            It shows the figures of that day - create a new statement for today's.
                        </div>
                    </div>
                )}
            {sending && s && <SendPicker number={s.number} client={project.client?.displayName ?? ""} channels={out.channels} busy={out.busy}
                onSend={(ch) => out.send(made, ch)} onClose={() => setSending(false)} />}
        </Frame>
    );
}

type TypeGroup = { key: string; label: string; earlier: Material[]; fresh: Material[] };

function NewStatement({ project, onMade, onClose }: { project: Project; onMade: (id: number) => void; onClose: () => void }) {
    const permissions = usePermissions();
    const all = useAllMaterials(project.id);
    const last = useStatements(project.id, 1, true).data?.items[0];
    const setPrice = useSetMaterialPrice(project.id);
    const create = useCreateStatement(project.id);
    const out = useOutgoing(project, onClose, onMade);
    const [mode, setMode] = useState<"detail" | "total">("detail");
    const [includePrev, setIncludePrev] = useState(false);
    const [off, setOff] = useState<Record<number, boolean>>({});
    const [unlisted, setUnlisted] = useState<Record<string, boolean>>({});
    const [typing, setTyping] = useState<Record<number, string>>({});
    const [flash, setFlash] = useState<DocFlash>({ key: null, n: 0 });
    const [sending, setSending] = useState(false);
    const ping = (key: string) => setFlash((f) => ({ key, n: f.n + 1 }));

    const canPrice = permissions.has(P.PROJECT_PRICING_MANAGE) && isSiteOpen(project);
    const items = (all.data?.items ?? []).slice().sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.id - b.id);
    const fresh = items.filter((m) => !m.isStated);
    const prev = items.filter((m) => m.isStated);
    const chosen = fresh.filter((m) => !off[m.id]);
    const prevIn = includePrev ? prev : [];
    const priceOf = (m: Material) => (typing[m.id] ? r2(+typing[m.id]) : m.clientPrice ?? m.cost);

    const groups = new Map<string, TypeGroup>();
    for (const m of items) {
        const key = typeKey(m.name);
        const g = groups.get(key) ?? { key, label: m.name.trim(), earlier: [], fresh: [] };
        (m.isStated ? g.earlier : g.fresh).push(m);
        groups.set(key, g);
    }
    const earlierTypes = [...groups.values()].filter((g) => g.earlier.length > 0).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
    const newOf = (g: TypeGroup) => g.fresh.filter((m) => !off[m.id]);
    // a type with nothing new can be left unlisted; one with new deliveries is always shown
    const hideable = (g: TypeGroup) => newOf(g).length === 0;
    const choice: StatementChoice = {
        mode, includeEarlier: includePrev,
        excludedMaterialIds: mode === "detail" ? fresh.filter((m) => off[m.id]).map((m) => m.id) : [],
        unlistedTypeKeys: mode === "detail" && includePrev ? earlierTypes.filter((g) => hideable(g) && unlisted[g.key]).map((g) => g.key) : [],
    };
    const pool = (mode === "total" ? fresh.length : chosen.length) + prevIn.length;
    const preview = useStatementPreview(project.id, choice, !!all.data && pool > 0);
    const x = project.money ? siteMoneyOf(project.money) : null;
    // nothing chosen: the document with no materials on it, as the last preview had it
    const doc: Statement | undefined = pool > 0 ? preview.data : project.client ? {
        ...(preview.data ?? {
            id: null, number: "New statement", projectId: project.id, projectTitle: project.title, client: project.client, date: companyToday(),
            createdAt: new Date().toISOString(), createdBy: null, currency: "USD", deliveries: [], isPreview: true, since: null,
            received: x?.received ?? 0, remaining: x?.owed ?? 0, paidAhead: x?.credit ?? 0, agreed: x?.agreed ?? 0,
        }),
        mode, includesEarlier: includePrev, types: [], hiddenTypes: null, total: 0, earlierTotal: 0, newTotal: 0, count: 0,
    } : undefined;
    const received = doc?.received ?? x?.received ?? 0;
    const ahead = doc ? doc.paidAhead : x?.credit ?? 0;
    const remaining = doc?.remaining ?? x?.owed ?? 0;
    const agreed = doc?.agreed ?? x?.agreed ?? 0;
    const markup = all.data?.defaultMarkup ?? x?.markup ?? 0;
    const defPct = Math.round(markup * 1000) / 10;
    const quick = [...new Set([...QUICK, ...(defPct > 0 ? [defPct] : [])])].sort((a, b) => a - b);
    const earlierTotal = r2(prevIn.reduce((t, m) => t + priceOf(m), 0));

    function applyPrice(m: Material, v: number, done?: () => void) {
        if (!canPrice || !(v >= 0) || Math.abs(v - (m.clientPrice ?? 0)) < 0.005) { done?.(); return; }
        ping(`t:${typeKey(m.name)}`);
        setPrice.mutate({ id: m.id, clientPrice: v }, {
            onSettled: done,
            onError: (e) => toast({ text: `${m.name}'s price wasn't changed`, sub: errorMessage(e), icon: "alert" }),
        });
    }
    function commitTyping(m: Material) {
        const v = typing[m.id];
        const clear = () => setTyping((t) => { const next = { ...t }; delete next[m.id]; return next; });
        if (v == null || v === "") { clear(); return; }
        applyPrice(m, +v, clear);
    }
    function toggle(m: Material, on: boolean) {
        setOff((o) => ({ ...o, [m.id]: !on }));
        ping(`t:${typeKey(m.name)}`);
    }
    const made = () => create.mutateAsync(choice);

    const summary = mode === "total" ? `total of ${plural(pool, "material")}`
        : `${chosen.length} of ${fresh.length} new${prevIn.length ? ` + ${prevIn.length} earlier · ${doc?.types.length ?? 0} type rows` : ""}`;

    return (
        <Frame project={project} title="Client statement" doc={doc} flash={flash} firstName={out.firstName} onClose={onClose}
            foot={<Foot total={doc?.total ?? 0} summary={summary} saved={false} canGo={pool > 0 && !!doc} out={out}
                onPdf={() => out.savePdf(made)} onSend={() => setSending(true)} onClose={onClose} />}>
            {all.isError ? <LoadError error={all.error} retry={() => all.refetch()} what="the materials" />
                : !all.data ? <SkeletonLines lines={8} /> : (
                    <div>
                        <div className="field">
                            <label className="label">What the client sees</label>
                            <Segmented value={mode} onChange={(v) => { setMode(v); ping("total"); }} aria-label="What the client sees"
                                options={[{ value: "detail", label: "Detailed materials" }, { value: "total", label: "Total only" }]} />
                            <div className="hint">{mode === "total" ? "One line with the total - no materials or descriptions listed." : "Each material you tick, with its description and client price."}</div>
                        </div>

                        <label className="stmt-prev mt">
                            <input type="checkbox" checked={includePrev} disabled={!prev.length}
                                onChange={(e) => { setIncludePrev(e.target.checked); setUnlisted({}); ping("total"); }} />
                            <span>
                                Include materials from earlier statements{" "}
                                <span className="muted">{prev.length ? `(${prev.length} already sent${last ? `, last on ${last.number}` : ""})` : "(none yet)"}</span>
                            </span>
                        </label>

                        {mode === "detail" && (
                            <div className="mt">
                                <div className="spread" style={{ marginBottom: 6 }}>
                                    <span className="u">New materials · {chosen.length} of {fresh.length} included</span>
                                    {fresh.length > 0 && (
                                        <span className="row" style={{ gap: 4 }}>
                                            <button className="btn btn-sm btn-quiet" onClick={() => { setOff({}); ping("total"); }}>Select all</button>
                                            <button className="btn btn-sm btn-quiet" onClick={() => { setOff(Object.fromEntries(fresh.map((m) => [m.id, true]))); ping("total"); }}>None</button>
                                        </span>
                                    )}
                                </div>
                                {fresh.length ? (
                                    <div className="stmt-list">
                                        {fresh.map((m) => {
                                            const on = !off[m.id], price = priceOf(m);
                                            const mk = m.cost > 0 ? price / m.cost - 1 : null;
                                            const sameType = groups.get(typeKey(m.name))?.earlier.length ?? 0;
                                            return (
                                                <div key={m.id} className={cx("stmt-row", !on && "off")}>
                                                    <input type="checkbox" checked={on} aria-label={`Include ${m.name}`} onChange={(e) => toggle(m, e.target.checked)} />
                                                    <div className="grow" style={{ minWidth: 0 }}>
                                                        <div className="trunc"><b>{m.name}</b>{detailOf(m) && <> <span className="muted mono">{detailOf(m)}</span></>}</div>
                                                        <div className="muted" style={{ fontSize: 11 }}>
                                                            cost {money.exact(m.cost)}{mk != null ? ` · ${markupText(mk)}` : ""}{m.priceSource === "manual" ? " · own price" : " · default material profit"}
                                                            {sameType ? ` · same type as ${sameType} earlier` : ""}
                                                        </div>
                                                    </div>
                                                    {canPrice && (
                                                        <div className="stmt-quick">
                                                            {quick.map((q) => {
                                                                const here = mk != null && Math.abs(mk - q / 100) < 0.0005;
                                                                return (
                                                                    <button key={q} type="button" className={cx("chip", here && "on glow")} aria-pressed={here} title={`Cost + ${q}%`}
                                                                        onClick={() => { applyPrice(m, r2(m.cost * (1 + q / 100))); ping("total"); }}>+{q}%</button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    <input className="input mono stmt-price" inputMode="decimal" aria-label={`Client price for ${m.name}`} disabled={!canPrice}
                                                        value={typing[m.id] ?? String(price)}
                                                        onChange={(e) => setTyping((t) => ({ ...t, [m.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
                                                        onBlur={() => commitTyping(m)}
                                                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="banner">
                                        <Icon name="info" />
                                        <div className="grow">{items.length ? "Every material has been on an earlier statement - include them above to send them again." : "No materials on this project yet."}</div>
                                    </div>
                                )}
                                {fresh.length > 0 && (
                                    <div className="hint mt-s">A price changed here is what the material is charged at from now on - it counts toward the project's profit whether or not it is shown. Unticking only leaves it out of this statement.</div>
                                )}

                                {prevIn.length > 0 && (
                                    <div className="mt">
                                        <div className="spread" style={{ marginBottom: 6 }}>
                                            <span className="u">From earlier statements · {earlierTypes.filter((g) => !hideable(g) || !unlisted[g.key]).length} of {earlierTypes.length} types listed</span>
                                            <span className="row" style={{ gap: 4 }}>
                                                <button className="btn btn-sm btn-quiet" onClick={() => setUnlisted({})}>List all</button>
                                                <button className="btn btn-sm btn-quiet" onClick={() => setUnlisted(Object.fromEntries(earlierTypes.map((g) => [g.key, true])))}>None</button>
                                            </span>
                                        </div>
                                        <div className="stmt-list">
                                            {earlierTypes.map((g) => {
                                                const can = hideable(g), listed = !can || !unlisted[g.key];
                                                const inNew = newOf(g);
                                                const earlier = r2(g.earlier.reduce((t, m) => t + priceOf(m), 0));
                                                const added = r2(inNew.reduce((t, m) => t + priceOf(m), 0));
                                                return (
                                                    <div key={g.key} className={cx("stmt-row prev", !listed && "off")}>
                                                        <input type="checkbox" checked={listed} disabled={!can} aria-label={`List ${g.label}`}
                                                            title={can ? undefined : "Has new deliveries on this statement, so it is shown"}
                                                            onChange={(e) => { setUnlisted((u) => ({ ...u, [g.key]: !e.target.checked })); ping(`t:${g.key}`); }} />
                                                        <div className="grow" style={{ minWidth: 0 }}>
                                                            <div className="trunc"><b>{g.label}</b></div>
                                                            <div className="muted" style={{ fontSize: 11 }}>
                                                                {g.earlier.length} on earlier statements{inNew.length ? ` · ${inNew.length} new this time` : ""}{!listed ? " · counted in the total, not listed" : ""}
                                                            </div>
                                                        </div>
                                                        <span className="mono stmt-fixed" title="On earlier statements">{money.exact(earlier)}</span>
                                                        <span className={cx("mono stmt-fixed", added > 0 && "new")} title="New this time">{added > 0 ? `+${money.exact(added)}` : "-"}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="hint mt-s">
                                            A type delivered again this time shows what it came to before and what is added now. Earlier amounts are settled and always count ({money.exact(earlierTotal)}); a type with nothing new can be left unlisted and joins one line.
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="xm-owed mt">
                            <div><span>Received so far</span><b className="mono">{money.exact(received)}</b><em>shown on the statement</em></div>
                            <div>
                                <span>{ahead > 0.5 ? "Paid in advance" : "Remaining amount"}</span><b className="mono">{money.exact(ahead > 0.5 ? ahead : remaining)}</b>
                                <em>of {money.exact(agreed)} agreed so far</em>
                            </div>
                        </div>
                        {preview.isError && <p className="err mt-s"><Icon name="alert" />The preview didn't load: {errorMessage(preview.error)}</p>}
                        <p className="hint mt">A statement is for the client's information: it is not an invoice, records no payment and changes nothing that is owed.</p>
                    </div>
                )}
            {sending && <SendPicker number={doc?.number ?? "statement"} client={project.client?.displayName ?? ""} channels={out.channels} busy={out.busy}
                onSend={(ch) => out.send(made, ch)} onClose={() => setSending(false)} />}
        </Frame>
    );
}

type SendPickerProps = { number: string; client: string; channels: Channel[]; busy: boolean; onSend: (channel: Channel) => void; onClose: () => void };

/** Which of the client's addresses it goes to (the prototype's SendPicker). */
function SendPicker({ number, client, channels, busy, onSend, onClose }: SendPickerProps) {
    const [pick, setPick] = useState<string | null>(null);
    const chosen = channels.find((c) => c.key === (pick ?? channels[0]?.key)) ?? null;
    return (
        <Modal size="sm" title={`Send ${number}`} sub={client} onClose={onClose}
            foot={
                <>
                    <div className="grow" />
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={!chosen || busy} onClick={() => chosen && onSend(chosen)}><Icon name="send" />{busy ? "Sending…" : "Send"}</button>
                </>
            }>
            {channels.length ? (
                <>
                    <div className="stack" style={{ gap: 6 }}>
                        {channels.map((ch) => (
                            <label key={ch.key} className={cx("stmt-ch", chosen?.key === ch.key && "on")}>
                                <input type="radio" name="stmt-ch" checked={chosen?.key === ch.key} onChange={() => setPick(ch.key)} />
                                <Icon name={ch.channel === "whatsapp" ? "send" : "mail"} />
                                <span className="grow"><b>{ch.channel === "whatsapp" ? "WhatsApp" : "Email"}</b> <span className="muted">{ch.value}{ch.label ? ` · ${ch.label}` : ""}</span></span>
                            </label>
                        ))}
                    </div>
                    <div className="hint mt-s">WhatsApp opens with a short summary ready to send. Email goes out from Hourline with the statement attached as a PDF.</div>
                </>
            ) : (
                <div className="banner hold">
                    <Icon name="alert" />
                    <div className="grow">This client has no email or WhatsApp number saved. Add one on the client's page, or save the PDF and send it yourself.</div>
                </div>
            )}
        </Modal>
    );
}
