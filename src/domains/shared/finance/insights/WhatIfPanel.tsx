import { useState, type ReactNode } from "react";
import { toApiError } from "@/api/errors";
import { parseAmount } from "@/domains/design/projects/vos/designVosApi";
import { Banner } from "@/shared/components/Data/Bits";
import { CostRow } from "@/shared/components/Data/Money";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import AmountField from "@/shared/components/Forms/AmountField";
import { FieldError } from "@/shared/components/Forms/Field";
import NumberField from "@/shared/components/Forms/NumberField";
import Select, { type SelectOption } from "@/shared/components/Forms/Select";
import { TVA_PERCENT, type NumberShape } from "@/shared/format/limits";
import { money } from "@/shared/format/money";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import { BasisNote, StandingBadge } from "./InsightParts";
import {
    COST_SOURCES, MAX_DELAY_WEEKS, useProjectScenario,
    type CostSource, type OwedSettlement, type ProjectInsight, type ProjectScenario, type ScenarioFigures, type ScenarioLevers,
} from "./insightsApi";

const WEEKS: NumberShape = { digits: 3, decimals: 0, max: MAX_DELAY_WEEKS };

const SETTLE_OPTIONS: SelectOption<OwedSettlement | "">[] = [
    { value: "", label: "Still owed" },
    { value: "excused", label: "Excused" },
    { value: "written_off", label: "Written off" },
];

/** A rate typed as a percentage (11 for 11%), as the fraction the API takes (0.11), as the pricing window sends it. */
const fraction = (pct: number) => Math.round(pct * 100) / 10000;

/**
 * "What if…": changes to try on the project (a variation order, an extra cost, another supervision or TVA rate, settling
 * what the client owes, finishing later), and today's figures beside the ones the API works out with them. Nothing is
 * saved. Clearing starts the form afresh.
 */
export default function WhatIfPanel({ insight }: { insight: ProjectInsight }) {
    const [round, setRound] = useState(0);
    return <WhatIf key={round} insight={insight} onClear={() => setRound((r) => r + 1)} />;
}

function WhatIf({ insight, onClear }: { insight: ProjectInsight; onClear: () => void }) {
    const site = insight.domain === "execution";
    // internal work has no price: only an extra cost or a delay can be tried on it
    const client = insight.billingType === "client";
    const sources = COST_SOURCES[site ? "execution" : "design"];
    const canSettle = client && insight.owed > 0;
    const [vo, setVo] = useState("");
    const [extra, setExtra] = useState<number | null>(null);
    const [source, setSource] = useState<CostSource>(sources[0].value);
    const [supervisionPct, setSupervisionPct] = useState<number | "">("");
    const [tvaPct, setTvaPct] = useState<number | "">("");
    const [settle, setSettle] = useState<OwedSettlement | "">("");
    const [weeks, setWeeks] = useState<number | "">("");
    const [asked, setAsked] = useState<ScenarioLevers | null>(null);
    const scenario = useProjectScenario(insight.projectId, asked);
    const errors = useFormErrors();
    const failure = scenario.error ? toApiError(scenario.error) : null;
    // what the API refused, beside what it was about
    const refused: Record<string, string> = failure?.fieldErrors ?? {};

    const voAmount = vo.trim() === "" ? null : parseAmount(vo);
    const levers: ScenarioLevers = {
        ...(voAmount ? { voAmount } : {}),
        ...(extra ? { extraCost: extra, extraCostSource: source } : {}),
        ...(supervisionPct !== "" ? { supervisionRate: fraction(supervisionPct) } : {}),
        ...(tvaPct !== "" ? { tvaRate: fraction(tvaPct) } : {}),
        ...(settle ? { settleOwed: settle } : {}),
        ...(weeks !== "" && weeks > 0 ? { delayWeeks: weeks } : {}),
    };
    const voError = vo.trim() !== "" && !voAmount && "Give the variation order to the cent: above zero for more work, below for less.";
    const weeksError = weeks === 0 && "At least 1 week.";
    const noneError = !voError && !weeksError && Object.keys(levers).length === 0 && "Choose at least one change to try.";

    function tryIt() {
        if (voError || weeksError || noneError) return errors.tried();
        // the same changes again, after a failure, ask again
        if (JSON.stringify(levers) === JSON.stringify(asked)) void scenario.refetch();
        else setAsked(levers);
    }

    // a settlement sets the price to what the client paid, so a variation order beside it would change nothing
    function chooseSettle(next: OwedSettlement | "") {
        setSettle(next);
        if (next) setVo("");
    }

    return (
        <div className="panel mt" role="region" aria-label="What if">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">What if…</div>
                    <div className="panel-sub">
                        {client ? "Try a change and see what it would do to this project's figures." : "Try an extra cost or a delay and see what it would do."} Nothing is saved.
                    </div>
                </div>
            </div>
            <div className="panel-body">
                <div className="grid g-3">
                    {client && (
                        <div className="field">
                            <label className="label" htmlFor="wi-vo">Variation order</label>
                            <input id="wi-vo" className="input mono" inputMode="decimal" placeholder="0.00" value={vo} disabled={settle !== ""}
                                onChange={(e) => setVo(e.target.value)} onBlur={errors.touch("vo")} />
                            {settle ? <div className="hint">A settlement sets the price to what the client paid: try a variation order on its own.</div>
                                : <div className="hint">Before TVA, on the {site ? "work price" : "price"}. A minus amount takes work out, e.g. -1,500.</div>}
                            <FieldError message={errors.show("vo", voError) ?? refused.voAmount} />
                        </div>
                    )}
                    <div className="field">
                        <label className="label" htmlFor="wi-extra">Extra cost</label>
                        <AmountField id="wi-extra" value={extra} currencies={false} onChange={(v) => setExtra(v || null)} />
                        <FieldError message={refused.extraCost} />
                    </div>
                    <div className="field">
                        <label className="label" htmlFor="wi-source">Where the cost goes</label>
                        <Select id="wi-source" value={source} options={sources} onChange={setSource} />
                        <FieldError message={refused.extraCostSource} />
                    </div>
                    {site && client && (
                        <RateField id="wi-supervision" label="Supervision" value={supervisionPct} onChange={setSupervisionPct} error={refused.supervisionRate}
                            hint={`Now ${money.pct(insight.supervisionRate ?? 0)} of the work price.`} />
                    )}
                    {client && (
                        <RateField id="wi-tva" label="TVA" value={tvaPct} onChange={setTvaPct} error={refused.tvaRate}
                            hint={`Now ${money.pct(insight.tvaRate)}. TVA isn't revenue: it changes what the client pays and owes, not the profit.`} />
                    )}
                    {canSettle && (
                        <div className="field">
                            <label className="label" htmlFor="wi-settle">What the client still owes</label>
                            <Select id="wi-settle" value={settle} options={SETTLE_OPTIONS} onChange={chooseSettle} />
                            <div className="hint">{money.exact(insight.owed)} today. Excusing or writing it off lowers the price to what the client paid.</div>
                            <FieldError message={refused.settleOwed} />
                        </div>
                    )}
                    <div className="field">
                        <label className="label" htmlFor="wi-weeks">Finish later by</label>
                        <div className="row" style={{ gap: 6, alignItems: "center" }}>
                            <NumberField id="wi-weeks" shape={WEEKS} style={{ width: 80 }} value={weeks} onChange={(text) => setWeeks(text === "" ? "" : +text)} />
                            <span className="muted">weeks</span>
                        </div>
                        <div className="hint">At the project's weekly cost over its last 4 full weeks.</div>
                        <FieldError message={errors.show("weeks", weeksError) ?? refused.delayWeeks} />
                    </div>
                </div>
                <FieldError message={errors.show("none", noneError)} />
                <div className="row mt" style={{ gap: 8 }}>
                    <button className="btn btn-primary" disabled={scenario.isFetching} onClick={tryIt}>{scenario.isFetching ? "Working it out…" : "Try it"}</button>
                    <button className="btn" onClick={onClear}>Clear</button>
                </div>

                {asked && (failure ? (
                    <div className="mt"><LoadError error={scenario.error} retry={failure.status === 0 || failure.status >= 500 ? () => void scenario.refetch() : undefined} /></div>
                ) : !scenario.data ? <div className="mt"><SkeletonLines lines={5} /></div> : <ScenarioResult scenario={scenario.data} client={client} settled={asked.settleOwed != null} />)}
            </div>
        </div>
    );
}

/** A rate typed as a percentage, 0 to 100, left empty to keep the project's own. */
function RateField({ id, label, value, onChange, hint, error }: { id: string; label: string; value: number | ""; onChange: (pct: number | "") => void; hint: string; error?: string }) {
    return (
        <div className="field">
            <label className="label" htmlFor={id}>{label}</label>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
                <NumberField id={id} shape={TVA_PERCENT} style={{ width: 80 }} value={value} onChange={(text) => onChange(text === "" ? "" : +text)} />
                <span className="muted">%</span>
            </div>
            <div className="hint">{hint}</div>
            <FieldError message={error} />
        </div>
    );
}

/** Today's figures beside the ones with the changes, the profit change, and the profit floor's answer had they been real. */
function ScenarioResult({ scenario: s, client, settled }: { scenario: ProjectScenario; client: boolean; settled: boolean }) {
    const row = (label: string, show: (f: ScenarioFigures) => ReactNode) => (
        <tr aria-label={label}>
            <td>{label}</td>
            <td className="r mono">{show(s.before)}</td>
            <td className="r mono">{show(s.after)}</td>
        </tr>
    );
    const change = s.profitChange;
    return (
        <div className="mt" role="region" aria-label="What the changes would do">
            {s.floorWouldRefuse && (
                <Banner tone="attn" icon="alert">
                    <b>The profit floor would refuse this.</b> As real changes, they would take the profit to zero or below, so they'd be held
                    as a blocked change until someone who sees the money forces them through.{settled && " A settlement isn't held to the floor, so this is about the other changes."}
                </Banner>
            )}
            <div className="tbl-wrap mt">
                <table className="tbl" aria-label="Today and with the changes">
                    <thead>
                        <tr>
                            <th />
                            <th className="r">Today</th>
                            <th className="r">With the changes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {client && row("Agreed revenue", (f) => money.exact(f.agreedRevenue))}
                        {client && row("With TVA", (f) => money.exact(f.agreedWithTva))}
                        {row("Cost", (f) => money.exact(f.cost))}
                        {row(client ? "Agreed profit" : "Net result", (f) => <span className={f.agreedProfit < 0 ? "down" : undefined}>{money.exact(f.agreedProfit)}</span>)}
                        {client && row("Margin", (f) => (f.margin != null ? money.pct(f.margin) : "-"))}
                        {client && row("Client still owes", (f) => money.exact(f.owed))}
                        {client && row("Profit floor", (f) => <StandingBadge standing={f.standing} />)}
                    </tbody>
                </table>
            </div>
            <CostRow strong label="Profit change" value={`${change > 0 ? "+" : ""}${money.exact(change)}`} tone={change < 0 ? "down" : change > 0 ? "up" : ""}
                meta={s.weeklyCost != null ? `a delay at ${money.exact(s.weeklyCost)} a week` : undefined} />
            <div className="mt-s">
                <BasisNote basis={s.basis} label="How the changes were worked out" />
            </div>
        </div>
    );
}
