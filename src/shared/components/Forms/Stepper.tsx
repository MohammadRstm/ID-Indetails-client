import type { ReactNode } from "react";
import Icon from "@/shared/icons/Icon";

type StepperProps = {
    label: ReactNode;
    onPrev: () => void;
    onNext: () => void;
    prevDisabled?: boolean;
    nextDisabled?: boolean;
    /** What a step is, for screen readers: "month", "week". */
    unit?: string;
    minWidth?: number;
};

/** ‹ September 2026 › : the prototype's month and week steppers. */
export default function Stepper({ label, onPrev, onNext, prevDisabled, nextDisabled, unit = "month", minWidth = 130 }: StepperProps) {
    return (
        <div className="row" style={{ gap: 4 }}>
            <button className="icon-btn" aria-label={`Previous ${unit}`} disabled={prevDisabled} onClick={onPrev}>
                <Icon name="chevronLeft" />
            </button>
            <b style={{ minWidth, textAlign: "center" }}>{label}</b>
            <button className="icon-btn" aria-label={`Next ${unit}`} disabled={nextDisabled} onClick={onNext}>
                <Icon name="chevronRight" />
            </button>
        </div>
    );
}
