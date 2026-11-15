import type { Schemas } from "@/api/types";
import { money } from "@/shared/format/money";
import { fmtDateY, fmtMonthY } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { CURRENCY_WARNING } from "../pay/payRules";

type Preview = Schemas["PayPreviewResponse"];

const amount = (value: number | null | undefined, currency: string | null | undefined) =>
    value == null || !currency ? "-" : money.exact(value, currency);

/**
 * The pay form's second step: what the change does before it is saved, as the API works it out by making it and
 * rolling it back. Each month's salary and advance repayment, and the labour and profit of the projects it re-prices
 * (for those who see project money).
 */
export default function PayPreview({ preview, currencyChanged }: { preview: Preview; currencyChanged: boolean }) {
    const advances = preview.months.some((m) => m.advanceCurrency != null && (m.advanceBefore !== 0 || m.advanceAfter !== 0));
    return (
        <div>
            <div className="u" style={{ marginBottom: 6 }}>What this change does, from {fmtDateY(preview.effectiveFrom)}</div>
            {preview.replaces.length > 0 && (
                <div className="banner attn">
                    <Icon name="alert" />
                    <div>
                        It replaces the pay set from then: {preview.replaces.map((p) => `${money.exact(p.amount, p.currency)} a month from ${fmtDateY(p.effectiveFrom)}`).join(", ")}.
                        {" "}It stays in their pay history, marked as replaced.
                    </div>
                </div>
            )}
            {currencyChanged && <div className="banner hold mt-s"><Icon name="alert" /><div>{CURRENCY_WARNING}</div></div>}

            <div className="tbl-wrap mt-s">
                <table className="tbl tbl-min" aria-label="Salary by month">
                    <thead>
                        <tr>
                            <th>Month</th>
                            <th className="r">Salary now</th>
                            <th className="r">After</th>
                            {advances && <th className="r">Advance now</th>}
                            {advances && <th className="r">After</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {preview.months.map((m) => (
                            <tr key={m.month}>
                                <td>{fmtMonthY(m.month)}</td>
                                <td className="r mono">{amount(m.salaryBefore, m.currencyBefore)}</td>
                                <td className={cx("r mono", m.salaryAfter !== m.salaryBefore && "strong")}>{amount(m.salaryAfter, m.currencyAfter)}</td>
                                {advances && <td className="r mono">{amount(m.advanceBefore, m.advanceCurrency)}</td>}
                                {advances && <td className="r mono">{amount(m.advanceAfter, m.advanceCurrency)}</td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {preview.projects.length > 0 && (
                <div className="tbl-wrap mt-s">
                    <table className="tbl tbl-min" aria-label="Projects it re-prices">
                        <thead>
                            <tr>
                                <th>Project</th>
                                <th className="r">Labour now</th>
                                <th className="r">After</th>
                                <th className="r">Profit now</th>
                                <th className="r">After</th>
                            </tr>
                        </thead>
                        <tbody>
                            {preview.projects.map((p) => (
                                <tr key={p.projectId}>
                                    <td>
                                        <div className="trunc" style={{ fontWeight: 600 }}>{p.title}</div>
                                        {p.reachesZero && <span className="badge badge-hold">reaches zero profit</span>}
                                    </td>
                                    <td className="r mono">{money.exact(p.labourBefore)}</td>
                                    <td className="r mono">{money.exact(p.labourAfter)}</td>
                                    <td className="r mono">{money.exact(p.profitBefore)}</td>
                                    <td className={cx("r mono", p.profitAfter <= 0 && "down")}>{money.exact(p.profitAfter)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="hint mt-s">Each day is paid at the salary in force that day. Nothing is saved until you press Save.</div>
        </div>
    );
}
