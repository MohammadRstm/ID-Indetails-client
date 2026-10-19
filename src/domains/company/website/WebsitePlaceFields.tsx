import { useDeferredValue, useEffect, useId, useState } from "react";
import Field from "@/shared/components/Forms/Field";
import Select from "@/shared/components/Forms/Select";
import Icon from "@/shared/icons/Icon";
import { useCities, useCountries } from "./websiteApi";

type PlaceFieldsProps = {
    idPrefix: string;
    country: string;
    city: string;
    disabled?: boolean;
    /** A project may sit in a country alone; an office needs its city. */
    cityOptional: boolean;
    countryError?: string;
    cityError?: string;
    /** A new country clears the city, which belonged to the old one. */
    onChange: (country: string, city: string) => void;
    onBlur?: () => void;
};

/**
 * The country and city, chosen from the lists (GeoNames), so a place is never misspelt: the country from all of them,
 * then the city from that country's, found as it is typed.
 */
export default function PlaceFields({ idPrefix, country, city, disabled, cityOptional, countryError, cityError, onChange, onBlur }: PlaceFieldsProps) {
    const countries = useCountries();
    const code = countries.data?.find((c) => c.name === country)?.code;
    return (
        <div className="grid g-2">
            <Field id={`${idPrefix}-country`} label="Country" error={countryError}>
                <Select id={`${idPrefix}-country`} value={country} disabled={disabled || !countries.data} searchable searchPlaceholder="Type a country"
                    onChange={(next) => { if (next !== country) onChange(next, ""); onBlur?.(); }}
                    options={[
                        { value: "", label: countries.data ? "No country yet" : "Loading the countries…" },
                        ...(countries.data ?? []).map((c) => ({ value: c.name, label: c.name })),
                    ]} />
            </Field>
            <Field id={`${idPrefix}-city`} label="City" error={cityError}
                hint={!country ? "Choose the country first." : cityOptional ? "Optional: without one, the website shows only the country." : undefined}>
                <CityPicker id={`${idPrefix}-city`} countryCode={code} value={city} disabled={disabled || !code} onChange={(next) => onChange(country, next)} onBlur={onBlur} />
            </Field>
        </div>
    );
}

/** A city of the country: typed to search, picked from the list; typing alone never sets a city that isn't in it. */
function CityPicker({ id, countryCode, value, disabled, onChange, onBlur }: {
    id: string; countryCode: string | undefined; value: string; disabled?: boolean; onChange: (city: string) => void; onBlur?: () => void;
}) {
    const listId = useId();
    const [text, setText] = useState(value);
    const [open, setOpen] = useState(false);
    const search = useDeferredValue(text === value ? "" : text.trim());
    const cities = useCities(countryCode, search, open);
    useEffect(() => setText(value), [value]);

    function pick(name: string) {
        onChange(name);
        setText(name);
        setOpen(false);
    }

    return (
        <div style={{ position: "relative" }}>
            <div className="row" style={{ gap: 4 }}>
                <input id={id} className="input" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off"
                    placeholder={countryCode ? "Type to find the city" : ""} value={text} disabled={disabled}
                    onChange={(e) => { setText(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") { setText(value); setOpen(false); }
                        if (e.key === "Enter" && cities.data?.[0]) { e.preventDefault(); pick(cities.data[0].name); }
                    }}
                    // what was typed but not picked goes back to the city chosen
                    onBlur={() => { setOpen(false); setText(value); onBlur?.(); }} />
                {value && !disabled && (
                    <button type="button" className="icon-btn" aria-label="No city" title="No city" onMouseDown={(e) => e.preventDefault()} onClick={() => pick("")}>
                        <Icon name="x" />
                    </button>
                )}
            </div>
            {open && countryCode && (
                <div id={listId} role="listbox" aria-label="Cities" className="panel"
                    style={{ position: "absolute", zIndex: 30, left: 0, right: 0, marginTop: 4, maxHeight: 220, overflowY: "auto", padding: 4 }}>
                    {cities.isLoading ? <div className="muted" style={{ padding: 6 }}>Finding the cities…</div>
                        : cities.data?.length === 0 ? <div className="muted" style={{ padding: 6 }}>No city of that name. Check the spelling, or type the coordinates.</div>
                            : cities.data?.map((c) => (
                                <button key={`${c.name}-${c.latitude}`} type="button" role="option" aria-selected={c.name === value} className="btn btn-sm btn-quiet"
                                    style={{ display: "flex", width: "100%", justifyContent: "space-between" }}
                                    onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c.name)}>
                                    <span>{c.name}</span>
                                    <span className="muted num">{c.population.toLocaleString()}</span>
                                </button>
                            ))}
                </div>
            )}
        </div>
    );
}
