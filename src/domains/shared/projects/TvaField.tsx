import NumberField from "@/shared/components/Forms/NumberField";
import { TVA_PERCENT } from "@/shared/format/limits";

/**
 * A project's TVA rate, typed as a percentage (15 for 15%). It is on everything the client pays and never shown to the
 * client as a line of its own: they see totals with it included.
 */
export default function TvaField({ id, value, onChange }: { id: string; value: number | ""; onChange: (pct: number | "") => void }) {
    return (
        <div className="field">
            <label className="label required" htmlFor={id}>TVA</label>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
                <NumberField id={id} shape={TVA_PERCENT} style={{ width: 80 }} value={value} onChange={(text) => onChange(text === "" ? "" : +text)} />
                <span className="muted">%</span>
            </div>
        </div>
    );
}
