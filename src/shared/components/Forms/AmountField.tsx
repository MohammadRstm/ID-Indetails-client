import type { KeyboardEvent } from "react";
import Select from "./Select";

type AmountFieldProps = {
    value: number | null;
    onChange: (value: number) => void;
    currency?: string;
    onCurrency?: (currency: string) => void;
    /** false hides the currency picker (amounts that are always in one currency). */
    currencies?: boolean;
    id?: string;
    placeholder?: string;
    /** Row and column, for grids that move between fields with Enter. */
    r?: number;
    c?: number;
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
};

/** An amount with its currency sign and an optional USD / LBP picker (the prototype's UI.AmountField). */
export default function AmountField({ value, onChange, currency = "USD", onCurrency, currencies = true, id, placeholder = "0", r, c, onKeyDown }: AmountFieldProps) {
    return (
        <div className="amount-field">
            <span className="amount-cur">{currency === "LBP" ? "LBP" : "$"}</span>
            <input
                id={id}
                className="input mono"
                inputMode="decimal"
                placeholder={placeholder}
                value={value === 0 || value ? String(value) : ""}
                data-r={r}
                data-c={c}
                onKeyDown={onKeyDown}
                onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9.]/g, "");
                    onChange(raw === "" ? 0 : Number(raw));
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
