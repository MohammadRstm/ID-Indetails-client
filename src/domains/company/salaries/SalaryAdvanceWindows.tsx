import { useState } from "react";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import DateInput from "@/shared/components/Forms/DateInput";
import { FieldError } from "@/shared/components/Forms/Field";
import { Segmented } from "@/shared/components/Forms/Filters";
import Modal from "@/shared/components/Overlays/Modal";
import { companyToday, fmtDateY } from "@/shared/format/time";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import AdvanceMonthsEditor from "./AdvanceMonthsEditor";
import { amountOf, covers, failureOf, firstMonth, monthsRequest, planOfOpen, wholeIn, plannedSum, type MonthsPlan } from "./advanceMonths";
import {
    ADVANCE_NOTE_MAX, useApproveSalaryAdvance, useCancelSalaryAdvance, useChangeAdvanceMonths, useDeclineSalaryAdvance, useRecordSalaryAdvance,
    useSettleSalaryAdvance, type SalaryAdvance, type SalaryAdvanceSettlement,
} from "./salaryAdvancesApi";

const noteTooLong = (note: string) => note.trim().length > ADVANCE_NOTE_MAX && `At most ${ADVANCE_NOTE_MAX} characters.`;

/** The optional note a decision can carry. */
function NoteField({ id, label, note, onNote, error, onBlur }: {
    id: string; label: string; note: string; onNote: (v: string) => void; error: string | undefined; onBlur: () => void;
}) {
    return (
        <div className="field mt">
            <label className="label" htmlFor={id}>{label}</label>
            <AutoGrowTextarea id={id} className="input" minRows={2} maxRows={6} maxLength={ADVANCE_NOTE_MAX} value={note}
                onChange={(e) => onNote(e.target.value)} onBlur={onBlur} />
            <FieldError message={error} />
        </div>
    );
}

/** The amount, in the currency of the person's pay. */
function AmountLine({ id, label, amount, onAmount, currency, error, onBlur }: {
    id: string; label: string; amount: number | null; onAmount: (v: number) => void; currency: string; error: string | undefined; onBlur: () => void;
}) {
    return (
        <div className="field">
            <label className="label required" htmlFor={id}>{label}</label>
            <AmountField id={id} value={amount} currency={currency} currencies={false} onChange={onAmount} onBlur={onBlur} />
            <FieldError message={error} />
        </div>
    );
}

/** The months' own error: what the API said, or that they don't add up to what must be planned. */
function useMonthsCheck(plan: MonthsPlan, mustPlan: number, currency: string) {
    const off = !covers(plan, mustPlan) && `The months add up to ${amountOf(plannedSum(plan), currency)}, and must add up to ${amountOf(mustPlan, currency)}.`;
    const none = plan.spread && plan.rows.every((r) => !r.amount) && "Give at least one month an amount.";
    return none || off;
}

/** Approves a request: the amount (it can be lowered), the months it comes off and a note. */
export function ApproveAdvanceModal({ advance, onClose }: { advance: SalaryAdvance; onClose: () => void }) {
    const approve = useApproveSalaryAdvance();
    const { currency } = advance;
    const [amount, setAmount] = useState<number | null>(advance.amount);
    const [plan, setPlan] = useState(() => wholeIn(firstMonth()));
    const [note, setNote] = useState("");
    const errors = useFormErrors();
    const total = amount ?? 0;
    const amountError = total <= 0 && "Enter the amount to give.";
    const monthsError = useMonthsCheck(plan, total, currency);
    const noteError = noteTooLong(note);
    const failure = failureOf(approve.error, { overPayOnAmount: true });

    function submit() {
        if (approve.isPending) return;
        if (amountError || monthsError || noteError) return errors.tried();
        approve.mutate({ id: advance.id, amount: total, months: monthsRequest(plan, total), note: note.trim() || undefined }, {
            onSuccess: () => {
                toast({ text: "Advance approved", sub: `${advance.person.name}, ${amountOf(total, currency)}`, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal size="sm" title="Approve the advance" sub={`${advance.person.name} asked for ${amountOf(advance.askedAmount ?? advance.amount, currency)}`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{failure.form && <FieldError message={failure.form} />}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={approve.isPending} onClick={submit}><Icon name="check" />Approve</button>
                </>
            }>
            {advance.reason && <p className="muted" style={{ marginTop: 0 }}>{advance.reason}</p>}
            <AmountLine id="advance-approve-amount" label={`Amount to give (${currency})`} amount={amount} onAmount={setAmount} currency={currency}
                error={errors.show("amount", amountError) ?? failure.amount} onBlur={errors.touch("amount")} />
            <div className="mt">
                <AdvanceMonthsEditor plan={plan} onPlan={(p) => { setPlan(p); errors.touch("months")(); }} mustPlan={total} currency={currency} first={firstMonth()}
                    liveError={errors.show("months", monthsError) ?? failure.months} />
            </div>
            <NoteField id="advance-approve-note" label="Note (optional)" note={note} onNote={setNote} error={errors.show("note", noteError)} onBlur={errors.touch("note")} />
        </Modal>
    );
}

/** Records an advance already handed over, for the person whose pay it comes off. */
export function GiveAdvanceModal({ person, currency, onClose }: { person: { id: number; name: string }; currency: string; onClose: () => void }) {
    const record = useRecordSalaryAdvance();
    const today = companyToday();
    const [amount, setAmount] = useState<number | null>(null);
    const [givenOn, setGivenOn] = useState(today);
    const [plan, setPlan] = useState(() => wholeIn(firstMonth()));
    const [note, setNote] = useState("");
    const errors = useFormErrors();
    const total = amount ?? 0;
    const amountError = total <= 0 && "Enter the amount handed over.";
    const dayError = !givenOn && "Pick the day it was given.";
    const monthsError = useMonthsCheck(plan, total, currency);
    const noteError = noteTooLong(note);
    const failure = failureOf(record.error, { overPayOnAmount: true });

    function submit() {
        if (record.isPending) return;
        if (amountError || dayError || monthsError || noteError) return errors.tried();
        record.mutate({ userId: person.id, amount: total, givenOn, months: monthsRequest(plan, total), note: note.trim() || undefined }, {
            onSuccess: () => {
                toast({ text: "Advance recorded", sub: `${person.name}, ${amountOf(total, currency)}`, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal size="sm" title="Give an advance" sub={`To ${person.name}. Part of their pay handed over early; what they earn doesn't change.`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{failure.form && <FieldError message={failure.form} />}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={record.isPending} onClick={submit}><Icon name="check" />Give the advance</button>
                </>
            }>
            <AmountLine id="advance-give-amount" label={`Amount (${currency})`} amount={amount} onAmount={setAmount} currency={currency}
                error={errors.show("amount", amountError) ?? failure.amount} onBlur={errors.touch("amount")} />
            <div className="field mt">
                <label className="label required" htmlFor="advance-give-day">Day given</label>
                <DateInput id="advance-give-day" value={givenOn} min={`${firstMonth()}-01`} max={today} required onChange={setGivenOn} />
                <FieldError message={errors.show("givenOn", dayError) ?? failure.givenOn} />
            </div>
            <div className="mt">
                <AdvanceMonthsEditor plan={plan} onPlan={(p) => { setPlan(p); errors.touch("months")(); }} mustPlan={total} currency={currency} first={firstMonth()}
                    liveError={errors.show("months", monthsError) ?? failure.months} />
            </div>
            <NoteField id="advance-give-note" label="Note (optional)" note={note} onNote={setNote} error={errors.show("note", noteError)} onBlur={errors.touch("note")} />
        </Modal>
    );
}

/** Changes the months still open: this month on. What closed months planned stays as it is. */
export function ChangeMonthsModal({ advance, onClose }: { advance: SalaryAdvance; onClose: () => void }) {
    const change = useChangeAdvanceMonths();
    const { currency } = advance;
    const [plan, setPlan] = useState(() => planOfOpen(advance.months, firstMonth()));
    const errors = useFormErrors();
    // what the open months must add up to: the advance, less what the closed months planned (the API checks it)
    const closed = advance.months.filter((m) => m.closed).reduce((t, m) => t + m.planned, 0);
    const mustPlan = Math.round((advance.amount - closed) * 100) / 100;
    const monthsError = useMonthsCheck(plan, mustPlan, currency);
    const failure = failureOf(change.error);

    function submit() {
        if (change.isPending) return;
        if (monthsError) return errors.tried();
        change.mutate({ id: advance.id, months: monthsRequest(plan, mustPlan) }, {
            onSuccess: () => {
                toast({ text: "Months changed", sub: advance.person.name, icon: "checkCircle" });
                onClose();
            },
        });
    }

    return (
        <Modal size="sm" title="Change the months" sub={`${advance.person.name}, ${amountOf(advance.amount, currency)}`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{failure.form && <FieldError message={failure.form} />}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={change.isPending} onClick={submit}><Icon name="check" />Save the months</button>
                </>
            }>
            <p className="muted" style={{ marginTop: 0 }}>
                {closed > 0
                    ? `Months already closed keep what they planned (${amountOf(closed, currency)}). The months from this month on must add up to ${amountOf(mustPlan, currency)}.`
                    : `The months must add up to ${amountOf(mustPlan, currency)}.`}
            </p>
            <AdvanceMonthsEditor plan={plan} onPlan={(p) => { setPlan(p); errors.touch("months")(); }} mustPlan={mustPlan} currency={currency} first={firstMonth()}
                liveError={errors.show("months", monthsError) ?? failure.months} />
        </Modal>
    );
}

/** Declines a request, with an optional word on why. */
export function DeclineAdvanceModal({ advance, onClose }: { advance: SalaryAdvance; onClose: () => void }) {
    const decline = useDeclineSalaryAdvance();
    const [note, setNote] = useState("");
    const errors = useFormErrors();
    const noteError = noteTooLong(note);
    function submit() {
        if (decline.isPending) return;
        if (noteError) return errors.tried();
        decline.mutate({ id: advance.id, note: note.trim() || undefined }, {
            onSuccess: () => {
                toast({ text: "Advance declined", sub: advance.person.name, icon: "checkCircle" });
                onClose();
            },
        });
    }
    return (
        <Modal size="sm" title="Decline the request?" sub={`${advance.person.name} asked for ${amountOf(advance.amount, advance.currency)}`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{failureOf(decline.error).form && <FieldError message={failureOf(decline.error).form!} />}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-danger" disabled={decline.isPending} onClick={submit}>Decline</button>
                </>
            }>
            <NoteField id="advance-decline-note" label="Why (optional)" note={note} onNote={setNote} error={errors.show("note", noteError)} onBlur={errors.touch("note")} />
        </Modal>
    );
}

/** Cancels an advance given by mistake, in the month it was given. */
export function CancelAdvanceModal({ advance, onClose }: { advance: SalaryAdvance; onClose: () => void }) {
    const cancel = useCancelSalaryAdvance();
    const [note, setNote] = useState("");
    const errors = useFormErrors();
    const noteError = noteTooLong(note);
    function submit() {
        if (cancel.isPending) return;
        if (noteError) return errors.tried();
        cancel.mutate({ id: advance.id, note: note.trim() || undefined }, {
            onSuccess: () => {
                toast({ text: "Advance cancelled", sub: advance.person.name, icon: "checkCircle" });
                onClose();
            },
        });
    }
    return (
        <Modal size="sm" title="Cancel the advance?" sub={`${advance.person.name}, ${amountOf(advance.amount, advance.currency)}`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{failureOf(cancel.error).form && <FieldError message={failureOf(cancel.error).form!} />}</div>
                    <button className="btn" onClick={onClose}>Keep it</button>
                    <button className="btn btn-danger" disabled={cancel.isPending} onClick={submit}>Cancel the advance</button>
                </>
            }>
            <p className="muted" style={{ marginTop: 0 }}>For an advance given by mistake. It can only be cancelled in the month it was given.</p>
            <NoteField id="advance-cancel-note" label="Why (optional)" note={note} onNote={setNote} error={errors.show("note", noteError)} onBlur={errors.touch("note")} />
        </Modal>
    );
}

/** Closes what is left of an advance: repaid in cash, or written off as a company expense today. */
export function SettleAdvanceModal({ advance, onClose }: { advance: SalaryAdvance; onClose: () => void }) {
    const settle = useSettleSalaryAdvance();
    const [kind, setKind] = useState<SalaryAdvanceSettlement>("cash");
    const [note, setNote] = useState("");
    const errors = useFormErrors();
    const noteError = noteTooLong(note);
    const left = advance.left ?? 0;
    function submit() {
        if (settle.isPending) return;
        if (noteError) return errors.tried();
        settle.mutate({ id: advance.id, kind, note: note.trim() || undefined }, {
            onSuccess: () => {
                toast({ text: kind === "cash" ? "Settled: repaid in cash" : "Written off", sub: `${advance.person.name}, ${amountOf(left, advance.currency)}`, icon: "checkCircle" });
                onClose();
            },
        });
    }
    return (
        <Modal size="sm" title="Settle what is left" sub={`${advance.person.name}, ${amountOf(left, advance.currency)} left`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{failureOf(settle.error).form && <FieldError message={failureOf(settle.error).form!} />}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className={kind === "written_off" ? "btn btn-danger" : "btn btn-primary"} disabled={settle.isPending} onClick={submit}>
                        {kind === "cash" ? "Mark as repaid" : "Write it off"}
                    </button>
                </>
            }>
            <div className="field">
                <div className="label">How was it settled?</div>
                <Segmented aria-label="How it was settled" value={kind} onChange={setKind}
                    options={[{ value: "cash", label: "Repaid in cash" }, { value: "written_off", label: "Write off" }]} />
                <div className="hint mt-s">
                    {kind === "cash"
                        ? `${amountOf(left, advance.currency)} was paid back in cash. Nothing more comes off their pay.`
                        : `${amountOf(left, advance.currency)} is given up. A write-off is a company expense today: it comes off the company's profit on ${fmtDateY(companyToday())}.`}
                </div>
            </div>
            <NoteField id="advance-settle-note" label="Note (optional)" note={note} onNote={setNote} error={errors.show("note", noteError)} onBlur={errors.touch("note")} />
        </Modal>
    );
}
