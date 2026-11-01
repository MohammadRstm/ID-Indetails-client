import PercentField from "./PercentField";

/**
 * A project's TVA rate, typed as a percentage (11 for 11%). It is on everything the client pays and never shown to the
 * client as a line of its own: they see totals with it included.
 */
export default function TvaField({ id, value, onChange }: { id: string; value: number | ""; onChange: (pct: number | "") => void }) {
    return <PercentField id={id} label="TVA" value={value} onChange={onChange} />;
}
