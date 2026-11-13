import { useState, type CSSProperties, type ReactNode } from "react";
import Icon from "@/shared/icons/Icon";
import type { IconName } from "@/shared/icons/icons";
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
    /** The icon in the box: a magnifier, or a funnel for a filter. */
    icon?: IconName;
    "aria-label"?: string;
};

export function SearchInput({ value, onChange, placeholder = "Search", width = 230, autoFocus, icon = "search", ...rest }: SearchInputProps) {
    return (
        <div className="search" style={{ width }}>
            <Icon name={icon} />
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

type ChoiceListProps = {
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
    "aria-label": string;
    /** What the search box above a long list asks for ("Find a client"). */
    findLabel: string;
};

/** More than this many options and the list gets a box to find one by name. */
const FINDABLE_FROM = 8;

/** One-of-many in a list that scrolls, for a long set of options (every client, every person); a long one can be searched. */
export function ChoiceList({ value, options, onChange, findLabel, ...rest }: ChoiceListProps) {
    const [q, setQ] = useState("");
    const word = q.trim().toLowerCase();
    const shown = word ? options.filter((o) => o.label.toLowerCase().includes(word)) : options;
    return (
        <div className="choices">
            {options.length > FINDABLE_FROM && <SearchInput value={q} onChange={setQ} placeholder={findLabel} width="100%" />}
            <div className="choice-list" role="radiogroup" aria-label={rest["aria-label"]}>
                {shown.map((o) => (
                    <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={cx("choice", value === o.value && "on")}
                        onClick={() => onChange(o.value)}>
                        <span className="trunc">{o.label}</span>
                        {value === o.value && <Icon name="check" />}
                    </button>
                ))}
                {shown.length === 0 && <div className="muted choice-empty">Nothing matches "{q.trim()}"</div>}
            </div>
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
    disabled?: boolean;
    "aria-label"?: string;
};

/** The prototype's .seg control: a few mutually exclusive views or periods. */
export function Segmented<V extends string>({ value, options, onChange, className, style, stretch, disabled, ...rest }: SegmentedProps<V>) {
    return (
        <div className={cx("seg", className)} role="tablist" aria-label={rest["aria-label"]} style={stretch ? { width: "100%", ...style } : style}>
            {options.map((o) => (
                <button key={o.value} type="button" role="tab" aria-selected={value === o.value}
                    className={cx("seg-btn", value === o.value && "on")} style={stretch ? { flex: 1 } : undefined} disabled={disabled}
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
