import { useState } from "react";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import Popover from "@/shared/components/Overlays/Popover";
import useDebounce from "@/shared/hooks/useDebounce";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { ClientBadge } from "./ClientBits";
import { secondaryLine, useClient, useClients } from "./clientsApi";
import { loadFailed } from "@/api/queryState";

type ClientPickerProps = {
    domain: string;
    value: number | null;
    onChange: (id: number) => void;
    /** "Add new client", with what was typed. */
    onCreate?: (typed: string) => void;
    invalid?: boolean;
    placeholder?: string;
};

/** A searchable client list with "Add new client" (the prototype's UI.ClientPicker). Archived clients aren't offered. */
export default function ClientPicker({ domain, value, onChange, onCreate, invalid, placeholder = "Search clients…" }: ClientPickerProps) {
    const [q, setQ] = useState("");
    const search = useDebounce({ value: q, debounceTimeMs: 250 });
    const selected = useClient(value);
    const list = useClients({ domain, search, pageSize: 25 });

    return (
        <Popover
            align="left"
            width={320}
            trigger={(open, toggle) => (
                <button type="button" className={cx("client-select", open && "on", invalid && "invalid")} onClick={toggle}>
                    {value && selected.data
                        ? <ClientBadge link={false} client={{ id: selected.data.id, displayName: selected.data.displayName, secondary: secondaryLine(selected.data) }} />
                        : <span className="muted row" style={{ gap: 8 }}><Icon name="search" />{value ? "Loading…" : placeholder}</span>}
                    <Icon name="chevronDown" style={{ marginLeft: "auto", width: 15, height: 15 }} />
                </button>
            )}
        >
            {(close) => (
                <div>
                    <div style={{ padding: "4px 4px 6px" }}>
                        <div className="search">
                            <Icon name="search" />
                            <input className="input" autoFocus placeholder="Name or organisation" aria-label="Find a client" value={q} onChange={(e) => setQ(e.target.value)} />
                        </div>
                    </div>
                    <div style={{ maxHeight: 240, overflowY: "auto" }}>
                        {list.isPending ? <div style={{ padding: 8 }}><SkeletonLines lines={3} /></div>
                            : loadFailed(list) ? <div style={{ padding: 8 }}><LoadError error={list.error} retry={() => list.refetch()} what="the clients" /></div>
                                : list.data!.items.map((c) => (
                                    <button key={c.id} type="button" className={cx("pop-item", value === c.id && "on")} onClick={() => { onChange(c.id); close(); }}>
                                        <ClientBadge link={false} client={{ id: c.id, displayName: c.displayName, secondary: secondaryLine(c) }} />
                                        {value === c.id && <Icon name="check" className="chk" />}
                                    </button>
                                ))}
                        {list.data && list.data.items.length === 0 && (
                            <div className="empty" style={{ padding: "18px 12px" }}>
                                <h4>{search ? "No client matches" : "No clients yet"}</h4>
                                <p>{search ? "Try another name or organisation." : "Add the first client to attach projects to it."}</p>
                            </div>
                        )}
                    </div>
                    {onCreate && (
                        <div className="pop-foot">
                            <button type="button" className="btn btn-sm btn-block" onClick={() => { close(); onCreate(q); }}>
                                <Icon name="plus" />Add new client
                            </button>
                        </div>
                    )}
                </div>
            )}
        </Popover>
    );
}
