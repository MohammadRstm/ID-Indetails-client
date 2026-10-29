import NumberField from "@/shared/components/Forms/NumberField";
import { TVA_PERCENT } from "@/shared/format/limits";

/** A project's rate (TVA, supervision), typed as a percentage: 11 for 11%, from 0 to 100. */
export default function PercentField({ id, label, value, onChange }: { id: string; label: string; value: number | ""; onChange: (pct: number | "") => void }) {
    return (
        <div className="field">
            <label className="label required" htmlFor={id}>{label}</label>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
                <NumberField id={id} shape={TVA_PERCENT} style={{ width: 80 }} value={value} onChange={(text) => onChange(text === "" ? "" : +text)} />
                <span className="muted">%</span>
            </div>
        </div>
    );
}
