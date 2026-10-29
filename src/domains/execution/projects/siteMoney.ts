import type { Project } from "../../shared/projects/projectsApi";

type ProjectMoney = NonNullable<Project["money"]>;

/**
 * An Execution site's money as the prototype reads it (XM.money). The client pays the agreed amount: the work price
 * from the agreed BOQs and VOs, plus supervision. Site expenses and ground labour are never billed: they come out of
 * the profit.
 */
export type SiteMoney = {
    received: number;
    /** Site expenses, ground labour and any employee labour: all paid when they happen. */
    spent: number;
    /** What was spent on site: materials, contractors, equipment, fees. */
    siteExpenses: number;
    labour: number;
    /** Old project expenses and employee labour together. */
    other: number;
    /** Moved into the pocket money: lowers the profit, not what the client owes. */
    toPocket: number;
    /** Paid by the pocket money. */
    fromPocket: number;
    /** Received − spent − to the pocket + from it: the headline. */
    cashProfit: number;
    /** The work price + supervision. */
    agreed: number;
    owed: number;
    /** Paid beyond the agreed amount so far. */
    credit: number;
    /** Agreed − spent: once the client has paid it all. */
    expectedProfit: number;
    /** The work price: the agreed BOQ and VOs' total. */
    fee: number;
    /** The supervision fee on top of it. */
    supervision: number;
    payments: number;
    locked: boolean;
};

export function siteMoneyOf(m: ProjectMoney): SiteMoney {
    return {
        received: m.billing.received,
        spent: m.cost.total,
        siteExpenses: m.cost.siteExpenses,
        labour: m.cost.groundLabour,
        other: m.cost.expenses + m.cost.labour,
        toPocket: m.toPocket ?? 0,
        fromPocket: m.fromPocket ?? 0,
        cashProfit: m.cashProfit ?? m.billing.received - m.cost.total - (m.toPocket ?? 0) + (m.fromPocket ?? 0),
        agreed: m.revenue,
        owed: m.billing.owed,
        credit: m.billing.paidAhead,
        expectedProfit: m.profit,
        fee: m.projectFee ?? 0,
        supervision: m.supervisionUsd ?? 0,
        payments: m.billing.paymentCount,
        locked: m.isLocked,
    };
}

/** The colours the site's charts and cost rows share. */
export const SITE_COLORS = { received: "var(--heat-3)", siteExpenses: "var(--heat-2)", labour: "var(--warn-mark)", other: "var(--heat-1)", fee: "var(--accent)", supervision: "var(--heat-4)" };

/** 0.163 → "16.3%". */
export const pctOf = (ratio: number) => `${Math.round(ratio * 1000) / 10}%`;

/** Open for site records (expenses and labour): not closed, and not finalised, as the API's SiteRules has it. */
export const isSiteOpen = (project: Project) =>
    project.status !== "completed" && project.status !== "archived" && !project.finalizedAt && !project.money?.isLocked;
