import MenuButton from "@/shared/components/Overlays/MenuButton";
import Icon from "@/shared/icons/Icon";
import { openLogWork } from "./logWorkStore";
import type { WorkEntry } from "./workApi";

/** Edit and Delete for one of the person's own entries, while it can still change (its edit window, an open month and project). */
export default function EntryActions({ entry, onDelete }: { entry: WorkEntry; onDelete: (entry: WorkEntry) => void }) {
    if (!entry.canEdit) return null;
    // a row that opens its entry on a click stays shut: the menu's clicks and keys (its items too) stop here
    return (
        <span onClick={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}>
            <MenuButton icon="dots" label="Entry actions" width={170}>
                {(close) => (
                    <div>
                        <button className="pop-item" onClick={() => { close(); openLogWork({ edit: entry }); }}><Icon name="edit" />Edit entry</button>
                        <button className="pop-item" onClick={() => { close(); onDelete(entry); }}><Icon name="trash" />Delete</button>
                    </div>
                )}
            </MenuButton>
        </span>
    );
}
