import { cx } from "@/shared/utils/cx";
import type { SalaryAdvanceSettlement, SalaryAdvanceStatus } from "./salaryAdvancesApi";

const WORDS: Record<SalaryAdvanceStatus, string> = {
    pending: "Waiting for a decision",
    approved: "Given",
    declined: "Declined",
    withdrawn: "Withdrawn",
    cancelled: "Cancelled",
};

const SETTLED: Record<SalaryAdvanceSettlement, string> = { cash: "Repaid in cash", written_off: "Written off" };

type Shown = { status: SalaryAdvanceStatus; left: number | null; settledKind?: SalaryAdvanceSettlement | null };

/**
 * An advance's status: amber while it waits, green while it is being paid back, grey once it is paid back, settled,
 * declined, withdrawn or cancelled.
 */
export function AdvanceStatusBadge({ advance }: { advance: Shown }) {
    const { status, left, settledKind } = advance;
    const beingRepaid = status === "approved" && !settledKind && (left ?? 0) > 0;
    const words = settledKind ? SETTLED[settledKind]
        : status === "approved" ? (beingRepaid ? "Being paid back" : "Paid back")
        : WORDS[status];
    return <span className={cx("badge", status === "pending" && "badge-hold", beingRepaid && "badge-active")}>{words}</span>;
}
