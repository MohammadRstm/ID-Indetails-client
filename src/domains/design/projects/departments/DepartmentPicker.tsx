import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useTeams } from "../../people/peopleWorkApi";
import { FULL_FILE, isFullFile } from "./departmentsApi";

/** The Design departments as chips, any number chosen; a full file says so. */
export function DepartmentPicker({ value, onChange, label = "Departments" }: { value: number[]; onChange: (ids: number[]) => void; label?: string }) {
    const departments = useTeams("design");
    if (!departments.data) return <SkeletonLines lines={1} />;
    if (departments.data.length === 0) {
        return <div className="muted">No Design department yet: a super admin adds them in Company › Departments.</div>;
    }

    return (
        <div className="chips" role="group" aria-label={label}>
            {departments.data.map((d) => {
                const on = value.includes(d.id);
                return (
                    <button key={d.id} type="button" className={cx("chip", on && "on")} aria-pressed={on}
                        onClick={() => onChange(on ? value.filter((id) => id !== d.id) : [...value, d.id])}>
                        {on && <Icon name="check" style={{ width: 12, height: 12 }} />}{d.name}
                    </button>
                );
            })}
            {isFullFile(value, departments.data) && <span className="badge">{FULL_FILE}</span>}
        </div>
    );
}
