import { useState } from "react";
import FilledNote from "@/domains/shared/proton/FilledNote";
import { fillChange, useProtonForm } from "@/domains/shared/proton/formFill";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import { FieldError } from "@/shared/components/Forms/Field";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { addMonths, companyToday, fmtMonthY } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { P } from "@/app/permissions/codes";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useAddOverhead, useChangeOverhead, useOverheadGroups, type OverheadChange, type OverheadLine } from "./companyApi";

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
    const groups = useOverheadGroups().data ?? [];
    const sorts = usePermissions().has(P.OVERHEAD_CATEGORY_MANAGE);
    const [groupId, setGroupId] = useState(line ? String(line.group.id) : "");
    const [from, setFrom] = useState(thisMonth);
    // Proton fills the name and category, and an amount only when money actions are on and the person typed it
    const proton = useProtonForm("company_expense", line?.id ?? null, (fill) => {
        const v = fill.companyExpense;
        const done: string[] = [];
        if (!v) return done;
        fillChange(name, v.name, setName, "name", done);
        if (v.groupId != null && String(v.groupId) !== groupId && groups.some((g) => g.id === v.groupId)) { setGroupId(String(v.groupId)); done.push("category"); }
        if (v.monthlyAmount != null && v.monthlyAmount !== amount) { setAmount(v.monthlyAmount); done.push("monthly cost"); }
        if (v.currency && v.currency !== currency) { setCurrency(v.currency); done.push("currency"); }
        return done;
    });
    const pending = add.isPending || change.isPending;
    const error = add.error ?? change.error;
    const newCurrency = !!line && currency !== line.currency;
    const newAmount = !!line && !newCurrency && amount !== (line.currentAmount ?? 0);
    const fromMonth = `${from}-01`;
    const errors = useFormErrors();
    const nameError = !name.trim() && "Name the expense.";
    const amountError = !(amount > 0) && "Enter what it costs each month.";
    const groupError = !groupId && "Choose the category.";

    function submit() {
        if (pending) return;
        if (nameError || amountError || groupError) return errors.tried();
        const done = () => {
            toast({ text: `${name.trim()} · ${money.fmt(amount, currency)} per month`, sub: line && (newAmount || newCurrency) ? `From ${fmtMonthY(fromMonth)}` : undefined, icon: "checkCircle" });
            onClose();
        };
        if (!line) {
            add.mutate({ name: name.trim(), amount, currency, groupId: +groupId }, { onSuccess: done });
            return;
        }
        const changes: OverheadChange[] = [];
        if (name.trim() !== line.name || +groupId !== line.group.id) changes.push({ kind: "details", body: { name: name.trim(), groupId: +groupId } });
        if (newCurrency) changes.push({ kind: "currency", body: { amount, currency, fromMonth } });
        else if (newAmount) changes.push({ kind: "amount", body: { amount, fromMonth } });
        if (!changes.length) { onClose(); return; }
        change.mutate(changes, { onSuccess: done });
    }

    return (
        <Modal surfaceId={line ? undefined : "add_company_expense"} title={line ? "Edit recurring expense" : "Add recurring expense"} sub="Charged every month until it is cancelled." onClose={onClose}
            foot={
                <>
                    <div className="grow">
                        {error ? <span className="err"><Icon name="alert" />{errorMessage(error)}</span>
                            : line ? "Past months keep the cost they carried." : "It joins this month's pool straight away."}
                    </div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={pending} onClick={submit}>{line ? "Save" : "Add expense"}</button>
                </>
            }>
            <FilledNote fields={proton.filled} />
            <div className="field" {...proton.guard}>
                <label className="label required" htmlFor="ov-name">Name</label>
                <input id="ov-name" className="input" autoFocus placeholder="e.g. AutoCAD licences" value={name} onChange={(e) => setName(e.target.value)} onBlur={errors.touch("name")} />
                <FieldError message={errors.show("name", nameError)} />
            </div>
            <div className="grid g-2 mt">
                <div className="field">
                    <label className="label required" htmlFor="ov-amount">Monthly cost</label>
                    <AmountField id="ov-amount" value={amount} currency={currency} onChange={setAmount} onCurrency={setCurrency} onBlur={errors.touch("amount")} />
                    <FieldError message={errors.show("amount", amountError)} />
                </div>
                <div className="field">
                    <label className="label required" htmlFor="ov-group">Group</label>
                    <Select id="ov-group" value={groupId} onChange={(v) => { setGroupId(v); errors.touch("group")(); }}
                        options={[{ value: "", label: "Choose a category", disabled: true }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))]} />
                    {errors.show("group", groupError) ? <FieldError message={errors.show("group", groupError)} />
                        : sorts && <div className="hint">Add or rename categories from Categories on the expenses page.</div>}
                </div>
            </div>
            {(newAmount || newCurrency) && (
                <div className="field mt">
                    <label className="label required" htmlFor="ov-from">Applies from</label>
                    <Select id="ov-from" value={from} onChange={setFrom}
                        options={[0, 1, 2, 3].map((n) => { const m = addMonths(thisMonth, n); return { value: m, label: fmtMonthY(m) }; })} />
                    <div className="hint">{newCurrency ? "A line already charged in its old currency ends there, and one in the new currency takes over." : "Earlier months keep the amount they were charged."}</div>
                </div>
            )}
            <p className="hint mt">Groups are for reading the ledger - company expenses are never split across projects or businesses.</p>
        </Modal>
    );
}
