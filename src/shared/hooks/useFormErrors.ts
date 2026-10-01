import { useState } from "react";

/**
 * When a form shows its errors: a field's once someone has left it, and every field's once they have tried to
 * submit, updating live from then on as they type. The submit button stays clickable (disabled only while
 * saving), so pressing it says what is missing instead of doing nothing.
 *
 *   const errors = useFormErrors();
 *   <input onBlur={errors.touch("email")} ... />
 *   <FieldError message={errors.show("email", !valid && "Enter an email like name@company.com.")} />
 *   <button onClick={() => { if (!ok) return errors.tried(); save(); }}>Save</button>
 */
export function useFormErrors() {
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [tried, setTried] = useState(false);
    return {
        /** An onBlur for the field: its error shows from then on. */
        touch: (field: string) => () => setTouched((t) => (t[field] ? t : { ...t, [field]: true })),
        /** The message to show for the field, or nothing yet (or nothing wrong). */
        show: (field: string, message: string | false | null | undefined): string | undefined =>
            (tried || touched[field]) && message ? message : undefined,
        /** A submit was pressed: every field's error shows. */
        tried: () => setTried(true),
    };
}
