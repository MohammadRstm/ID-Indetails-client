import type { CSSProperties, ReactNode } from "react";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";

/*
 * The pieces of the prototype's filter bars: a search box, chips with counts, a segmented control and the
 * thin separator between groups. Pages lay them out in a .filters row.
 */

type SearchInputProps = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    width?: CSSProperties["width"];
    autoFocus?: boolean;
    "aria-label"?: string;
};

export function SearchInput({ value, onChange, placeholder = "Search", width = 230, autoFocus, ...rest }: SearchInputProps) {
    return (
        <div className="search" style={{ width }}>
            <Icon name="search" />
            <input
                className="input"
                placeholder={placeholder}
                value={value}
                autoFocus={autoFocus}
                aria-label={rest["aria-label"] ?? placeholder}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
}

export type ChipOption<V extends string> = { value: V; label: ReactNode; count?: number };

type ChipGroupProps<V extends string> = {
    value: V;
    options: ChipOption<V>[];
    onChange: (value: V) => void;
    "aria-label"?: string;
};

/** One-of-many chips, each with an optional count. */
export function ChipGroup<V extends string>({ value, options, onChange, ...rest }: ChipGroupProps<V>) {
    return (
        <div className="chips" role="group" aria-label={rest["aria-label"]}>
            {options.map((o) => (
                <button key={o.value} type="button" className={cx("chip", value === o.value && "on")} aria-pressed={value === o.value}
                    onClick={() => onChange(o.value)}>
                    {o.label}
                    {o.count != null && <span className="cnt">{o.count}</span>}
                </button>
            ))}
        </div>
    );
}

type SegmentedProps<V extends string> = {
    value: V;
    options: { value: V; label: ReactNode }[];
    onChange: (value: V) => void;
    className?: string;
    style?: CSSProperties;
    /** Buttons share the width equally. */
    stretch?: boolean;
    "aria-label"?: string;
};

/** The prototype's .seg control: a few mutually exclusive views or periods. */
export function Segmented<V extends string>({ value, options, onChange, className, style, stretch, ...rest }: SegmentedProps<V>) {
    return (
        <div className={cx("seg", className)} role="tablist" aria-label={rest["aria-label"]} style={stretch ? { width: "100%", ...style } : style}>
            {options.map((o) => (
                <button key={o.value} type="button" role="tab" aria-selected={value === o.value}
                    className={cx("seg-btn", value === o.value && "on")} style={stretch ? { flex: 1 } : undefined}
                    onClick={() => onChange(o.value)}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function FilterSep() {
    return <div className="filter-sep" />;
}

type ToggleProps = {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    disabled?: boolean;
};

/** The prototype's on/off switch. */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
    return (
        <button type="button" className="switch" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
            onClick={() => onChange(!checked)} />
    );
}

type SwitchRowProps = {
    title: ReactNode;
    description?: ReactNode;
    control: ReactNode;
    style?: CSSProperties;
};

/** A setting: title and explanation on the left, its control on the right. */
export function SwitchRow({ title, description, control, style }: SwitchRowProps) {
    return (
        <div className="switch-row" style={style}>
            <div className="grow">
                <div style={{ fontWeight: 600 }}>{title}</div>
                {description && <p>{description}</p>}
            </div>
            {control}
        </div>
    );
}
