import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import MenuButton from "@/shared/components/Overlays/MenuButton";
import { money } from "@/shared/format/money";
import { fmtDateY, fmtH } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../../../shared/projects/projectsApi";
import NewDesignVoModal from "./NewDesignVoModal";
import SendDesignVoModal from "./SendDesignVoModal";
import { downloadDesignVoPdf, useCancelDesignVo, useConfirmDesignVo, useDesignVos, useSetDesignVoTva, type DesignVo } from "./designVosApi";

const STATUS: Record<DesignVo["status"], { label: string; cls: string }> = {
    pending: { label: "Waiting for the client", cls: "badge-hold" },
    applied: { label: "In the price", cls: "badge-completed" },
    cancelled: { label: "Cancelled", cls: "badge-archived" },
};

/**
 * A Design client project's Variation orders tab: every change of its scope and price, newest first. Whoever writes
 * the money makes them, adds them to the price or sends them to the client to confirm.
 */
export default function DesignVosTab({ project }: { project: Project }) {
    const writes = usePermissions().has(P.FINANCIAL_WRITE) && !project.money?.isLocked;
    const vos = useDesignVos(project.id);
    const [creating, setCreating] = useState(false);
    const [sending, setSending] = useState<DesignVo | null>(null);

    return (
        <div className="panel">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Variation orders</div>
                    <div className="panel-sub">Every change of scope: work added or taken out, before TVA. Applied ones are part of the customer payment and the departments' budgets.</div>
                </div>
                {writes && <div className="panel-tools"><button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" />New variation order</button></div>}
            </div>
            <div className="panel-body">
                {loadFailed(vos) ? <LoadError error={vos.error} retry={() => vos.refetch()} what="the variation orders" />
                    : !vos.data ? <SkeletonLines lines={4} />
                        : vos.data.length === 0 ? (
                            <Empty art="done" title="No variation order yet"
                                text="When the client asks for more, or for less, record it here: the price and the departments' budgets follow." />
                        ) : (
                            <ol className="pay-hist" aria-label="Variation orders">
                                {vos.data.map((vo) => <VoRow key={vo.id} vo={vo} writes={writes} projectTva={project.money?.tvaRate ?? 0} onSend={() => setSending(vo)} />)}
                            </ol>
                        )}
            </div>
            {creating && <NewDesignVoModal project={project} onClose={() => setCreating(false)} onSend={(vo) => { setCreating(false); setSending(vo); }} />}
            {sending && <SendDesignVoModal project={project} vo={sending} onClose={() => setSending(null)} />}
        </div>
    );
}

function VoRow({ vo, writes, projectTva, onSend }: { vo: DesignVo; writes: boolean; projectTva: number; onSend: () => void }) {
    const confirm = useConfirmDesignVo();
    const cancel = useCancelDesignVo();
    const setTva = useSetDesignVoTva();
    const taxed = vo.tvaRate > 0;
    const status = STATUS[vo.status];
    const when = vo.status === "applied" ? `Applied ${fmtDateY(vo.appliedAt!)}${vo.appliedBy ? ` by ${vo.appliedBy.name}` : ""}`
        : vo.status === "cancelled" ? `Cancelled ${fmtDateY(vo.cancelledAt!)}`
            : `Sent ${fmtDateY(vo.sentAt ?? vo.createdAt)}${vo.sentBy ? ` by ${vo.sentBy.name}` : ""}`;

    function run(action: "confirm" | "cancel") {
        const mutation = action === "confirm" ? confirm : cancel;
        mutation.mutate(vo.id, {
            onSuccess: () => toast({
                text: action === "confirm" ? `${vo.number} is part of the price now` : `${vo.number} cancelled`,
                sub: vo.title, icon: action === "confirm" ? "checkCircle" : "x",
            }),
            onError: (e) => toast({ text: `${vo.number} wasn't ${action === "confirm" ? "applied" : "cancelled"}`, sub: errorMessage(e), icon: "alert" }),
        });
    }

    function switchTva() {
        setTva.mutate({ id: vo.id, chargeTva: !taxed }, {
            onSuccess: (saved) => toast({
                text: taxed ? `TVA taken off ${vo.number}` : `TVA added to ${vo.number}`,
                sub: `${money.exact(saved.totalWithTvaUsd, "USD", { cents: true })} in all · ${vo.title}`, icon: "checkCircle",
            }),
            onError: (e) => toast({ text: `${vo.number}'s TVA wasn't changed`, sub: errorMessage(e), icon: "alert" }),
        });
    }

    return (
        <li className="pay-hist-row" aria-label={vo.number}>
            <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
                <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    <b className="mono">{vo.number}</b>
                    <span className="trunc">{vo.title}</span>
                    <span className={`badge ${status.cls}`}>{status.label}</span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                    <b className={`mono money ${vo.totalUsd < 0 ? "down" : ""}`}>{vo.totalUsd > 0 ? "+" : ""}{money.exact(vo.totalUsd, "USD", { cents: true })}</b>
                    <MenuButton icon="dots" label={`Actions for ${vo.number}`}>
                        {(close) => (
                            <div>
                                <button className="pop-item" onClick={() => { close(); void downloadDesignVoPdf(vo); }}><Icon name="download" />Download PDF</button>
                                {writes && vo.status !== "cancelled" && <button className="pop-item" onClick={() => { close(); onSend(); }}><Icon name="send" />Send to the client</button>}
                                {writes && vo.status !== "cancelled" && projectTva > 0 && (
                                    <button className="pop-item" onClick={() => { close(); switchTva(); }}><Icon name="edit" />{taxed ? "Take the TVA off" : "Add the TVA"}</button>
                                )}
                                {writes && vo.status === "pending" && (
                                    <>
                                        <div className="pop-sep" />
                                        <button className="pop-item" onClick={() => { close(); run("confirm"); }}><Icon name="checkCircle" />The client confirmed it</button>
                                        <button className="pop-item" onClick={() => { close(); run("cancel"); }}><Icon name="x" />Cancel it</button>
                                    </>
                                )}
                            </div>
                        )}
                    </MenuButton>
                </div>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
                {when} · {vo.lines.length === 1 ? "1 line" : `${vo.lines.length} lines`} · {taxed ? `${money.exact(vo.totalWithTvaUsd, "USD", { cents: true })} with TVA` : "no TVA"}
                {vo.allocations.length > 0 && ` · ${vo.allocations.map((a) => `${a.name} ${money.fmt(a.amount)}`).join(", ")}`}
                {vo.outsideScopeMinutes != null && ` · ${fmtH(vo.outsideScopeMinutes)} outside the scope shown`}
            </div>
        </li>
    );
}
