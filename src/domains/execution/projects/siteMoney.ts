import type { Project } from "../../shared/projects/projectsApi";

type ProjectMoney = NonNullable<Project["money"]>;

/**
 * An Execution site's money as the prototype reads it (XM.money). The client pays the agreed amount: the project fee
 * plus the materials sent to them on a statement, at client prices. Ground labour is never billed: it comes out of
 * the profit.
 */
export type SiteMoney = {
    received: number;
    /** Materials, ground labour, expenses and any employee labour: all paid when they happen. */
    spent: number;
    materialCost: number;
    labour: number;
    /** Project expenses and employee labour together. */
    other: number;
    /** Moved into the pocket money: lowers the profit, not what the client owes. */
    toPocket: number;
    /** Paid by the pocket money. */
    fromPocket: number;
    /** Received − spent − to the pocket + from it: the headline. */
    cashProfit: number;
    /** The project fee + the materials sent to the client, at client prices. */
    agreed: number;
    owed: number;
    /** Paid beyond the agreed amount so far. */
    credit: number;
    /** Agreed − spent: once the client has paid it all. */
    expectedProfit: number;
    /** The work price: the agreed BOQs' total. */
    fee: number;
    /** The supervision fee on top of it. */
    supervision: number;
    markup: number;
    /** The materials sent to the client, at client prices. */
    materialCharge: number;
    /** What the materials sent earn: their charge − their cost. */
    materialProfit: number;
    /** What the materials sent cost. */
    sentCost: number;
    /** The materials not sent yet, at client prices: a statement adds them to what is owed. */
    unsentCharge: number;
    unsent: number;
    payments: number;
    locked: boolean;
};

export function siteMoneyOf(m: ProjectMoney): SiteMoney {
    return {
        received: m.billing.received,
        spent: m.cost.total,
        materialCost: m.cost.materials,
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
        markup: m.materialMarkup ?? 0,
        materialCharge: m.materialCharge ?? 0,
        materialProfit: m.materialProfit ?? 0,
        sentCost: (m.materialCharge ?? 0) - (m.materialProfit ?? 0),
        unsentCharge: m.unsentMaterialCharge ?? 0,
        unsent: m.unsentMaterials,
        payments: m.billing.paymentCount,
        locked: m.isLocked,
    };
}

/** The colours the site's charts and cost rows share. */
export const SITE_COLORS = { received: "var(--heat-3)", materials: "var(--heat-2)", labour: "var(--warn-mark)", other: "var(--heat-1)", fee: "var(--accent)", supervision: "var(--heat-4)" };

/** 0.163 → "16.3%". */
export const pctOf = (ratio: number) => `${Math.round(ratio * 1000) / 10}%`;

/** A markup as a signed percentage: 0.15 → "+15%", -0.05 → "−5%". */
export const markupText = (ratio: number) => `${ratio >= 0 ? "+" : "−"}${Math.abs(Math.round(ratio * 1000) / 10)}%`;

/** Open for site records (materials and labour): not closed, and not finalised, as the API's SiteRules has it. */
export const isSiteOpen = (project: Project) =>
    project.status !== "completed" && project.status !== "archived" && !project.finalizedAt && !project.money?.isLocked;
