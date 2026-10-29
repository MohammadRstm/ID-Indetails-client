import { loadFailed } from "@/api/queryState";
import { RankBars } from "@/shared/components/Charts/Bars";
import { CostRow } from "@/shared/components/Data/Money";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { money } from "@/shared/format/money";
import Icon from "@/shared/icons/Icon";
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
 * An Execution client site's account, on its Financials tab: what the client pays and has paid, what the site has cost,
 * the supervision, the cash in the account and the rest by label. Every figure is the API's (GET account-figures);
 * the client only words them, so a negative rest to pay reads "Paid ahead" and a negative supervision left "Over by".
 */
export default function AccountSection({ project }: { project: Project }) {
    const query = useAccountFigures(project.id, true);
    const figures = query.data;
    return (
        <section className="panel mt xm-panel" aria-label="Account">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">Account<HelpHint article="account-figures" label="the account">Cash in the account is what the client paid less what the site cost and the supervision taken. The rows by label add up to it.</HelpHint></div>
                    <div className="panel-sub">What the client pays and has paid, what the site has cost, and what is left in the project's account.</div>
                </div>
            </div>
            <div className="panel-body">
                {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the account" />
                    : !figures ? <SkeletonLines lines={8} /> : <Figures f={figures} />}
            </div>
        </section>
    );
}

function Figures({ f }: { f: AccountFigures }) {
    const paidAhead = f.restToPayUsd < 0;
    const over = f.supervision.leftUsd < 0;
    const pocket = f.pocket.movedToPocketUsd > 0 || f.pocket.paidByPocketUsd > 0;
    return (
        <>
            <div className="grid g-2 xm-grid">
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

            <div className="u mt" style={{ marginBottom: 6 }}>The company's supervision</div>
            <div className="xm-owed">
                <div><span>Due</span><b className="mono">{usd(f.supervision.dueUsd)}</b><em>{pctOf(f.supervisionRate)} of the work price</em></div>
                <div><span>Taken</span><b className="mono">{usd(f.supervision.takenUsd)}</b><em>out of the account, not a cost</em></div>
                <div><span>{over ? "Over by" : "Left"}</span><b className={over ? "mono down" : "mono"}>{usd(over ? -f.supervision.leftUsd : f.supervision.leftUsd)}</b><em>{over ? "taken beyond what is due" : "still to take"}</em></div>
            </div>

            <div className="u mt" style={{ marginBottom: 6 }}>Cash in the account</div>
            <div className="xm-owed">
                <div className={f.cashInAccountUsd < 0 ? undefined : "ok"}>
                    <span>Cash in account</span><b className={f.cashInAccountUsd < 0 ? "mono down" : "mono"}>{usd(f.cashInAccountUsd)}</b>
                    <em>received less costs and supervision taken{pocket ? ", pocket money counted" : ""}; the TVA paid is in it</em>
                </div>
                {f.pocket.movedToPocketUsd > 0 && <div><span>Moved to the pocket money</span><b className="mono">{usd(f.pocket.movedToPocketUsd)}</b><em>set aside from this site</em></div>}
                {f.pocket.paidByPocketUsd > 0 && <div><span>Paid by the pocket money</span><b className="mono">{usd(f.pocket.paidByPocketUsd)}</b><em>paid to this site</em></div>}
            </div>

            <ByLabel f={f} />

            <div className="grid g-2 mt">
                <div>
                    <div className="u" style={{ marginBottom: 6 }}>Spending by category</div>
                    <RankBars unit="Spent" format={usd} empty="No site expenses with an exchange rate yet."
                        items={f.byCategory.map((c) => ({ id: c.category, label: CATEGORIES.find((k) => k.value === c.category)?.label ?? c.category, value: c.spentUsd }))} />
                </div>
                <div>
                    <div className="u" style={{ marginBottom: 6 }}>Spending by payee</div>
                    <RankBars unit="Spent" format={usd} empty="No site expenses with an exchange rate yet."
                        items={f.byPayee.map((p, i) => ({ id: p.payee ?? `none-${i}`, label: p.payee ?? "No payee", value: p.spentUsd }))} />
                </div>
            </div>

            {f.unconverted.length > 0 && (
                <div className="banner hold mt">
                    <Icon name="info" />
                    <div className="grow">
                        <b>Left out of every figure above.</b> These costs have no exchange rate for their day:{" "}
                        {f.unconverted.map((u) => `${money.exact(u.amount, u.currency)} (${SOURCES[u.source]})`).join(", ")}. Add the rate to count them.
                    </div>
                </div>
            )}
        </>
    );
}

/** The rest in the account under each label, the unlabelled row last; the rows add up to the cash in the account. */
function ByLabel({ f }: { f: AccountFigures }) {
    return (
        <>
            <div className="u mt" style={{ marginBottom: 6 }}>Rest in account by label</div>
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
