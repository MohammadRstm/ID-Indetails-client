import { cx } from "@/shared/utils/cx";

/** How much of a text box's limit is used ("120/300"), under it on the right; warmer once it nears the end. */
export default function CharCount({ length, max }: { length: number; max: number }) {
    return <div className={cx("char-count", length >= max * 0.9 && "near")}>{length}/{max}</div>;
}
