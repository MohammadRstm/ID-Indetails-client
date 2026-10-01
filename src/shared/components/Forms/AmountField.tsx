import { useState, type KeyboardEvent } from "react";
import Select from "./Select";

type AmountFieldProps = {
    value: number | null;
    onChange: (value: number) => void;
    currency?: string;
    onCurrency?: (currency: string) => void;
    /** false hides the currency picker (amounts that are always in one currency). */
    currencies?: boolean;
    id?: string;
    /** For a field with no label of its own, as in a grid. */
    "aria-label"?: string;
    placeholder?: string;
    /** Row and column, for grids that move between fields with Enter. */
    r?: number;
    c?: number;
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
    /** Leaving the field, for forms that say what is wrong once a field has been filled in. */
    onBlur?: () => void;
};

const shown = (value: number | null) => (value === 0 || value ? String(value) : "");
const parsed = (text: string) => (text === "" ? 0 : Number(text) || 0);

/** An amount with its currency sign and an optional USD / LBP picker (the prototype's UI.AmountField). */
export default function AmountField({ value, onChange, currency = "USD", onCurrency, currencies = true, id, placeholder = "0", r, c, onKeyDown, onBlur, ...rest }: AmountFieldProps) {
    // The text as typed, so "42." and "42.50" stay as they are while the amount they give is handed up;
    // an amount set from outside replaces it.
    const [text, setText] = useState(() => shown(value));
    const [last, setLast] = useState(value);
    if (value !== last) {
        setLast(value);
        if (parsed(text) !== (value ?? 0)) setText(shown(value));
    }

    return (
        <div className="amount-field">
            <span className="amount-cur">{currency === "LBP" ? "LBP" : "$"}</span>
            <input
                id={id}
                aria-label={rest["aria-label"]}
                className="input mono"
                inputMode="decimal"
                placeholder={placeholder}
                value={text}
                data-r={r}
                data-c={c}
                onKeyDown={onKeyDown}
                onBlur={onBlur}
                onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9.]/g, "");
                    setText(raw);
                    onChange(parsed(raw));
                }}
            />
            {currencies && (
                <Select
                    className="select sm amount-sel"
                    aria-label="Currency"
                    value={currency}
                    options={[{ value: "USD", label: "USD" }, { value: "LBP", label: "LBP" }]}
                    onChange={(next) => onCurrency?.(next)}
                />
            )}
        </div>
    );
}
