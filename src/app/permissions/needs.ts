import { P, type PermissionCode } from "./codes";

/**
 * The permission an action needs before it can be used at all: the one that shows the page or part the action
 * lives in (creating a client happens on the Clients page, which client:view opens). Granting the action grants
 * this too, and the permissions window says so.
 */
export const NEEDS: Partial<Record<PermissionCode, PermissionCode>> = {
    [P.CLIENT_CREATE]: P.CLIENT_VIEW,
    [P.CLIENT_MANAGE]: P.CLIENT_VIEW,
    [P.EMPLOYEE_MANAGE]: P.EMPLOYEE_VIEW,
    [P.EMPLOYEE_PAY_MANAGE]: P.EMPLOYEE_VIEW,
    [P.PERMISSION_MANAGE]: P.EMPLOYEE_VIEW,
    [P.EMPLOYEE_CHANGE_EMAIL]: P.EMPLOYEE_VIEW,
    [P.SESSION_MANAGE]: P.EMPLOYEE_VIEW,
    [P.OVERHEAD_CATEGORY_MANAGE]: P.OVERHEAD_MANAGE,
    [P.HOURS_EXCUSE]: P.SALARY_VIEW,
    [P.INVOICE_CREATE]: P.FINANCIAL_VIEW,
    [P.INVOICE_SEND]: P.FINANCIAL_VIEW,
    [P.INVOICE_VOID]: P.FINANCIAL_VIEW,
    [P.PAYMENT_RECORD]: P.FINANCIAL_VIEW,
    [P.PAYMENT_VOID]: P.FINANCIAL_VIEW,
    [P.EXPENSE_MANAGE]: P.FINANCIAL_VIEW,
    [P.PROJECT_PRICING_MANAGE]: P.FINANCIAL_VIEW,
    [P.BOQ_CREATE]: P.FINANCIAL_VIEW,
    [P.REQUIREMENT_MANAGE]: P.REQUIREMENT_VIEW,
    [P.REQUIREMENT_COMPLETE_OWN]: P.REQUIREMENT_VIEW,
    [P.WORK_ENTRY_CREATE]: P.WORK_ENTRY_VIEW_OWN,
    [P.WORK_ENTRY_COMMENT]: P.WORK_ENTRY_VIEW_ALL,
    [P.PROJECT_CREATE]: P.PROJECT_VIEW,
    [P.PROJECT_EDIT]: P.PROJECT_VIEW,
    [P.PROJECT_CHANGE_STATUS]: P.PROJECT_VIEW,
    [P.MEETING_MANAGE]: P.PROJECT_VIEW,
    [P.MATERIAL_MANAGE]: P.PROJECT_VIEW,
    [P.LABOUR_REPORT_MANAGE]: P.PROJECT_VIEW,
    [P.PROJECT_FILES_MANAGE]: P.PROJECT_VIEW,
};

/** The actions that need `code`. */
export const neededBy = (code: string): PermissionCode[] =>
    (Object.keys(NEEDS) as PermissionCode[]).filter((action) => NEEDS[action] === code);
