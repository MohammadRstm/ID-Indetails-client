import { loadFailed } from "@/api/queryState";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { money } from "@/shared/format/money";
import HelpHint from "../../shared/help/HelpHint";
import type { Project } from "../../shared/projects/projectsApi";
import { pctOf } from "../projects/siteMoney";
import { useAccountFigures } from "./accountApi";
import SupervisionPanel from "./SupervisionPanel";

const usd = (amount: number) => money.exact(amount, "USD", { cents: true });

/** An Execution client site's Supervision tab (financial:view): the company's fee, what it has taken of it, and each time it took some. */
export default function SupervisionTab({ project }: { project: Project }) {
    return (
        <>
            <SupervisionSummary project={project} />
            <SupervisionPanel project={project} />
        </>
    );
}

/** Due is the supervision in the price; taken is what the company withdrew from the account; left is the rest it may still take. */
function SupervisionSummary({ project }: { project: Project }) {
    const query = useAccountFigures(project.id, true);
    const f = query.data;
    const over = f != null && f.supervision.leftUsd < 0;
    return (
        <section className="panel xm-panel" aria-label="The company's supervision">
            <div className="panel-head">
                <div className="grow">
                    <div className="panel-title">The company's supervision<HelpHint article="supervision-taken" label="the company's supervision">Due is the supervision in the client's price. Taken is what the company has withdrawn of it from the project's account. Left is what it may still take.</HelpHint></div>
                    <div className="panel-sub">The company's fee on the work price, and how much of it has left the project's account.</div>
                </div>
            </div>
            <div className="panel-body">
                {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the supervision" />
                    : !f ? <SkeletonLines lines={2} /> : (
                        <div className="xm-owed">
                            <div><span>Due</span><b className="mono">{usd(f.supervision.dueUsd)}</b><em>{pctOf(f.supervisionRate)} of the work price</em></div>
                            <div><span>Taken</span><b className="mono">{usd(f.supervision.takenUsd)}</b><em>out of the account, not a cost</em></div>
                            <div><span>{over ? "Over by" : "Left"}</span><b className={over ? "mono down" : "mono"}>{usd(over ? -f.supervision.leftUsd : f.supervision.leftUsd)}</b><em>{over ? "taken beyond what is due" : "still to take"}</em></div>
                        </div>
                    )}
            </div>
        </section>
    );
}
