import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { money } from "@/shared/format/money";
import { companyToday } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import type { Project } from "../../../shared/projects/projectsApi";
import { useAddExpense } from "./moneyApi";

const EXPENSE_CATEGORIES = [
    { value: "assets", label: "Assets & licences" }, { value: "services", label: "Services" }, { value: "contractor", label: "Contractor" },
    { value: "software", label: "Software" }, { value: "travel", label: "Travel" }, { value: "hardware", label: "Hardware" }, { value: "other", label: "Other" },
];

/** A one-off cost that belongs to this project only (the prototype's PF.ExpenseModal). */
export default function ExpenseModal({ project, onClose }: { project: Project; onClose: () => void }) {
    const add = useAddExpense(project.id);
    const today = companyToday();
    const [label, setLabel] = useState("");
    const [amount, setAmount] = useState(0);
    const [currency, setCurrency] = useState("USD");
    const [category, setCategory] = useState("services");
    const [date, setDate] = useState(today);
    const errors = useFormErrors();
    const labelError = !label.trim() && "Say what the money went on.";
    const amountError = !(amount > 0) && "Enter the amount spent.";

    function submit() {
        if (add.isPending) return;
        if (labelError || amountError) return errors.tried();
        add.mutate({ label: label.trim(), amount, currency, category, spentOn: date }, {
            onSuccess: () => {
                toast({ text: `${money.fmt(amount, currency)} expense added`, sub: label.trim(), icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal title="Add project expense" sub={project.title} onClose={onClose}
            foot={
                <>
                    <div className="grow">{add.error ? <span className="err"><Icon name="alert" />{errorMessage(add.error)}</span> : "Belongs to this project only - never shared with other projects."}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={add.isPending} onClick={submit}>Add expense</button>
                </>
            }>
            <div className="field">
                <label className="label required" htmlFor="ex-label">What was it?</label>
                <input id="ex-label" className="input" autoFocus placeholder="e.g. Plan printing and material samples" value={label} onChange={(e) => setLabel(e.target.value)} onBlur={errors.touch("label")} />
                <FieldError message={errors.show("label", labelError)} />
            </div>
            <div className="grid g-2 mt">
                <div className="field">
                    <label className="label required" htmlFor="ex-amount">Amount</label>
                    <AmountField id="ex-amount" value={amount} currency={currency} onChange={setAmount} onCurrency={setCurrency} onBlur={errors.touch("amount")} />
                    <FieldError message={errors.show("amount", amountError)} />
                </div>
                <div className="field">
                    <label className="label required" htmlFor="ex-date">Date</label>
                    <DateInput id="ex-date" className="input mono" value={date} max={today} onChange={(v) => { if (v) setDate(v); }} />
                </div>
            </div>
            <div className="field mt">
                <label className="label required" htmlFor="ex-cat">Category</label>
                <Select id="ex-cat" value={category} onChange={setCategory} options={EXPENSE_CATEGORIES} />
            </div>
        </Modal>
    );
}
