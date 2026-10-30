import { useState, type ReactNode } from "react";
import { loadFailed } from "@/api/queryState";
import { RankBars } from "@/shared/components/Charts/Bars";
import Pager from "@/shared/components/Data-Tables/Pager";
import { CostRow } from "@/shared/components/Data/Money";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Select from "@/shared/components/Forms/Select";
import { money } from "@/shared/format/money";
import Icon from "@/shared/icons/Icon";
import { useAccountLabels } from "../../shared/accountLabels/accountLabelsApi";
import HelpHint from "../../shared/help/HelpHint";
import type { Project } from "../../shared/projects/projectsApi";
import { CATEGORIES } from "../expenses/expenseRules";
import { pctOf } from "../projects/siteMoney";
import { useAccountFigures, type AccountFigures } from "./accountApi";

const usd = (amount: number) => money.exact(amount, "USD", { cents: true });

/** Where an unconverted cost came from, in the words used on the site. */
const SOURCES: Record<AccountFigures["unconverted"][number]["source"], string> = {
    site_expense: "site expense", ground_labour: "ground labour", labour: "staff labour", expenses: "other cost",
};

/**
 * An Execution client site's account, on its Financials tab, in four cards: the cash in the account and how the profit
 * becomes it, what the client pays against what the site has cost, the rest by label, and the spending. Every figure is
 * the API's (GET account-figures); the client only words them, so a negative rest to pay reads "Paid ahead". The
 * supervision has its own tab.
 */
export default function AccountSection({ project, onSupervision }: { project: Project; onSupervision?: () => void }) {
    const query = useAccountFigures(project.id, true);
    const f = query.data;
    if (loadFailed(query) || !f) {
        return (
            <Card title="Account">
                {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the account" /> : <SkeletonLines lines={8} />}
            </Card>
        );
    }
    const paidAhead = f.restToPayUsd < 0;
    return (
        <>
            {f.unconverted.length > 0 && (
                <div className="banner hold mt">
                    <Icon name="info" />
                    <div className="grow">
                        <b>Left out of every figure below.</b> These costs have no exchange rate for their day:{" "}
                        {f.unconverted.map((u) => `${money.exact(u.amount, u.currency)} (${SOURCES[u.source]})`).join(", ")}. Add the rate to count them.
                    </div>
                </div>
            )}

            <Card title="Cash in account" sub="What is in the project's account now, and how the profit becomes it."
                help="Cash in the account is the profit, plus what the client paid ahead (or less what they still owe), plus the TVA, less the supervision taken.">
                <ProfitToCash f={f} paidAhead={paidAhead} onSupervision={onSupervision} />
            </Card>

            <Card title="Price and costs" sub="What the client pays and has paid, against what the site has cost.">
                <div className="grid g-2 xm-grid xm-split">
                    <div>
                        <div className="u" style={{ marginBottom: 6 }}>What the client pays</div>
                        <CostRow label="Work price" value={usd(f.workUsd)} meta="the agreed BOQ and VOs" />
                        <CostRow label="Supervision" value={`+${usd(f.supervisionUsd)}`} meta={`${pctOf(f.supervisionRate)} of the work price`} />
                        <CostRow label="TVA" value={`+${usd(f.tvaUsd)}`} meta={`${pctOf(f.tvaRate)} of the work price, never on supervision`} />
                        <CostRow strong label="Client total" value={usd(f.clientTotalUsd)} />
                        <CostRow label="Received" value={usd(f.receivedUsd)} meta="every payment, TVA included" />
                        <CostRow strong label={paidAhead ? "Paid ahead" : "Rest to pay"} value={usd(paidAhead ? -f.restToPayUsd : f.restToPayUsd)}
                            meta={paidAhead ? "paid beyond the client total" : undefined} />
                    </div>
                    <div>
                        <div className="u" style={{ marginBottom: 6 }}>What the site has cost</div>
                        <CostRow label="Site expenses" value={usd(f.costs.siteExpensesUsd)} />
                        <CostRow label="Ground labour" value={usd(f.costs.groundLabourUsd)} />
                        <CostRow label="Staff" value={usd(f.costs.staffUsd)} meta="employees' labour" />
                        <CostRow label="Other costs" value={usd(f.costs.otherUsd)} />
                        <CostRow strong label="Total costs" value={usd(f.costs.totalUsd)} />
                        <CostRow strong label="Profit" value={usd(f.profitUsd)} tone={f.profitUsd < 0 ? "down" : ""} meta="work price and supervision, less the costs" />
                    </div>
                </div>
            </Card>

            <Card title="Rest in account by label" sub="What is left under each account label; the rows add up to the cash in the account.">
                <ByLabel f={f} />
            </Card>

            <Card title="Spending" sub="The site expenses, by category and by payee.">
                <h3 className="sec-head">Spending by category</h3>
                <RankBars unit="Spent" format={usd} empty="No site expenses with an exchange rate yet."
                    items={f.byCategory.map((c) => ({ id: c.category, label: CATEGORIES.find((k) => k.value === c.category)?.label ?? c.category, value: c.spentUsd }))} />
                <PayeeSpending f={f} />
            </Card>
        </>
    );
}

function Card({ title, sub, help, children }: { title: string; sub?: string; help?: string; children: ReactNode }) {
    return (
        <section className="panel mt xm-panel" aria-label={title}>
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">{title}{help && <HelpHint article="account-figures" label={title.toLowerCase()}>{help}</HelpHint>}</div>
                    {sub && <div className="panel-sub">{sub}</div>}
                </div>
            </div>
            <div className="panel-body">{children}</div>
        </section>
    );
}

type Split = AccountFigures["byPayee"][number]["splits"][number];

/** Rows a page of the payees shows. */
const PAYEES_PAGE = 15;

/**
 * Spending by payee, which grows with the site: a search and filters by category and account label, worked out from
 * each payee's split (what was spent with them under each category and label), fifteen a page.
 */
function PayeeSpending({ f }: { f: AccountFigures }) {
    const labels = useAccountLabels(true).data;
    const [q, setQ] = useState("");
    const [category, setCategory] = useState("");
    const [label, setLabel] = useState("");
    const [page, setPage] = useState(1);
    const words = q.trim().toLowerCase();
    const matches = (s: Split) =>
        (!category || s.category === category) && (!label || (label === "none" ? s.accountLabelId == null : String(s.accountLabelId) === label));
    // an older API sends no split: the payee's total counts while no filter is set, and nothing once one is
    const spentWith = (p: AccountFigures["byPayee"][number]) =>
        (p.splits as Split[] | undefined)?.filter(matches).reduce((sum, s) => sum + s.spentUsd, 0) ?? (category || label ? 0 : p.spentUsd);
    const rows = f.byPayee
        .map((p, i) => ({ id: p.payee ?? `none-${i}`, label: p.payee ?? "No payee", value: spentWith(p) }))
        .filter((r) => r.value > 0 && (!words || r.label.toLowerCase().includes(words)))
        .sort((a, b) => b.value - a.value);
    const pages = Math.max(1, Math.ceil(rows.length / PAYEES_PAGE));
    const current = Math.min(page, pages);
    const filter = (set: (v: string) => void) => (v: string) => { set(v); setPage(1); };

    return (
        <>
            <h3 className="sec-head mt-l">Spending by payee</h3>
            {f.byPayee.length > 0 && (
                <div className="mat-filters" style={{ marginBottom: 8 }}>
                    <div className="mat-search">
                        <Icon name="search" />
                        <input className="input sm" type="search" placeholder="Search payees…" aria-label="Search payees" value={q}
                            onChange={(e) => { setQ(e.target.value); setPage(1); }} />
                    </div>
                    <Select className="select sm" aria-label="Filter payees by category" value={category} onChange={filter(setCategory)}
                        options={[{ value: "", label: "All categories" }, ...CATEGORIES]} />
                    <Select className="select sm" aria-label="Filter payees by account label" value={label} onChange={filter(setLabel)}
                        options={[{ value: "", label: "All labels" }, ...(labels ?? []).map((l) => ({ value: String(l.id), label: l.archived ? `${l.name} (archived)` : l.name })), { value: "none", label: "No label" }]} />
                </div>
            )}
            <RankBars unit="Spent" format={usd}
                empty={f.byPayee.length === 0 ? "No site expenses with an exchange rate yet." : "No payee matches these filters."}
                items={rows.slice((current - 1) * PAYEES_PAGE, current * PAYEES_PAGE)} />
            <Pager page={current} pageSize={PAYEES_PAGE} total={rows.length} onPage={setPage} />
        </>
    );
}

/**
 * Why the cash in the account isn't the profit: the profit counts the whole price, the account only what was paid, the
 * TVA paid sits in it without being profit, and the supervision taken has left it. Pocket money is in both, so it cancels.
 * cash = profit − rest to pay + TVA − supervision taken.
 */
function ProfitToCash({ f, paidAhead, onSupervision }: { f: AccountFigures; paidAhead: boolean; onSupervision?: () => void }) {
    const signed = (amount: number) => (amount < 0 ? `−${usd(-amount)}` : `+${usd(amount)}`);
    const { movedToPocketUsd: moved, paidByPocketUsd: paid } = f.pocket;
    const pocket = moved > 0 || paid > 0 ? `pocket money counted: ${usd(moved)} moved to it, ${usd(paid)} paid by it` : undefined;
    return (
        <>
            <div className="xm-owed">
                <div className={f.cashInAccountUsd < 0 ? undefined : "ok"}>
                    <span>Cash in account</span><b className={f.cashInAccountUsd < 0 ? "mono down" : "mono"}>{usd(f.cashInAccountUsd)}</b>
                    <em>what is in the project's account now</em>
                </div>
            </div>
            <div className="u mt" style={{ marginBottom: 6 }}>From profit to cash in the account</div>
            <CostRow label="Profit" value={usd(f.profitUsd)} tone={f.profitUsd < 0 ? "down" : ""} meta={pocket} />
            {f.restToPayUsd !== 0 && (
                <CostRow label={paidAhead ? "Paid ahead by the client" : "Still to be paid by the client"} value={signed(-f.restToPayUsd)}
                    meta={paidAhead ? "in the account, but not earned yet" : "earned, but not in the account yet"} />
            )}
            {f.tvaUsd !== 0 && <CostRow label="TVA in the client total" value={signed(f.tvaUsd)} meta="paid with the price for the state, never profit" />}
            <CostRow label="Supervision taken out" value={signed(-f.supervision.takenUsd)} onClick={onSupervision}
                meta={onSupervision ? "the company's fee, withdrawn from the account: open the Supervision tab" : "the company's fee, withdrawn from the account"} />
            <CostRow strong label="Cash in account" value={usd(f.cashInAccountUsd)} tone={f.cashInAccountUsd < 0 ? "down" : ""} />
        </>
    );
}

/** The rest in the account under each label, the unlabelled row last; the rows add up to the cash in the account. */
function ByLabel({ f }: { f: AccountFigures }) {
    return (
        <>
            <div className="tbl-wrap">
                <table className="tbl tbl-min-sm">
                    <thead>
                        <tr><th>Label</th><th className="r">Received</th><th className="r">Spent</th><th className="r">Other</th><th className="r">Rest</th></tr>
                    </thead>
                    <tbody>
                        {f.byLabel.map((row) => (
                            <tr key={row.accountLabel?.id ?? "unlabelled"}>
                                <td>{row.accountLabel?.name ?? <span className="muted">Unlabelled</span>}</td>
                                <td className="r mono">{usd(row.receivedUsd)}</td>
                                <td className="r mono">{usd(row.spentUsd)}</td>
                                <td className="r mono">{row.otherUsd ? usd(row.otherUsd) : <span className="muted">-</span>}</td>
                                <td className={row.restUsd < 0 ? "r mono down" : "r mono"}>{usd(row.restUsd)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td><b>Cash in account</b></td>
                            <td className="r mono"><b>{usd(f.receivedUsd)}</b></td>
                            <td className="r mono"><b>{usd(f.costs.totalUsd)}</b></td>
                            <td />
                            <td className={f.cashInAccountUsd < 0 ? "r mono down" : "r mono"}><b>{usd(f.cashInAccountUsd)}</b></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <p className="hint mt-s">
                Spent is the site expenses filed under the label. Unlabelled also carries what no label holds: ground labour, staff and other costs
                under Spent, and the supervision taken and the pocket money moves under Other.
            </p>
        </>
    );
}
