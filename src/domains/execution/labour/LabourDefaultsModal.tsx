import { useState, type KeyboardEvent } from "react";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { addDays, companyToday, fmtDate, fmtDateY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../../shared/projects/projectsApi";
import { useSetLabourDefaults, type LabourDefaults } from "./labourApi";

/**
 * The labour defaults and every change to them (the prototype's LabourDefaultsModal). Each change applies
 * from its day on, so weeks already reported, and earlier days of weeks not yet reported, keep theirs.
 */
export default function LabourDefaultsModal({ project, defaults, onClose }: { project: Project; defaults: LabourDefaults; onClose: () => void }) {
    const cur = defaults.current ?? { workers: 0, dailyPay: 0 };
    const [workers, setWorkers] = useState(String(cur.workers));
    const [pay, setPay] = useState(cur.dailyPay);
    const set = useSetLabourDefaults(project.id);
    const n = Math.max(0, Math.round(+workers || 0)), rate = Math.max(0, pay || 0);
    const changed = n !== cur.workers || rate !== cur.dailyPay;
    const editable = defaults.canEdit;
    const today = companyToday();
    // newest first, as the API gives them
    const history = defaults.history;

    function save() {
        set.mutate({ workers: n, dailyPay: rate }, {
            onSuccess: () => {
                toast({ text: "Labour defaults updated", sub: `${n} workers × ${money.fmt(rate)} a day · from ${fmtDate(today)}`, icon: "checkCircle" });
                onClose();
            },
        });
    }
    // Enter: workers → pay → Save
    const next = (id: string) => (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter" || e.shiftKey) return;
        e.preventDefault();
        document.getElementById(id)?.focus();
    };

    return (
        <Modal title="Labour defaults" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{set.error ? <span className="err"><Icon name="alert" />{errorMessage(set.error)}</span> : editable ? `Applies from today, ${fmtDate(today)}` : ""}</div>
                    <button className="btn" onClick={onClose}>{editable ? "Cancel" : "Close"}</button>
                    {editable && <button id="ld-save" className="btn btn-primary" disabled={!changed || set.isPending} onClick={save}>Save defaults</button>}
                </>
            }>
            <div className="grid g-2">
                <div className="field">
                    <label className="label" htmlFor="ld-workers">Ground workers per day (avg)</label>
                    <input id="ld-workers" className="input mono" type="number" min={0} step={1} value={workers} disabled={!editable}
                        onKeyDown={next("ld-pay")} onChange={(e) => setWorkers(e.target.value)} />
                </div>
                <div className="field">
                    <label className="label" htmlFor="ld-pay">Cost per worker per day (avg)</label>
                    {editable ? <AmountField id="ld-pay" value={pay} currencies={false} onChange={setPay} onKeyDown={next("ld-save")} />
                        : <div className="lab-defaults-val mono">{money.exact(cur.dailyPay)}</div>}
                </div>
            </div>
            <div className="hint mt-s">
                About <b className="mono">{money.fmt(n * rate)}</b> a working day, <b className="mono">{money.fmt(n * rate * 6)}</b> a six-day week.
            </div>
            <div className="banner mt">
                <Icon name="info" />
                <div className="muted">New weeks start from these numbers for days from today on. Weeks already submitted, and days before today in weeks not yet reported, keep the defaults they had.</div>
            </div>
            {history.length > 0 && (
                <div className="mt">
                    <div className="label" style={{ marginBottom: 6 }}>History</div>
                    {history.map((d, i) => (
                        <div key={d.effectiveFrom} className="lab-def-row">
                            <span className="mono">{fmtDateY(d.effectiveFrom)}{i === 0 ? "" : ` – ${fmtDateY(addDays(history[i - 1].effectiveFrom, -1))}`}</span>
                            <span><b className="mono">{d.workers}</b> × <b className="mono">{money.fmt(d.dailyPay)}</b></span>
                            <span className="muted">{i === 0 ? "in force" : ""}{d.setBy ? `${i === 0 ? " · " : ""}set by ${d.setBy.name.split(" ")[0]}` : ""}</span>
                        </div>
                    ))}
                </div>
            )}
        </Modal>
    );
}
