import { useState } from "react";
import { errorMessage } from "@/api/errors";
import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useCompanySettings } from "@/app/shell/shellQueries";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import DateInput from "@/shared/components/Forms/DateInput";
import { SwitchRow } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import { companyToday, fmtDateY, fmtNumber } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { useBillingSettings, type BillingSettings } from "../billing/billingApi";
import { Always, OnlyFor } from "./SettingBits";
import { useAddExchangeRate, useExchangeRates, useSaveBillingSettings, useSaveCompanySettings, useSetWorkingTime, useWorkingTime } from "./settingsApi";
import { notSaved, saved } from "./settingsToasts";
import { nextChange } from "./workingTime";

const TERMS = [
    { value: "0", label: "Due on receipt" }, { value: "15", label: "Net 15 - due in 15 days" }, { value: "30", label: "Net 30 - due in 30 days" },
    { value: "45", label: "Net 45 - due in 45 days" }, { value: "60", label: "Net 60 - due in 60 days" },
];
const OVERTIME = [{ value: "1", label: "×1 - same as normal" }, { value: "1.25", label: "×1.25" }, { value: "1.5", label: "×1.5" }, { value: "2", label: "×2" }];

/** The prototype's Settings → Finance: the rules behind revenue, cost and pay, and invoicing and payments. */
export default function FinanceSettings({ domain }: { domain: Domain }) {
    const permissions = usePermissions();
    const companyQuery = useCompanySettings();
    const wtQuery = useWorkingTime();
    const company = companyQuery.data;
    const wt = wtQuery.data;
    const failed = companyQuery.isError ? companyQuery : wtQuery.isError ? wtQuery : null;
    const saveCompany = useSaveCompanySettings();
    const setWt = useSetWorkingTime();
    const canCompany = permissions.has(P.COMPANY_SETTINGS_MANAGE);
    const canTime = permissions.has(P.WORKING_TIME_MANAGE);
    const seesBilling = permissions.hasAny(P.BILLING_SETTINGS_MANAGE, P.FINANCIAL_VIEW);
    const billingQuery = useBillingSettings(domain, seesBilling);
    const billing = billingQuery.data;
    const overtime = wt ? nextChange(wt, companyToday()) : null;
    const overtimeOpts = overtime && !OVERTIME.some((o) => +o.value === overtime.latest.overtimeMultiplier)
        ? [...OVERTIME, { value: String(overtime.latest.overtimeMultiplier), label: `×${overtime.latest.overtimeMultiplier}` }] : OVERTIME;

    return (
        <>
            <div className="panel">
                <div className="panel-head"><div><div className="panel-title">Finance</div><div className="panel-sub">Rules behind revenue, cost and pay in this business.</div></div></div>
                <div className="panel-body">
                    {failed ? <LoadError error={failed.error} retry={() => failed.refetch()} what="the finance settings" />
                        : !company || !overtime ? <SkeletonLines lines={6} /> : (
                        <>
                            <SwitchRow title="Default currency" description={<>Pre-selected when adding an employee's pay, an expense or a payment.{!canCompany && <OnlyFor who="a super admin" />}</>} control={
                                <Select className="select sm" style={{ width: 120 }} aria-label="Default currency" disabled={!canCompany || saveCompany.isPending} value={company.defaultCurrency}
                                    onChange={(v) => saveCompany.mutate({
                                        name: company.name, address: company.address, website: company.website, weekStart: company.weekStart,
                                        use24HourTime: company.use24HourTime, defaultCurrency: v,
                                    }, { onSuccess: saved(), onError: notSaved })}
                                    options={[{ value: "USD", label: "USD" }, { value: "LBP", label: "LBP" }]} />
                            } />
                            <SwitchRow title="Overtime pay rate"
                                description={<>What an overtime hour (before 9 AM, after 5 PM, weekends) is paid, as a multiple of the normal rate. Used by Salaries; project labour cost is unaffected.{!canTime && <OnlyFor who="a super admin" />}</>}
                                control={
                                    <Select className="select sm" style={{ width: 150 }} aria-label="Overtime pay rate" disabled={!canTime || setWt.isPending} value={String(overtime.latest.overtimeMultiplier)}
                                        onChange={(v) => setWt.mutate(overtime.body({ overtimeMultiplier: +v }), { onSuccess: saved("Overtime rate updated", overtime.when), onError: notSaved })}
                                        options={overtimeOpts} />
                                } />
                            <SwitchRow title="Mixed currencies" description="People paid in another currency are shown beside the dollar figures. Totals are shown separately and never converted." control={<span className="badge cur-chip">No conversion</span>} />
                            <SwitchRow title="Lock the payment when a project is completed" description="Stops the revenue figure moving after the result is final." control={<Always />} />
                            <SwitchRow title="Pay changes apply forward only" description="Past hours keep the rate they were logged at, so closed projects and paid months never change value." control={<Always />} />
                            <SwitchRow title="Company expenses" description="Subscriptions and running costs belong to the company, not to this business. They are managed above it and never reach a project or a client." control={<span className="badge">Company level</span>} />
                            <SwitchRow title="Who can see financials" description="Cost rates, pay, revenue and profit." control={<Always>Admins only</Always>} />
                            <SwitchRow title="Revenue recognition" description="How revenue is spread across months: in step with each project's progress (its requirements)." control={<Always>By progress</Always>} />
                        </>
                    )}
                </div>
            </div>

            {seesBilling && (
                <div className="panel mt">
                    <div className="panel-head">
                        <div><div className="panel-title">Invoicing and payments</div><div className="panel-sub">Invoices request money; payments record what arrived. Neither one changes revenue or profit.</div></div>
                    </div>
                    <div className="panel-body">
                        {billingQuery.isError ? <LoadError error={billingQuery.error} retry={() => billingQuery.refetch()} what="the invoicing settings" />
                            : !billing ? <SkeletonLines lines={6} /> : <Invoicing domain={domain} billing={billing} />}
                    </div>
                </div>
            )}
        </>
    );
}

type Bank = { bankAccount: string; bankName: string; iban: string; swift: string; termsText: string; footer: string };

function Invoicing({ domain, billing: b }: { domain: Domain; billing: BillingSettings }) {
    const permissions = usePermissions();
    const canEdit = permissions.has(P.BILLING_SETTINGS_MANAGE);
    const save = useSaveBillingSettings(domain);
    const [bank, setBank] = useState<Bank | null>(null);
    const [prefix, setPrefix] = useState<string | null>(null);
    const year = companyToday().slice(0, 4);
    const body: Schemas["SaveBillingSettingsRequest"] = {
        bankAccount: b.bankAccount, bankName: b.bankName, iban: b.iban, swift: b.swift, termsText: b.termsText, footer: b.footer,
        defaultTermsDays: b.defaultTermsDays, invoicePrefix: b.invoicePrefix,
    };
    const text = (v: string) => v.trim() || null;
    const bankLine = [b.bankAccount, b.bankName, b.iban, b.swift].filter(Boolean).join(" · ") || "Not set yet";

    return (
        <>
            <SwitchRow title="Default payment terms" description="Sets each new invoice's due date, and therefore when it counts as overdue." control={
                <Select className="select sm" style={{ width: 190 }} aria-label="Default payment terms" disabled={!canEdit || save.isPending} value={String(b.defaultTermsDays)}
                    onChange={(v) => save.mutate({ ...body, defaultTermsDays: +v }, { onSuccess: saved("Payment terms updated"), onError: notSaved })}
                    options={TERMS.some((t) => +t.value === b.defaultTermsDays) ? TERMS : [...TERMS, { value: String(b.defaultTermsDays), label: `Net ${b.defaultTermsDays}` }]} />
            } />
            {prefix == null ? (
                <SwitchRow title="Invoice numbering" description="One sequence per calendar year, across the whole business." control={
                    <div className="row" style={{ gap: 8 }}>
                        <span className="badge mono">{b.invoicePrefix}-{year}-001</span>
                        {canEdit && <button className="btn btn-sm" onClick={() => setPrefix(b.invoicePrefix)}>Edit</button>}
                    </div>
                } />
            ) : (
                <SwitchRow title="Invoice numbering" description="The letters before the year. Invoices already numbered keep theirs." control={
                    <div className="row" style={{ gap: 6 }}>
                        <input className="input mono" style={{ width: 90 }} aria-label="Invoice prefix" value={prefix} maxLength={8}
                            onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
                        <button className="btn btn-sm btn-primary" disabled={!prefix || save.isPending}
                            onClick={() => save.mutate({ ...body, invoicePrefix: prefix }, { onSuccess: () => { saved("Invoice numbering updated", `Next invoice: ${prefix}-${year}-…`)(); setPrefix(null); }, onError: notSaved })}>Save</button>
                        <button className="btn btn-sm" onClick={() => setPrefix(null)}>Cancel</button>
                    </div>
                } />
            )}
            <SwitchRow title="Tax on invoices" description="Invoices bill milestones of an agreed project value, so no tax line is applied in this version." control={<span className="badge">Not applied</span>} />
            <LbpRate />
            {bank ? (
                <div className="switch-row" style={{ alignItems: "flex-start" }}>
                    <div className="grow">
                        <div style={{ fontWeight: 600 }}>Bank details printed on every invoice</div>
                        <div className="grid g-2 mt-s">
                            <div className="field"><label className="label" htmlFor="b-account">Account name</label><input id="b-account" className="input" value={bank.bankAccount} onChange={(e) => setBank({ ...bank, bankAccount: e.target.value })} /></div>
                            <div className="field"><label className="label" htmlFor="b-bank">Bank</label><input id="b-bank" className="input" value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} /></div>
                        </div>
                        <div className="grid g-2 mt-s">
                            <div className="field"><label className="label" htmlFor="b-iban">IBAN</label><input id="b-iban" className="input mono" value={bank.iban} onChange={(e) => setBank({ ...bank, iban: e.target.value })} /></div>
                            <div className="field"><label className="label" htmlFor="b-swift">SWIFT</label><input id="b-swift" className="input mono" value={bank.swift} onChange={(e) => setBank({ ...bank, swift: e.target.value })} /></div>
                        </div>
                        <div className="field mt-s">
                            <label className="label" htmlFor="b-terms">Payment terms text</label>
                            <input id="b-terms" className="input" placeholder="e.g. Late payments may incur a fee." value={bank.termsText} onChange={(e) => setBank({ ...bank, termsText: e.target.value })} />
                            <div className="hint">Printed after the due date under "How to pay".</div>
                        </div>
                        <div className="field mt-s">
                            <label className="label" htmlFor="b-footer">Invoice footer</label>
                            <input id="b-footer" className="input" placeholder="e.g. Thank you for your business." value={bank.footer} onChange={(e) => setBank({ ...bank, footer: e.target.value })} />
                        </div>
                        {save.error != null && <div className="err mt-s" style={{ fontSize: 12 }}><Icon name="alert" />{errorMessage(save.error)}</div>}
                    </div>
                    <div className="stack" style={{ gap: 6 }}>
                        <button className="btn btn-sm btn-primary" disabled={!bank.bankAccount.trim() || !bank.iban.trim() || save.isPending}
                            onClick={() => save.mutate({
                                ...body, bankAccount: text(bank.bankAccount), bankName: text(bank.bankName), iban: text(bank.iban), swift: text(bank.swift),
                                termsText: text(bank.termsText), footer: text(bank.footer),
                            }, { onSuccess: () => { saved("Bank details updated")(); setBank(null); } })}>Save</button>
                        <button className="btn btn-sm" onClick={() => { setBank(null); save.reset(); }}>Cancel</button>
                    </div>
                </div>
            ) : (
                <SwitchRow title="Bank details printed on every invoice" description={bankLine} control={canEdit ? (
                    <button className="btn btn-sm" onClick={() => setBank({
                        bankAccount: b.bankAccount ?? "", bankName: b.bankName ?? "", iban: b.iban ?? "", swift: b.swift ?? "", termsText: b.termsText ?? "", footer: b.footer ?? "",
                    })}>Edit</button>
                ) : null} />
            )}
            <SwitchRow title="Internal projects are never invoiced" description="They have no client and no payment - they are company cost only." control={<Always>Enforced</Always>} />
            <SwitchRow title="Who can see billing" description="Invoices, payments and outstanding balances. Employees see none of it." control={<Always>Admins only</Always>} />
        </>
    );
}

/** The LBP rate payments are converted at, and every rate set before it (exchange_rate:manage to set one). */
function LbpRate() {
    const permissions = usePermissions();
    const canSet = permissions.has(P.EXCHANGE_RATE_MANAGE);
    const rates = useExchangeRates("LBP", permissions.has(P.FINANCIAL_VIEW)).data ?? [];
    const add = useAddExchangeRate();
    const [editing, setEditing] = useState<{ rate: number | ""; from: string } | null>(null);
    const today = companyToday();
    const current = rates.find((r) => r.effectiveFrom <= today) ?? rates[0];
    const earlier = rates.filter((r) => r !== current).slice(0, 4);

    return (
        <SwitchRow title="Payments in another currency"
            description={
                <>
                    A payment can be received in LBP and converted at the rate of its day. Both amounts are kept, and payments already recorded keep their rate.
                    {earlier.length > 0 && <span className="muted"> Before: {earlier.map((r) => `${fmtNumber(r.ratePerUsd)} from ${fmtDateY(r.effectiveFrom)}`).join(" · ")}.</span>}
                    {add.error != null && <span className="err"> {errorMessage(add.error)}</span>}
                </>
            }
            control={editing ? (
                <div className="row wrap" style={{ gap: 6 }}>
                    <input className="input mono" style={{ width: 110 }} inputMode="numeric" aria-label="LBP per dollar" value={editing.rate}
                        onChange={(e) => setEditing({ ...editing, rate: e.target.value === "" ? "" : +e.target.value.replace(/[^0-9.]/g, "") || 0 })} />
                    <div style={{ width: 150 }}><DateInput value={editing.from} min={today} onChange={(from) => setEditing({ ...editing, from })} aria-label="From" /></div>
                    <button className="btn btn-sm btn-primary" disabled={!editing.rate || add.isPending}
                        onClick={() => add.mutate({ currency: "LBP", ratePerUsd: +editing.rate, effectiveFrom: editing.from },
                            { onSuccess: () => { saved("Exchange rate set", `LBP · ${fmtNumber(+editing.rate)}/$ from ${fmtDateY(editing.from)}`)(); setEditing(null); } })}>Save</button>
                    <button className="btn btn-sm" onClick={() => { setEditing(null); add.reset(); }}>Cancel</button>
                </div>
            ) : (
                <div className="row" style={{ gap: 8 }}>
                    <span className="badge cur-chip">{current ? `LBP · ${fmtNumber(current.ratePerUsd)}/$` : "No rate yet"}</span>
                    {canSet && <button className="btn btn-sm" onClick={() => setEditing({ rate: current?.ratePerUsd ?? "", from: today })}>Change</button>}
                </div>
            )} />
    );
}
