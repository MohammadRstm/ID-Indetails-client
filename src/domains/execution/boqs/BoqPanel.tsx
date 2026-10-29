import { useState } from "react";
import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { plural } from "@/shared/format/labels";
import { money } from "@/shared/format/money";
import { fmtDate } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { clickable } from "@/shared/utils/clickable";
import type { Project } from "../../shared/projects/projectsApi";
import { pctOf } from "../projects/siteMoney";
import { useBoqAccess } from "./boqAccess";
import { useBoqLinks } from "./boqLinks";
import { agreedClient, isNotChosen, SENT } from "./boqRules";
import { useBoqs, type BoqKind, type BoqList, type BoqSummary } from "./boqsApi";
import NewBoqModal from "./NewBoqModal";

const cents = (n: number) => money.exact(n, "USD", { cents: true });

/**
 * A client site's bills of quantities, on its Financials tab: the price they add up to, the client BOQs (once one is
 * agreed the others read "Not chosen"), the VOs that change it afterwards, and the internal drafts the client BOQ is
 * built from. Each person sees what their permissions give: their own drafts (everyone's for whoever manages the
 * site's pricing), and the client's BOQs, VOs and price for whoever sees money.
 */
export default function BoqPanel({ project }: { project: Project }) {
    const access = useBoqAccess(project);
    const links = useBoqLinks();
    const query = useBoqs(project.id, access.seesBoqs);
    const [creating, setCreating] = useState<BoqKind | null>(null);
    if (!access.seesBoqs) return null;
    const list = query.data;
    const chosen = agreedClient(list);
    const showDrafts = access.writesDrafts || access.manages;

    return (
        <section className="panel mt" aria-label="Bills of quantities">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Bills of quantities</div>
                    <div className="panel-sub">The work, line by line. The client BOQ the client agrees sets the site's work price; VOs change it afterwards.</div>
                </div>
                <div className="panel-tools">
                    {!access.open && <span className="badge">Closed to changes</span>}
                    {access.canStartDraft && <button className="btn btn-sm" onClick={() => setCreating("internal")}><Icon name="plus" />New draft</button>}
                    {access.canStartClient && <button className="btn btn-sm" onClick={() => setCreating("client")}><Icon name="plus" />New client BOQ</button>}
                    {access.canStartClient && chosen && <button className="btn btn-sm" onClick={() => setCreating("vo")}><Icon name="plus" />New VO</button>}
                </div>
            </div>
            <div className="panel-body">
                {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the BOQs" />
                    : !list ? <SkeletonLines lines={5} /> : (
                        <>
                            {access.seesPrice && list.price && <PriceSummary list={list} />}
                            {access.seesPrice && (
                                <>
                                    <Section title="Client BOQs" boqs={list.client} list={list} onOpen={links.open}
                                        empty={access.canStartClient ? "No client BOQ yet. Start one empty, or from a draft." : "No client BOQ yet."} />
                                    <Section title="VOs" boqs={list.vos} list={list} onOpen={links.open}
                                        empty={chosen ? "No VOs yet." : "VOs can be made once a client BOQ is agreed."} />
                                </>
                            )}
                            {showDrafts && (
                                <Section title={access.manages ? "Internal drafts" : "My drafts"} boqs={list.internal} list={list} onOpen={links.open}
                                    showAuthor={access.manages} empty="No drafts yet." />
                            )}
                        </>
                    )}
            </div>
            {creating && (
                <NewBoqModal project={project} kind={creating} list={list} onClose={() => setCreating(null)}
                    onCreated={(id) => { setCreating(null); links.open(id); }} />
            )}
        </section>
    );
}

/** The price the agreed BOQs make: the API's figures, never added up here. */
function PriceSummary({ list }: { list: BoqList }) {
    const p = list.price!;
    const agreedVos = list.vos.filter((v) => v.status === "agreed").length;
    return (
        <div className="xm-owed" role="group" aria-label="Price">
            <div><span>Agreed BOQ</span><b className="mono">{cents(p.agreedBoqUsd)}</b><em>{agreedClient(list)?.number ?? "none agreed yet"}</em></div>
            <div><span>Agreed VOs</span><b className="mono">{cents(p.agreedVosUsd)}</b><em>{agreedVos ? `${agreedVos} agreed` : "none agreed"}</em></div>
            <div><span>Work price</span><b className="mono">{cents(p.workUsd)}</b><em>the agreed BOQ and VOs</em></div>
            <div><span>Supervision</span><b className="mono">{cents(p.supervisionUsd)}</b><em>{pctOf(p.supervisionRate)} of the work price</em></div>
            <div><span>TVA</span><b className="mono">{cents(p.tvaUsd)}</b><em>{pctOf(p.tvaRate)} of the work price</em></div>
            <div><span>Client total</span><b className="mono">{cents(p.clientTotalUsd)}</b><em>work price + supervision + TVA</em></div>
        </div>
    );
}

function Section({ title, boqs, list, onOpen, empty, showAuthor }: {
    title: string; boqs: BoqSummary[]; list: BoqList; onOpen: (id: number) => void; empty: string; showAuthor?: boolean;
}) {
    return (
        <div className="mt">
            <div className="u" style={{ marginBottom: 4 }}>{title}</div>
            {boqs.length === 0 ? <p className="muted" style={{ margin: 0, fontSize: 12 }}>{empty}</p>
                : boqs.map((b) => <Row key={b.id} boq={b} list={list} showAuthor={showAuthor} onOpen={() => onOpen(b.id)} />)}
        </div>
    );
}

function Row({ boq, list, showAuthor, onOpen }: { boq: BoqSummary; list: BoqList; showAuthor?: boolean; onOpen: () => void }) {
    const notChosen = isNotChosen(boq, list);
    const sent = boq.lastDelivery ? `${SENT[boq.lastDelivery.channel]} ${fmtDate(boq.lastDelivery.sentAt)}` : null;
    const detail = [
        boq.kind === "vo" ? boq.reason : null,
        plural(boq.lineCount, "line"),
        showAuthor ? `by ${boq.author.name}` : null,
        sent ? `last ${sent}` : null,
    ].filter((part): part is string => !!part);

    return (
        <div className="cost-row click" {...clickable(onOpen, "button")} aria-label={`Open ${boq.number ?? boq.title}`}>
            <span className="mono nowrap" style={{ fontWeight: 600, fontSize: 12, minWidth: 92 }}>{boq.number ?? "Draft"}</span>
            <div className="grow" style={{ minWidth: 0 }}>
                <div className="trunc"><b>{boq.title}</b></div>
                <div className="muted trunc" style={{ fontSize: "11.5px" }}>{detail.join(" · ")}</div>
            </div>
            {boq.status === "agreed" ? <span className="badge badge-active"><Icon name="checkCircle" />Agreed</span>
                : <span className="badge">{notChosen ? "Not chosen" : "Draft"}</span>}
            <span className="mono" style={{ minWidth: 100, textAlign: "right" }}>{cents(boq.totalUsd)}</span>
        </div>
    );
}
