import { useState } from "react";
import { ErrorMessage } from "@/shared/components/Feedback/ErrorText";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { companyToday, fmtDateY } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { useAddOneOff, useChangeOneOff, useOverheadGroups, type OneOff } from "./companyApi";

/**
 * A cost the company paid once (a refrigerator, a repair), added or changed. It is dated the day it was spent,
 * this month up to today, and counts in full on that day - not spread over the month like a recurring expense.
 */
export default function OneOffModal({ item, onClose }: { item: OneOff | null; onClose: () => void }) {
    const today = companyToday();
    const monthStart = `${today.slice(0, 7)}-01`;
    const add = useAddOneOff();
    const change = useChangeOneOff(item?.id ?? 0);
    const groups = useOverheadGroups().data ?? [];
    const [name, setName] = useState(item?.name ?? "");
    const [amount, setAmount] = useState(item?.amount ?? 0);
    const [currency, setCurrency] = useState(item?.currency ?? "USD");
    const [groupId, setGroupId] = useState(item ? String(item.group.id) : "");
    const [spentOn, setSpentOn] = useState(item?.spentOn ?? today);
    const pending = add.isPending || change.isPending;
    const error = add.error ?? change.error;
    const errors = useFormErrors();
    const nameError = !name.trim() && "Name the expense.";
    const amountError = !(amount > 0) && "Enter what it cost.";
    const groupError = !groupId && "Choose the category.";
    const dayError = !spentOn ? "Pick the day it was spent."
        : (spentOn < monthStart || spentOn > today) && "A one-off expense is dated this month, up to today.";

    function submit() {
        if (pending) return;
        if (nameError || amountError || groupError || dayError) return errors.tried();
        const body = { name: name.trim(), groupId: +groupId, currency, amount, spentOn };
        const done = () => {
            toast({ text: `${body.name} · ${money.fmt(amount, currency)}`, sub: `Spent ${fmtDateY(spentOn)}`, icon: "checkCircle" });
            onClose();
        };
        if (item) change.mutate(body, { onSuccess: done });
        else add.mutate(body, { onSuccess: done });
    }

    return (
        <Modal title={item ? "Edit one-off expense" : "Add one-off expense"} sub="A cost paid once. It counts in full on the day it was spent." onClose={onClose}
            foot={
                <>
                    <div className="grow">
                        {error ? <span className="err"><Icon name="alert" /><ErrorMessage error={error} /></span>
                            : "It comes out of the company's profit on that day, and never goes to a project."}
                    </div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={pending} onClick={submit}>{item ? "Save" : "Add expense"}</button>
                </>
            }>
            <div className="field">
                <label className="label required" htmlFor="oo-name">Name</label>
                <input id="oo-name" className="input" autoFocus placeholder="e.g. Refrigerator" maxLength={150} value={name} onChange={(e) => setName(e.target.value)} onBlur={errors.touch("name")} />
                <FieldError message={errors.show("name", nameError)} />
            </div>
            <div className="grid g-2 mt">
                <div className="field">
                    <label className="label required" htmlFor="oo-amount">Amount</label>
                    <AmountField id="oo-amount" value={amount} currency={currency} onChange={setAmount} onCurrency={setCurrency} onBlur={errors.touch("amount")} />
                    <FieldError message={errors.show("amount", amountError)} />
                </div>
                <div className="field">
                    <label className="label required" htmlFor="oo-group">Category</label>
                    <Select id="oo-group" value={groupId} onChange={(v) => { setGroupId(v); errors.touch("group")(); }}
                        options={[{ value: "", label: "Choose a category", disabled: true }, ...groups.map((g) => ({ value: String(g.id), label: g.name }))]} />
                    <FieldError message={errors.show("group", groupError)} />
                </div>
            </div>
            <div className="field mt">
                <label className="label required" htmlFor="oo-day">Day</label>
                <DateInput id="oo-day" value={spentOn} min={monthStart} max={today} onChange={(v) => { setSpentOn(v); errors.touch("day")(); }} />
                <FieldError message={errors.show("day", dayError)} />
            </div>
        </Modal>
    );
}
