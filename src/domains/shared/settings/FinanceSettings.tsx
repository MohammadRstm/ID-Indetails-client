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
import { SwitchRow, Toggle } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import { addDays, companyToday, fmtDateY, fmtNumber } from "@/shared/format/time";
import { FieldError } from "@/shared/components/Forms/Field";
import NumberField from "@/shared/components/Forms/NumberField";
import { RATE } from "@/shared/format/limits";
import { DOMAIN_LABEL, plural } from "@/shared/format/labels";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { billingSettingsMissing, useBillingSettings, type BillingSettings } from "../billing/billingApi";
import { Always, OnlyFor } from "./SettingBits";
import { useAddExchangeRate, useExchangeRates, useSaveBillingSettings, useSaveCompanySettings, useSetWorkingTime, useWorkingTime } from "./settingsApi";
import { notSaved, saved } from "./settingsToasts";
import { nextChange } from "./workingTime";
import { loadFailed } from "@/api/queryState";
import HelpHint from "@/domains/shared/help/HelpHint";

const TERMS = [
    { value: "0", label: "Due on receipt" }, { value: "15", label: "Net 15 - due in 15 days" }, { value: "30", label: "Net 30 - due in 30 days" },
    { value: "45", label: "Net 45 - due in 45 days" }, { value: "60", label: "Net 60 - due in 60 days" },
];
// overdue reminders: when the first goes, how far apart the next ones are, and how many at most
const FIRST = [
    { value: "1", label: "The day after it's due" }, { value: "3", label: "3 days after" }, { value: "7", label: "A week after" },
    { value: "14", label: "2 weeks after" }, { value: "30", label: "30 days after" },
];
const APART = [{ value: "3", label: "Then every 3 days" }, { value: "7", label: "Then every week" }, { value: "14", label: "Then every 2 weeks" }, { value: "30", label: "Then every 30 days" }];
const AT_MOST = [1, 2, 3, 4, 5, 10].map((n) => ({ value: String(n), label: `At most ${plural(n, "reminder")}` }));
/** The options, with the saved value added when it isn't one of them. */
const withValue = (options: { value: string; label: string }[], value: number, label: string) =>
    options.some((o) => +o.value === value) ? options : [...options, { value: String(value), label }];

const OVERTIME = [{ value: "1", label: "×1 - same as normal" }, { value: "1.25", label: "×1.25" }, { value: "1.5", label: "×1.5" }, { value: "2", label: "×2" }];

/** The prototype's Settings → Finance: the rules behind revenue, cost and pay, and invoicing and payments. */
export default function FinanceSettings({ domain }: { domain: Domain }) {
    const permissions = usePermissions();
    const companyQuery = useCompanySettings();
    const wtQuery = useWorkingTime();
    const company = companyQuery.data;
    const wt = wtQuery.data;
    const failed = loadFailed(companyQuery) ? companyQuery : loadFailed(wtQuery) ? wtQuery : null;
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
            {/* the currency and overtime rate, with the fixed rules beside them, for whoever may change either */}
            {(canCompany || canTime) && (
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
                            <SwitchRow title={<>Overtime pay rate<HelpHint article="overtime" label="overtime">Time outside someone's hours, all of a day off, and time past what the day requires.</HelpHint></>}
                                description={<>What an overtime hour (outside someone's hours, on a day off, or past the day's required hours) is paid, as a multiple of the normal rate (for a salary, its true hourly rate: the salary ÷ a standard month's paid hours). Used by Salaries; project labour cost is unaffected.{!canTime && <OnlyFor who="a super admin" />}</>}
                                control={
                                    <Select className="select sm" style={{ width: 150 }} aria-label="Overtime pay rate" disabled={!canTime || setWt.isPending} value={String(overtime.latest.overtimeMultiplier)}
                                        onChange={(v) => setWt.mutate(overtime.body({ overtimeMultiplier: +v }), { onSuccess: saved("Overtime rate updated", overtime.when), onError: notSaved })}
                                        options={overtimeOpts} />
                                } />
                            <SwitchRow title="Mixed currencies" description="People paid in another currency are shown beside the dollar figures. Totals are shown separately and never converted." control={<span className="badge cur-chip">No conversion</span>} />
                            <SwitchRow title="Lock the payment when a project is completed" description="Stops the revenue figure moving after the result is final." control={<Always />} />
                            <SwitchRow title="Pay changes apply forward only" description="Past hours keep the rate they were logged at, so closed projects and paid months never change value." control={<Always />} />
                            <SwitchRow title="Company expenses" description="Subscriptions and running costs belong to the company, not to this business. They are managed above it and never reach a project or a client." control={<span className="badge">Company level</span>} />
                            <SwitchRow title="Who can see financials" description="Cost rates, pay, revenue and profit." control={<Always>Whoever is given it</Always>} />
                            <SwitchRow title="Revenue" description="How revenue counts on the overview, the dashboards and Financials: the money received from clients, on the day it arrives." control={<Always>As received</Always>} />
                        </>
                    )}
                </div>
            </div>
            )}

            {seesBilling && (
                <div className="panel mt">
                    <div className="panel-head">
                        <div><div className="panel-title">Invoicing and payments</div><div className="panel-sub">Invoices request money; payments record what arrived. Neither one changes revenue or profit.</div></div>
                    </div>
                    <div className="panel-body">
                        {billingSettingsMissing(billingQuery.error) ? <SetUpInvoicing domain={domain} />
                            : loadFailed(billingQuery) ? <LoadError error={billingQuery.error} retry={() => billingQuery.refetch()} what="the invoicing settings" />
                            : !billing ? <SkeletonLines lines={6} /> : <Invoicing domain={domain} billing={billing} />}
                    </div>
                </div>
            )}
            {/* the rate sits with invoicing; someone who only sets it gets it on its own */}
            {!seesBilling && permissions.has(P.EXCHANGE_RATE_MANAGE) && (
                <div className="panel mt">
                    <div className="panel-head"><div><div className="panel-title">Exchange rate<HelpHint article="exchange-rates" label="the exchange rate">How many LBP one US dollar buys, from a day. Each amount is converted at the rate of its own day.</HelpHint></div><div className="panel-sub">What payments received in LBP are converted at.</div></div></div>
                    <div className="panel-body"><LbpRate /></div>
                </div>
            )}
        </>
    );
}

type Bank = { bankAccount: string; bankName: string; iban: string; swift: string; termsText: string; footer: string };

const PREFIX = /^[A-Z][A-Z0-9]{0,7}$/;
const SWIFT = /^[A-Za-z0-9]{8}([A-Za-z0-9]{3})?$/;
const text = (v: string) => v.trim() || null;

/** What is wrong with bank details, as the API checks them. The account name and IBAN are what a client pays with. */
function bankErrors(bank: Bank) {
    return {
        bankAccount: !bank.bankAccount.trim() && "Say whose account the client pays into.",
        iban: !bank.iban.trim() && "Enter the IBAN the client pays into.",
        swift: bank.swift.trim() !== "" && !SWIFT.test(bank.swift.trim()) && "A SWIFT code is 8 or 11 letters or digits.",
    };
}
const bankOk = (bank: Bank) => Object.values(bankErrors(bank)).every((e) => !e);

/** The bank details' fields, for setting them up and for changing them. */
function BankFields({ bank, onChange, errors }: { bank: Bank; onChange: (bank: Bank) => void; errors: ReturnType<typeof useFormErrors> }) {
    const wrong = bankErrors(bank);
    return (
        <>
            <div className="grid g-2 mt-s">
                <div className="field">
                    <label className="label required" htmlFor="b-account">Account name</label>
                    <input id="b-account" className="input" placeholder="e.g. ID InDetails SAL" value={bank.bankAccount} onBlur={errors.touch("bankAccount")}
                        onChange={(e) => onChange({ ...bank, bankAccount: e.target.value })} />
                    <FieldError message={errors.show("bankAccount", wrong.bankAccount)} />
                </div>
                <div className="field">
                    <label className="label" htmlFor="b-bank">Bank</label>
                    <input id="b-bank" className="input" placeholder="Optional - e.g. Bank of Beirut" value={bank.bankName} onChange={(e) => onChange({ ...bank, bankName: e.target.value })} />
                </div>
            </div>
            <div className="grid g-2 mt-s">
                <div className="field">
                    <label className="label required" htmlFor="b-iban">IBAN</label>
                    <input id="b-iban" className="input mono" value={bank.iban} onBlur={errors.touch("iban")} onChange={(e) => onChange({ ...bank, iban: e.target.value })} />
                    <FieldError message={errors.show("iban", wrong.iban)} />
                </div>
                <div className="field">
                    <label className="label" htmlFor="b-swift">SWIFT</label>
                    <input id="b-swift" className="input mono" placeholder="Optional" value={bank.swift} onBlur={errors.touch("swift")} onChange={(e) => onChange({ ...bank, swift: e.target.value })} />
                    <FieldError message={errors.show("swift", wrong.swift)} />
                </div>
            </div>
            <div className="field mt-s">
                <label className="label" htmlFor="b-terms">Payment terms text</label>
                <input id="b-terms" className="input" placeholder="Optional - e.g. Late payments may incur a fee." value={bank.termsText} onChange={(e) => onChange({ ...bank, termsText: e.target.value })} />
                <div className="hint">Printed after the due date under "How to pay".</div>
            </div>
            <div className="field mt-s">
                <label className="label" htmlFor="b-footer">Invoice footer</label>
                <input id="b-footer" className="input" placeholder="Optional - e.g. Thank you for your business." value={bank.footer} onChange={(e) => onChange({ ...bank, footer: e.target.value })} />
            </div>
        </>
    );
}

/**
 * A domain's invoicing the first time (billing_settings:manage). Until it is saved, invoices can be drafted but
 * none can be numbered and sent. The prototype had these settings from the start, so it had no such step.
 */
function SetUpInvoicing({ domain }: { domain: Domain }) {
    const permissions = usePermissions();
    const save = useSaveBillingSettings(domain);
    const errors = useFormErrors();
    const [prefix, setPrefix] = useState(domain === "execution" ? "EX" : "ID");
    const [terms, setTerms] = useState(30);
    const [bank, setBank] = useState<Bank>({ bankAccount: "", bankName: "", iban: "", swift: "", termsText: "", footer: "" });
    const name = DOMAIN_LABEL[domain] ?? domain;

    if (!permissions.has(P.BILLING_SETTINGS_MANAGE)) {
        return <p className="muted">Invoicing isn't set up for {name} yet, so invoices can be drafted but not sent. An admin who manages the billing settings sets it up here.</p>;
    }

    const prefixError = !PREFIX.test(prefix) && "Use 1 to 8 capital letters or digits, starting with a letter.";
    function submit() {
        if (save.isPending) return;
        if (prefixError || !bankOk(bank)) return errors.tried();
        save.mutate({
            invoicePrefix: prefix, defaultTermsDays: terms, bankAccount: text(bank.bankAccount), bankName: text(bank.bankName), iban: text(bank.iban),
            swift: text(bank.swift), termsText: text(bank.termsText), footer: text(bank.footer),
        }, { onSuccess: saved("Invoicing set up", `${name} invoices can now be sent`) });
    }

    return (
        <div>
            <div className="banner hold">
                <Icon name="info" />
                <div className="grow"><b>Invoicing isn't set up for {name} yet.</b> Invoices can be drafted, but none can be sent until their numbering and the bank details they print are set.</div>
            </div>
            <div className="grid g-2 mt">
                <div className="field">
                    <label className="label required" htmlFor="b-prefix">Invoice numbering</label>
                    <input id="b-prefix" className="input mono" maxLength={8} value={prefix} onBlur={errors.touch("prefix")}
                        onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
                    <FieldError message={errors.show("prefix", prefixError)} />
                    {!prefixError && <div className="hint">This year's first invoice is {prefix}-{companyToday().slice(0, 4)}-001. The other business needs a prefix of its own.</div>}
                </div>
                <div className="field">
                    <label className="label required" htmlFor="b-days">Default payment terms</label>
                    <Select id="b-days" value={String(terms)} onChange={(v) => setTerms(+v)} options={TERMS} />
                    <div className="hint">Sets each new invoice's due date.</div>
                </div>
            </div>
            <div className="u mt">Bank details printed on every invoice</div>
            <BankFields bank={bank} onChange={setBank} errors={errors} />
            <div className="row mt" style={{ gap: 10 }}>
                <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>{save.isPending ? "Saving…" : "Set up invoicing"}</button>
                {save.error != null && <FieldError message={errorMessage(save.error)} />}
            </div>
        </div>
    );
}

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
        remindersEnabled: b.remindersEnabled, reminderFirstAfterDays: b.reminderFirstAfterDays, reminderEveryDays: b.reminderEveryDays, reminderMax: b.reminderMax,
    };
    const remind = (change: Partial<Schemas["SaveBillingSettingsRequest"]>, title: string) =>
        save.mutate({ ...body, ...change }, { onSuccess: saved(title), onError: notSaved });
    const errors = useFormErrors();
    const prefixError = prefix != null && !PREFIX.test(prefix) && "Use 1 to 8 capital letters or digits, starting with a letter.";
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
                <SwitchRow title="Invoice numbering"
                    description={<>The letters before the year. Invoices already numbered keep theirs.{prefixError && <span className="err"> {prefixError}</span>}</>} control={
                    <div className="row" style={{ gap: 6 }}>
                        <input className="input mono" style={{ width: 90 }} aria-label="Invoice prefix" value={prefix} maxLength={8}
                            onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
                        <button className="btn btn-sm btn-primary" disabled={save.isPending}
                            onClick={() => !prefixError && save.mutate({ ...body, invoicePrefix: prefix }, { onSuccess: () => { saved("Invoice numbering updated", `Next invoice: ${prefix}-${year}-…`)(); setPrefix(null); }, onError: notSaved })}>Save</button>
                        <button className="btn btn-sm" onClick={() => setPrefix(null)}>Cancel</button>
                    </div>
                } />
            )}
            <SwitchRow title="Remind clients of overdue invoices"
                description={b.remindersEnabled
                    ? `Each overdue invoice is emailed again with what is still owed, from 9:00, to the address it was sent to, until it is paid. A client with no email address is left to you to chase.`
                    : "Off: nobody is reminded automatically. Turned on, an overdue invoice is emailed to the client again on a schedule until it is paid."}
                control={<Toggle label="Remind clients of overdue invoices" checked={b.remindersEnabled} disabled={!canEdit || save.isPending}
                    onChange={(on) => remind({ remindersEnabled: on }, on ? "Reminders turned on" : "Reminders turned off")} />} />
            {b.remindersEnabled && (
                <SwitchRow title="Reminder schedule"
                    description={`The first ${b.reminderFirstAfterDays === 1 ? "the day after" : `${b.reminderFirstAfterDays} days after`} the due date, then every ${plural(b.reminderEveryDays, "day")}, ${plural(b.reminderMax, "reminder")} at most.`}
                    control={
                        <div className="row wrap" style={{ gap: 6 }}>
                            <Select className="select sm" style={{ width: 175 }} aria-label="First reminder" disabled={!canEdit || save.isPending} value={String(b.reminderFirstAfterDays)}
                                options={withValue(FIRST, b.reminderFirstAfterDays, `${b.reminderFirstAfterDays} days after`)}
                                onChange={(v) => remind({ reminderFirstAfterDays: +v }, "Reminder schedule updated")} />
                            <Select className="select sm" style={{ width: 165 }} aria-label="Then every" disabled={!canEdit || save.isPending} value={String(b.reminderEveryDays)}
                                options={withValue(APART, b.reminderEveryDays, `Then every ${b.reminderEveryDays} days`)}
                                onChange={(v) => remind({ reminderEveryDays: +v }, "Reminder schedule updated")} />
                            <Select className="select sm" style={{ width: 160 }} aria-label="At most" disabled={!canEdit || save.isPending} value={String(b.reminderMax)}
                                options={withValue(AT_MOST, b.reminderMax, `At most ${plural(b.reminderMax, "reminder")}`)}
                                onChange={(v) => remind({ reminderMax: +v }, "Reminder schedule updated")} />
                        </div>
                    } />
            )}
            <SwitchRow title="Tax on invoices" description="Invoices bill milestones of an agreed project value, so no tax line is applied in this version." control={<span className="badge">Not applied</span>} />
            <LbpRate />
            {bank ? (
                <div className="switch-row" style={{ alignItems: "flex-start" }}>
                    <div className="grow">
                        <div style={{ fontWeight: 600 }}>Bank details printed on every invoice</div>
                        <BankFields bank={bank} onChange={setBank} errors={errors} />
                        {save.error != null && <div className="err mt-s" style={{ fontSize: 12 }}><Icon name="alert" />{errorMessage(save.error)}</div>}
                    </div>
                    <div className="stack" style={{ gap: 6 }}>
                        <button className="btn btn-sm btn-primary" disabled={save.isPending}
                            onClick={() => bankOk(bank) ? save.mutate({
                                ...body, bankAccount: text(bank.bankAccount), bankName: text(bank.bankName), iban: text(bank.iban), swift: text(bank.swift),
                                termsText: text(bank.termsText), footer: text(bank.footer),
                            }, { onSuccess: () => { saved("Bank details updated")(); setBank(null); } }) : errors.tried()}>Save</button>
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
            <SwitchRow title="Who can see billing" description="Invoices, payments and outstanding balances, for whoever is given financial:view." control={<Always>By permission</Always>} />
        </>
    );
}

/** The LBP rate payments are converted at, and every rate set before it (exchange_rate:manage to set one). */
function LbpRate() {
    const permissions = usePermissions();
    const canSet = permissions.has(P.EXCHANGE_RATE_MANAGE);
    const rates = useExchangeRates("LBP", permissions.hasAny(P.FINANCIAL_VIEW, P.EXCHANGE_RATE_MANAGE)).data ?? [];
    const add = useAddExchangeRate();
    const [editing, setEditing] = useState<{ rate: number | ""; from: string } | null>(null);
    const today = companyToday();
    const current = rates.find((r) => r.effectiveFrom <= today) ?? rates[0];
    const earlier = rates.filter((r) => r !== current).slice(0, 4);
    // as the API allows: from the day after the latest rate, up to today
    const latest = rates.map((r) => r.effectiveFrom).sort().at(-1);
    const firstDay = latest ? addDays(latest, 1) : null;
    const dayOk = (day: string) => day <= today && (!firstDay || day >= firstDay);

    return (
        <SwitchRow title="Payments in another currency"
            description={
                <>
                    A payment can be received in LBP and converted at the rate of its day. Both amounts are kept, and payments already recorded keep their rate.
                    {earlier.length > 0 && <span className="muted"> Before: {earlier.map((r) => `${fmtNumber(r.ratePerUsd)} from ${fmtDateY(r.effectiveFrom)}`).join(" · ")}.</span>}
                    {add.error != null && <span className="err"> {errorMessage(add.error)}</span>}
                    {editing && !editing.rate && <span className="err"> Enter how many LBP make a dollar.</span>}
                    {editing && editing.rate !== "" && editing.rate > 0 && !dayOk(editing.from) && (
                        <span className="err"> {firstDay ? `Pick a day from ${fmtDateY(firstDay)} to today.` : "Pick a day up to today."}</span>
                    )}
                </>
            }
            control={editing ? (
                <div className="row wrap" style={{ gap: 6 }}>
                    <NumberField shape={RATE} style={{ width: 110 }} aria-label="LBP per dollar" value={editing.rate}
                        onChange={(text) => setEditing({ ...editing, rate: text === "" ? "" : +text || 0 })} />
                    <div style={{ width: 150 }}><DateInput value={editing.from} min={firstDay ?? undefined} max={today} onChange={(from) => setEditing({ ...editing, from })} aria-label="From" /></div>
                    <button className="btn btn-sm btn-primary" disabled={!editing.rate || !dayOk(editing.from) || add.isPending}
                        onClick={() => add.mutate({ currency: "LBP", ratePerUsd: +editing.rate, effectiveFrom: editing.from },
                            { onSuccess: () => { saved("Exchange rate set", `LBP · ${fmtNumber(+editing.rate)}/$ from ${fmtDateY(editing.from)}`)(); setEditing(null); } })}>Save</button>
                    <button className="btn btn-sm" onClick={() => { setEditing(null); add.reset(); }}>Cancel</button>
                </div>
            ) : (
                <div className="row" style={{ gap: 8 }}>
                    <span className="badge cur-chip">{current ? `LBP · ${fmtNumber(current.ratePerUsd)}/$` : "No rate yet"}</span>
                    {canSet && (firstDay && firstDay > today
                        ? <span className="muted" style={{ fontSize: 12 }}>Set today · the next change can apply from tomorrow</span>
                        : <button className="btn btn-sm" onClick={() => setEditing({ rate: current?.ratePerUsd ?? "", from: today })}>Change</button>)}
                </div>
            )} />
    );
}
