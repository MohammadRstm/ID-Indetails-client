import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { addMonths, companyToday, fmtMonthY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useAddOverhead, useChangeOverhead, type OverheadChange, type OverheadGroup, type OverheadLine } from "./companyApi";
import { GROUP_LABEL } from "./overheadGroups";

/**
 * A recurring company expense, added or changed (the prototype's OverheadModal). A new amount or currency
 * applies from the first of a month, this one or later, so past months keep the cost they carried.
 */
export default function OverheadModal({ line, onClose }: { line: OverheadLine | null; onClose: () => void }) {
    const thisMonth = companyToday().slice(0, 7);
    const add = useAddOverhead();
    const change = useChangeOverhead(line?.id ?? 0);
    const [name, setName] = useState(line?.name ?? "");
    const [amount, setAmount] = useState(line?.currentAmount ?? 0);
    const [currency, setCurrency] = useState(line?.currency ?? "USD");
    const [group, setGroup] = useState<OverheadGroup>(line?.costGroup ?? "software");
    const [from, setFrom] = useState(thisMonth);
    const pending = add.isPending || change.isPending;
    const error = add.error ?? change.error;
    const newCurrency = !!line && currency !== line.currency;
    const newAmount = !!line && !newCurrency && amount !== (line.currentAmount ?? 0);
    const fromMonth = `${from}-01`;

    function submit() {
        if (!name.trim() || !amount) return;
        const done = () => {
            toast({ text: `${name.trim()} · ${money.fmt(amount, currency)} per month`, sub: line && (newAmount || newCurrency) ? `From ${fmtMonthY(fromMonth)}` : undefined, icon: "checkCircle" });
            onClose();
        };
        if (!line) {
            add.mutate({ name: name.trim(), amount, currency, costGroup: group }, { onSuccess: done });
            return;
        }
        const changes: OverheadChange[] = [];
        if (name.trim() !== line.name || group !== line.costGroup) changes.push({ kind: "details", body: { name: name.trim(), costGroup: group } });
        if (newCurrency) changes.push({ kind: "currency", body: { amount, currency, fromMonth } });
        else if (newAmount) changes.push({ kind: "amount", body: { amount, fromMonth } });
        if (!changes.length) { onClose(); return; }
        change.mutate(changes, { onSuccess: done });
    }

    return (
        <Modal title={line ? "Edit recurring expense" : "Add recurring expense"} sub="Charged every month until it is cancelled." onClose={onClose}
            foot={
                <>
                    <div className="grow">
                        {error ? <span className="err"><Icon name="alert" />{errorMessage(error)}</span>
                            : line ? "Past months keep the cost they carried." : "It joins this month's pool straight away."}
                    </div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={!name.trim() || !amount || pending} onClick={submit}>{line ? "Save" : "Add expense"}</button>
                </>
            }>
            <div className="field">
                <label className="label" htmlFor="ov-name">Name</label>
                <input id="ov-name" className="input" autoFocus placeholder="e.g. AWS" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid g-2 mt">
                <div className="field">
                    <label className="label" htmlFor="ov-amount">Monthly cost</label>
                    <AmountField id="ov-amount" value={amount} currency={currency} onChange={setAmount} onCurrency={setCurrency} />
                </div>
                <div className="field">
                    <label className="label" htmlFor="ov-group">Group</label>
                    <Select id="ov-group" value={group} onChange={setGroup}
                        options={(Object.keys(GROUP_LABEL) as OverheadGroup[]).map((g) => ({ value: g, label: GROUP_LABEL[g] }))} />
                </div>
            </div>
            {(newAmount || newCurrency) && (
                <div className="field mt">
                    <label className="label" htmlFor="ov-from">Applies from</label>
                    <Select id="ov-from" value={from} onChange={setFrom}
                        options={[0, 1, 2, 3].map((n) => { const m = addMonths(thisMonth, n); return { value: m, label: fmtMonthY(m) }; })} />
                    <div className="hint">{newCurrency ? "A line already charged in its old currency ends there, and one in the new currency takes over." : "Earlier months keep the amount they were charged."}</div>
                </div>
            )}
            <p className="hint mt">Groups are for reading the ledger - company expenses are never split across projects or businesses.</p>
        </Modal>
    );
}
