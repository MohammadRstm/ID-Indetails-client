import { useState } from "react";
import { Avatars } from "@/shared/components/Identity/People";
import Popover from "@/shared/components/Overlays/Popover";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";

export type PickablePerson = { id: number; name: string; photoFileId?: number | null; team?: string | null };

type PeoplePickerProps = {
    value: number[];
    onChange: (ids: number[]) => void;
    options: PickablePerson[];
    id?: string;
    /** Shown while no one is picked. */
    none?: string;
    /** The clear button's words. */
    clear?: string;
};

/** Several people from a list, with a search box (a requirement's assignees, a meeting's attendees). */
export default function PeoplePicker({ value, onChange, options, id, none = "Not assigned", clear = "Clear - not assigned" }: PeoplePickerProps) {
    const [q, setQ] = useState("");
    const shown = options.filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()));
    const chosen = options.filter((x) => value.includes(x.id));
    const toggle = (pid: number) => onChange(value.includes(pid) ? value.filter((x) => x !== pid) : [...value, pid]);
    return (
        <Popover width={260} floating trigger={(open, t) => (
            <button type="button" id={id} className={cx("input req-pick", open && "on")} onClick={t}>
                {chosen.length ? (
                    <>
                        <Avatars people={chosen} max={4} size={18} />
                        <span className="trunc">{chosen.length === 1 ? chosen[0].name : `${chosen.length} people`}</span>
                    </>
                ) : <span className="muted">{none}</span>}
                <span className="grow" /><Icon name="chevronDown" />
            </button>
        )}>
            <div>
                <div className="search" style={{ margin: "2px 2px 6px" }}>
                    <Icon name="search" />
                    <input className="input" placeholder="Search employees" aria-label="Search employees" value={q} onChange={(e) => setQ(e.target.value)} />
                </div>
                <div className="req-pick-list">
                    {shown.map((x) => (
                        <button key={x.id} type="button" className={cx("pop-item", value.includes(x.id) && "on")} onClick={() => toggle(x.id)}>
                            <Avatars people={[x]} size={20} />
                            <span className="grow trunc">{x.name}{x.team && <span className="muted" style={{ fontSize: 11 }}> · {x.team}</span>}</span>
                            {value.includes(x.id) && <Icon name="check" className="chk" />}
                        </button>
                    ))}
                    {!shown.length && <div className="muted" style={{ padding: 8, fontSize: 12 }}>No employees match.</div>}
                </div>
                {value.length > 0 && (
                    <button type="button" className="btn btn-sm btn-quiet btn-block" style={{ marginTop: 4 }} onClick={() => onChange([])}>{clear}</button>
                )}
            </div>
        </Popover>
    );
}
