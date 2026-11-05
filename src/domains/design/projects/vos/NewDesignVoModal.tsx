import { useState } from "react";
import FormFailure from "@/domains/shared/projects/FormFailure";
import { toast } from "@/shared/components/Feedback/toast";
import { FieldError } from "@/shared/components/Forms/Field";
import { Segmented } from "@/shared/components/Forms/Filters";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { fmtDateY, fmtH } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../../../shared/projects/projectsApi";
import { sharePct, useProjectDepartments } from "../departments/departmentsApi";
import { parseAmount, useCreateDesignVo, useOutsideScope, VO_LINE_MAX, VO_TITLE_MAX, type DesignVo } from "./designVosApi";

type Line = { key: number; description: string; amount: string };
type Split = "shares" | "departments";

const cents = (n: number) => money.exact(n, "USD", { cents: true });

/**
 * A new variation order: its lines before TVA (below zero for work taken out), how it splits between the project's
 * departments, and whether it shows the hours logged outside the scope. Added to the price now, or sent to the client
 * to confirm first.
 */
export default function NewDesignVoModal({ project, onClose, onSend }: { project: Project; onClose: () => void; onSend: (vo: DesignVo) => void }) {
    const create = useCreateDesignVo(project.id);
    const departments = useProjectDepartments(project.id).data?.departments ?? [];
    const errors = useFormErrors();
    const [title, setTitle] = useState("");
    const [lines, setLines] = useState<Line[]>([{ key: 1, description: "", amount: "" }]);
    const [split, setSplit] = useState<Split>("shares");
    const [given, setGiven] = useState<Record<number, string>>({});
    const [showOutside, setShowOutside] = useState(false);
    const [chargeTva, setChargeTva] = useState(true);
    const outside = useOutsideScope(project.id, true);

    const amounts = lines.map((l) => parseAmount(l.amount));
    const total = Math.round(amounts.reduce<number>((sum, a) => sum + (a ?? 0), 0) * 100) / 100;
    const projectTva = project.money?.tvaRate ?? 0;
    const tvaRate = chargeTva ? projectTva : 0;
    const tva = Math.round(total * tvaRate * 100) / 100;
    const byHand = split === "departments" && departments.length > 0;
    const handTotal = Math.round(departments.reduce((sum, d) => sum + (parseAmount(given[d.id] ?? "") ?? 0), 0) * 100) / 100;

    const titleError = !title.trim() ? "Give it a title." : title.trim().length > VO_TITLE_MAX && `At most ${VO_TITLE_MAX} characters.`;
    const linesError = lines.some((l) => !l.description.trim()) ? "Describe each line."
        : lines.some((l) => l.description.trim().length > VO_LINE_MAX) ? `A line's description is at most ${VO_LINE_MAX} characters.`
            : amounts.some((a) => a == null || a === 0) ? "Give each line an amount to the cent: above zero for more work, below for less."
                : total === 0 && "The lines add up to nothing: a variation order changes the price.";
    const givenError = byHand && (departments.some((d) => (given[d.id] ?? "").trim() !== "" && parseAmount(given[d.id]) == null)
        ? "Give each department an amount to the cent."
        : handTotal !== total && `The departments' amounts add up to ${cents(handTotal)}: they must make ${cents(total)}.`);
    const invalid = !!(titleError || linesError || givenError);

    function setLine(key: number, patch: Partial<Line>) {
        setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    }

    function save(apply: boolean) {
        if (create.isPending) return;
        if (invalid) return errors.tried();
        create.mutate({
            title: title.trim(),
            lines: lines.map((l, i) => ({ description: l.description.trim(), amount: amounts[i]! })),
            split: byHand ? "departments" : "shares",
            allocations: byHand
                ? departments.filter((d) => parseAmount(given[d.id] ?? "")).map((d) => ({ departmentId: d.id, amount: parseAmount(given[d.id])! }))
                : [],
            showOutsideScope: showOutside,
            apply,
            chargeTva,
        }, {
            onSuccess: (vo) => {
                if (apply) {
                    toast({ text: `${vo.number} added to the price`, sub: `${project.title} · ${cents(vo.totalUsd)} before TVA`, icon: "checkCircle" });
                    onClose();
                } else {
                    toast({ text: `${vo.number} is waiting for the client`, sub: "Send it to them: the price changes once they confirm it", icon: "send" });
                    onSend(vo);
                }
            },
        });
    }

    return (
        <Modal size="lg" title="New variation order" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{create.error ? <FormFailure error={create.error} onForced={onClose} /> : null}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn" disabled={create.isPending} onClick={() => save(false)}><Icon name="send" />Send for approval</button>
                    <button className="btn btn-primary" disabled={create.isPending} onClick={() => save(true)}><Icon name="check" />Add to the price</button>
                </>
            }>
            <div className="field">
                <label className="label required" htmlFor="vo-title">Title</label>
                <input id="vo-title" className="input" maxLength={VO_TITLE_MAX} placeholder="e.g. Guest house" value={title}
                    onChange={(e) => setTitle(e.target.value)} onBlur={errors.touch("title")} />
                <FieldError message={errors.show("title", titleError)} />
            </div>

            <div className="field mt">
                <label className="label required">Changes</label>
                {lines.map((l, i) => (
                    <div key={l.key} className="row" style={{ gap: 8, marginBottom: 6 }}>
                        <input className="input grow" aria-label={`Line ${i + 1}`} maxLength={VO_LINE_MAX} placeholder="What changes"
                            value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} onBlur={errors.touch("lines")} />
                        <input className="input mono" style={{ width: 130, textAlign: "right" }} inputMode="decimal" aria-label={`Amount of line ${i + 1}`}
                            placeholder="0.00" value={l.amount} onChange={(e) => setLine(l.key, { amount: e.target.value })} onBlur={errors.touch("lines")} />
                        {lines.length > 1 && (
                            <button type="button" className="icon-btn" aria-label={`Remove line ${i + 1}`} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>
                                <Icon name="x" />
                            </button>
                        )}
                    </div>
                ))}
                <button type="button" className="btn btn-sm" onClick={() => setLines([...lines, { key: Math.max(...lines.map((x) => x.key)) + 1, description: "", amount: "" }])}>
                    <Icon name="plus" />Add a line
                </button>
                {errors.show("lines", linesError) ? <FieldError message={errors.show("lines", linesError)} />
                    : <div className="hint">Before TVA. A minus amount takes work out, e.g. -1,500.</div>}
                <div className="mt-s" aria-label="Totals">
                    <div className="spread" style={{ fontSize: 12.5 }}><span className="muted">Total before TVA</span><span className="mono">{cents(total)}</span></div>
                    <div className="spread" style={{ fontSize: 12.5 }}>
                        <span className="muted">{tvaRate > 0 ? `TVA (${sharePct(tvaRate)})` : "TVA"}</span><span className="mono">{tvaRate > 0 ? cents(tva) : "None"}</span>
                    </div>
                    <div className="spread" style={{ fontWeight: 650 }}><span>Total</span><span className="mono">{cents(total + tva)}</span></div>
                </div>
            </div>

            {departments.length >= 2 && (
                <div className="field mt">
                    <label className="label">Departments</label>
                    <Segmented aria-label="How it splits" value={split} onChange={setSplit}
                        options={[{ value: "shares", label: "By the shares" }, { value: "departments", label: "To departments" }]} />
                    {byHand ? (
                        <div className="mt-s">
                            {departments.map((d) => (
                                <div key={d.id} className="row" style={{ gap: 10, alignItems: "center", marginBottom: 6 }}>
                                    <label className="grow" htmlFor={`vo-dept-${d.id}`}>{d.name}</label>
                                    <input id={`vo-dept-${d.id}`} className="input mono" style={{ width: 130, textAlign: "right" }} inputMode="decimal" placeholder="0.00"
                                        value={given[d.id] ?? ""} onChange={(e) => setGiven({ ...given, [d.id]: e.target.value })} onBlur={errors.touch("given")} />
                                </div>
                            ))}
                            {errors.show("given", givenError) ? <FieldError message={errors.show("given", givenError)} />
                                : <div className="hint">Only these departments' budgets change; they add up to the total before TVA.</div>}
                        </div>
                    ) : (
                        <div className="hint mt-s">
                            Divided by the shares when it's applied ({departments.map((d) => `${d.name} ${sharePct(d.share ?? 0)}`).join(", ")}), and kept so if the shares change later.
                        </div>
                    )}
                </div>
            )}

            {projectTva > 0 && (
                <label className="scope-check mt">
                    <input type="checkbox" checked={chargeTva} onChange={(e) => setChargeTva(e.target.checked)} />
                    <span>
                        Charge TVA ({sharePct(projectTva)})
                        <span className="hint" style={{ display: "block" }}>Untick it for a variation order without TVA. It can be added or taken off later.</span>
                    </span>
                </label>
            )}

            <label className="scope-check mt">
                <input type="checkbox" checked={showOutside} onChange={(e) => setShowOutside(e.target.checked)} />
                <span>
                    Show the hours logged outside the agreed scope
                    <span className="hint" style={{ display: "block" }}>
                        {outside.data ? `${fmtH(outside.data.minutes)} since ${fmtDateY(outside.data.from)}, the last variation order (or the start). Fixed as it is now.` : "Since the last variation order, or the project's start."}
                    </span>
                </span>
            </label>
        </Modal>
    );
}
