/**
 * "Outside the original scope": work the client asked for beyond what was agreed with them, a change or something
 * new. The system can't tell; whoever logs the work ticks it, and the project report shows where those hours went.
 */
export function ScopeCheck({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
    return (
        <label className="scope-check">
            <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
            <span>
                <b>Outside the original scope</b>
                <span className="muted"> - the client asked for a change or something new</span>
            </span>
        </label>
    );
}

/** The tag on an entry logged as outside the project's original scope. */
export function ScopeTag() {
    return <span className="badge badge-hold scope-tag" title="Work the client asked for beyond what was agreed">Out of scope</span>;
}
