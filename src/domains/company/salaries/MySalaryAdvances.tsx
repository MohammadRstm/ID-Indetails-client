import { useState } from "react";
import { errorMessage, isStatus, toApiError } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import AmountField from "@/shared/components/Forms/AmountField";
import AutoGrowTextarea from "@/shared/components/Forms/AutoGrowTextarea";
import { FieldError } from "@/shared/components/Forms/Field";
import Modal from "@/shared/components/Overlays/Modal";
import { fmtDateY, fmtMonthY } from "@/shared/format/time";
import { money } from "@/shared/format/money";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { AdvanceStatusBadge } from "./AdvanceStatusBadge";
import { ADVANCE_NOTE_MAX, useAskSalaryAdvance, useMySalaryAdvances, useWithdrawSalaryAdvance, type MySalaryAdvance } from "./salaryAdvancesApi";

/** Why asking is switched off, in the person's words. */
const CANNOT_ASK: Record<string, string> = {
    salary_advance_no_pay: "Your pay isn't set yet, so there is nothing to advance.",
    salary_advance_pending: "Your last request is still waiting for a decision.",
    salary_advance_open: "Your last advance isn't paid back yet.",
};

const amountOf = (value: number, currency: string) => money.exact(value, currency, { cents: true });

/** Asks for part of one's pay early: the amount, in the currency of one's pay, and why. A super admin decides. */
function AskModal({ currency, onClose }: { currency: string; onClose: () => void }) {
    const ask = useAskSalaryAdvance();
    const [amount, setAmount] = useState<number | null>(null);
    const [reason, setReason] = useState("");
    const errors = useFormErrors();
    const refused = ask.error ? toApiError(ask.error) : null;

    const amountError = !amount || amount <= 0 ? "Enter the amount you need." : false;
    const reasonError = !reason.trim() ? "Say why you need the advance." : reason.trim().length > ADVANCE_NOTE_MAX && `At most ${ADVANCE_NOTE_MAX} characters.`;

    function submit() {
        if (ask.isPending) return;
        if (amountError || reasonError) return errors.tried();
        ask.mutate({ amount: amount!, reason: reason.trim() }, {
            onSuccess: () => {
                toast({ text: "Asked for an advance", sub: "A super admin will decide, and you'll be told.", icon: "checkCircle" });
                onClose();
            },
        });
    }

    const fields = refused?.fieldErrors ?? {};
    const shownAtFoot = refused && !fields.amount && !fields.reason;
    return (
        <Modal size="sm" title="Ask for an advance" sub="Part of your pay, handed over early and taken off in the months a super admin sets." onClose={onClose}
            foot={
                <>
                    <div className="grow">{shownAtFoot && <FieldError message={errorMessage(ask.error)} />}</div>
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={ask.isPending} onClick={submit}><Icon name="send" />Send the request</button>
                </>
            }>
            <div className="field">
                <label className="label required" htmlFor="advance-amount">Amount ({currency})</label>
                <AmountField id="advance-amount" value={amount} currency={currency} currencies={false} onChange={setAmount} onBlur={errors.touch("amount")} />
                <FieldError message={errors.show("amount", amountError) ?? fields.amount} />
            </div>
            <div className="field mt">
                <label className="label required" htmlFor="advance-reason">Reason</label>
                <AutoGrowTextarea id="advance-reason" className="input" minRows={2} maxRows={6} maxLength={ADVANCE_NOTE_MAX} value={reason}
                    placeholder="e.g. A medical bill." onChange={(e) => setReason(e.target.value)} onBlur={errors.touch("reason")} />
                <FieldError message={errors.show("reason", reasonError) ?? fields.reason} />
            </div>
        </Modal>
    );
}

/** Takes back a request nobody has decided yet. */
function WithdrawModal({ advance, onClose }: { advance: MySalaryAdvance; onClose: () => void }) {
    const withdraw = useWithdrawSalaryAdvance();
    function submit() {
        if (withdraw.isPending) return;
        withdraw.mutate(advance.id, {
            onSuccess: () => {
                toast({ text: "Request withdrawn", sub: `Asked on ${fmtDateY(advance.createdAt)}`, icon: "checkCircle" });
                onClose();
            },
        });
    }
    return (
        <Modal size="sm" title="Withdraw the request?" sub={`Asked on ${fmtDateY(advance.createdAt)}`} onClose={onClose}
            foot={
                <>
                    <div className="grow">{withdraw.error && <FieldError message={errorMessage(withdraw.error)} />}</div>
                    <button className="btn" onClick={onClose}>Keep it</button>
                    <button className="btn btn-danger" disabled={withdraw.isPending} onClick={submit}>Withdraw</button>
                </>
            }>
            <p className="muted" style={{ margin: 0 }}>Nobody has decided on it yet. You can ask again any time.</p>
        </Modal>
    );
}

/** One advance: its status, what was asked and given, why, and the months it comes off (ticked once taken). */
function AdvanceRow({ advance, onWithdraw }: { advance: MySalaryAdvance; onWithdraw: () => void }) {
    const { currency } = advance;
    const beingRepaid = advance.status === "approved" && !advance.settledKind && (advance.left ?? 0) > 0;
    return (
        <li className="row start" style={{ gap: 12, padding: "12px 0", borderTop: "1px solid var(--line)", alignItems: "flex-start" }}>
            <div className="grow" style={{ minWidth: 0 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                    <b className="mono">{amountOf(advance.amount, currency)}</b>
                    <AdvanceStatusBadge advance={advance} />
                    {advance.askedAmount != null && advance.askedAmount !== advance.amount && (
                        <span className="muted" style={{ fontSize: 11.5 }}>You asked for {amountOf(advance.askedAmount, currency)}</span>
                    )}
                </div>
                {advance.reason && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{advance.reason}</div>}
                {advance.decisionNote && <div style={{ fontSize: 12, marginTop: 4 }}>Note: {advance.decisionNote}</div>}
                <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                    {advance.givenOn ? `Given on ${fmtDateY(advance.givenOn)}` : `Asked on ${fmtDateY(advance.createdAt)}`}
                </div>
                {advance.months.length > 0 && (
                    <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                        {advance.months.map((m) => (
                            <span key={m.month} className="badge" title={fmtMonthY(m.month)}>
                                {fmtMonthY(m.month).slice(0, 3)} −{amountOf(m.planned, currency)}{m.closed ? " ✓" : ""}
                            </span>
                        ))}
                    </div>
                )}
                {beingRepaid && <div style={{ fontSize: 12, marginTop: 8 }}><b className="mono">{amountOf(advance.left!, currency)}</b> still to repay</div>}
            </div>
            {advance.status === "pending" && (
                <button className="btn btn-sm" onClick={onWithdraw} aria-label={`Withdraw the request from ${fmtDateY(advance.createdAt)}`}>Withdraw</button>
            )}
        </li>
    );
}

/**
 * The signed-in person's own salary advances: ask for one, follow each request, and see what is still to repay.
 * It never shows what each month took, or who decided. It is hidden for anyone the API doesn't offer it to.
 */
export default function MySalaryAdvances() {
    const mine = useMySalaryAdvances();
    const [asking, setAsking] = useState(false);
    const [withdrawing, setWithdrawing] = useState<MySalaryAdvance | null>(null);
    const data = mine.data;

    if (isStatus(mine.error, 404) || isStatus(mine.error, 403)) return null;

    const reason = data && !data.canAsk ? (CANNOT_ASK[data.cannotAskBecause ?? ""] ?? "You can't ask for an advance right now.") : null;
    return (
        <div className="panel mt" aria-label="Salary advance">
            <div className="panel-head">
                <div>
                    <div className="panel-title">Salary advance</div>
                    <div className="panel-sub">Part of your pay handed over early. A super admin approves it, or declines it.</div>
                </div>
                <div className="row" style={{ gap: 10 }}>
                    {reason && <span className="muted" style={{ fontSize: 11.5 }}>{reason}</span>}
                    <button className="btn btn-primary btn-sm" disabled={!data?.canAsk} title={reason ?? undefined} onClick={() => setAsking(true)}>
                        <Icon name="plus" />Ask for an advance
                    </button>
                </div>
            </div>
            {loadFailed(mine) ? <div className="panel-body"><LoadError error={mine.error} retry={() => mine.refetch()} what="your salary advances" /></div>
                : !data ? <div className="panel-body"><SkeletonLines lines={3} /></div>
                    : data.items.length === 0 ? <Empty art="time" title="No salary advances" text="When you ask for one, it is listed here with what was decided." />
                        : (
                            <ul className="panel-body" style={{ listStyle: "none", margin: 0, paddingTop: 0 }}>
                                {data.items.map((a) => <AdvanceRow key={a.id} advance={a} onWithdraw={() => setWithdrawing(a)} />)}
                            </ul>
                        )}
            {asking && data && <AskModal currency={data.currency ?? "USD"} onClose={() => setAsking(false)} />}
            {withdrawing && <WithdrawModal advance={withdrawing} onClose={() => setWithdrawing(null)} />}
        </div>
    );
}
