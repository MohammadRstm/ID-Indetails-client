import type { ReactNode } from "react";
import { money } from "@/shared/format/money";
import { cx } from "@/shared/utils/cx";

type MoneyProps = {
    value: number | null | undefined;
    currency?: string;
    /** Tighter, for tiles and chart labels. */
    short?: boolean;
    /** "auto" colours gains green and losses red. */
    tone?: "auto" | "up" | "down" | "";
    size?: string;
    prefix?: string;
    className?: string;
};

/** An amount as the prototype shows it: short on screen, every digit in the tooltip (UI.Money). */
export function Money({ value, currency = "USD", short, tone = "", size, prefix = "", className }: MoneyProps) {
    const v = value ?? 0;
    const shade = tone === "auto" ? (v > 0 ? "up" : v < 0 ? "down" : "") : tone;
    const text = short ? money.short(v, currency) : money.fmt(v, currency);
    const full = money.exact(v, currency);
    return (
        <span className={cx("money", size, shade, className)} title={full !== text ? full : undefined}>
            {prefix}
            {text}
        </span>
    );
}

type CostRowProps = {
    label: ReactNode;
    value: ReactNode;
    meta?: ReactNode;
    /** A colour dot, matching a chart. */
    swatch?: string;
    strong?: boolean;
    tone?: string;
    onClick?: () => void;
};

/** A label and an amount on one line, as in cost summaries (the prototype's UI.CostRow). */
export function CostRow({ label, value, meta, swatch, strong, tone, onClick }: CostRowProps) {
    return (
        <div className={cx("cost-row", strong && "strong", onClick && "click")} onClick={onClick}>
            {swatch && <i className="cost-dot" style={{ background: swatch }} />}
            <span className="grow trunc">{label}</span>
            {meta && <span className="muted" style={{ fontSize: "11.5px" }}>{meta}</span>}
            <span className={cx("mono", tone)}>{value}</span>
        </div>
    );
}

/** Amounts in another currency that aren't converted, shown beside the USD figure (UI.MixedCurrency). */
export function MixedCurrency({ amounts }: { amounts: { currency: string; amount: number }[] | null | undefined }) {
    if (!amounts?.length) return null;
    return (
        <span className="badge cur-chip" title="In another currency: shown separately, not converted">
            + {amounts.map((a) => money.short(a.amount, a.currency)).join(" + ")}
        </span>
    );
}
