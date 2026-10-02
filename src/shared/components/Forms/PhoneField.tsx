import { useState } from "react";
import { COUNTRIES, joinPhone, splitPhone } from "@/shared/format/phone";
import Select from "./Select";

const OPTIONS = COUNTRIES.map((c) => ({ value: c.iso, label: `${c.name} ${c.dial}`, short: c.dial }));

type PhoneFieldProps = {
    /** The number box's, for the field's label. */
    id?: string;
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    placeholder?: string;
    "aria-label"?: string;
};

/**
 * A phone number with its country code picked from a list that can be searched by country or code. The value
 * stays one string, the code first ("+961 3 555 142"), and is empty while no number is typed. A number typed or
 * pasted with its own "+" code takes that country.
 */
export default function PhoneField({ id, value, onChange, onBlur, placeholder, ...rest }: PhoneFieldProps) {
    // kept so a country picked before typing, or one of several sharing a code (+1), stays picked
    const [picked, setPicked] = useState(() => splitPhone(value).iso);
    const { iso, local } = splitPhone(value, picked);

    function change(nextIso: string, nextLocal: string) {
        if (nextLocal.trimStart().startsWith("+")) {
            setPicked(splitPhone(nextLocal, nextIso).iso);
            onChange(nextLocal.trimStart());
            return;
        }
        setPicked(nextIso);
        onChange(joinPhone(nextIso, nextLocal));
    }

    return (
        <div className="phone-field">
            <Select className="select phone-code" aria-label="Country code" value={iso} options={OPTIONS} onChange={(next) => change(next, local)} />
            <input id={id} className="input" type="tel" autoComplete="tel-national" placeholder={placeholder} aria-label={rest["aria-label"]}
                value={local} onBlur={onBlur} onChange={(e) => change(iso, e.target.value)} />
        </div>
    );
}
