import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { http } from "@/api/http";
import { keys } from "@/api/keys";
import type { Schemas } from "@/api/types";
import { P } from "@/app/permissions/codes";
import type { Domain, Permissions } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { canOpen, companyNav } from "@/app/routing/routeTable";
import { ProjectTile } from "@/shared/components/Data/Bits";
import { PROJECT_STATUS } from "@/shared/components/Data/status";
import LoadError from "@/shared/components/Feedback/LoadError";
import Skeleton from "@/shared/components/Feedback/Skeleton";
import Avatar from "@/shared/components/Identity/Avatar";
import useDebounce from "@/shared/hooks/useDebounce";
import { DOMAIN_LABEL } from "@/shared/format/labels";
import Icon from "@/shared/icons/Icon";
import type { IconName } from "@/shared/icons/icons";
import { cx } from "@/shared/utils/cx";
import type { ShellArea } from "./useArea";

type SearchResponse = Schemas["SearchResponse"];

type Item = { key: string; kind: string; label: string; sub?: string | null; node: ReactNode; go: string };
type Action = { label: string; icon: IconName; path: string; when?: boolean };

const MAX = 12;

/** Search and quick actions (the prototype's P.CommandPalette), opened with Ctrl/Cmd+K or the top bar. */
export default function CommandPalette({ area, onClose }: { area: ShellArea; onClose: () => void }) {
    const navigate = useNavigate();
    const p = usePermissions();
    const [q, setQ] = useState("");
    const [sel, setSel] = useState(0);
    const text = useDebounce({ value: q.trim(), debounceTimeMs: 150 });
    const found = useQuery({
        queryKey: keys.search(text),
        queryFn: async () => (await http.get<SearchResponse>("/search", { params: { q: text || undefined } })).data,
        placeholderData: keepPreviousData,
        staleTime: 30_000,
    });

    const domain = area.kind === "domain" ? area.domain : null;
    const s = q.trim().toLowerCase();
    const items = [
        ...resultItems(found.data, p, domain),
        ...actionItems(p, area).filter((a) => !s || a.label.toLowerCase().includes(s)),
    ].slice(0, MAX);
    const at = Math.min(sel, items.length - 1);

    function run(item: Item) {
        onClose();
        navigate(item.go);
    }

    return (
        <div className="cmdk-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="cmdk" role="dialog" aria-modal="true" aria-label="Search">
                <input className="cmdk-input" autoFocus aria-label="Search"
                    placeholder={p.isAdmin ? "Search projects, people or actions…" : "Search projects and actions…"}
                    value={q}
                    onChange={(e) => { setQ(e.target.value); setSel(0); }}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") onClose();
                        if (e.key === "ArrowDown") { e.preventDefault(); setSel(Math.min(at + 1, items.length - 1)); }
                        if (e.key === "ArrowUp") { e.preventDefault(); setSel(Math.max(at - 1, 0)); }
                        if (e.key === "Enter" && items[at]) run(items[at]);
                    }} />
                <div className="cmdk-list" role="listbox">
                    {found.isPending && Array.from({ length: 4 }, (_, i) => (
                        <div key={i} className="cmdk-item" aria-hidden="true">
                            <Skeleton width={20} height={20} style={{ borderRadius: 6 }} /><Skeleton width={`${60 - i * 8}%`} height={10} />
                        </div>
                    ))}
                    {found.isError && <div style={{ padding: "6px 10px" }}><LoadError error={found.error} retry={() => found.refetch()} what="search results" /></div>}
                    {items.map((item, i) => (
                        <button key={item.key} role="option" aria-selected={i === at} className={cx("cmdk-item", i === at && "on")}
                            onMouseEnter={() => setSel(i)} onClick={() => run(item)}>
                            {item.node}
                            <span className="grow trunc">{item.label}</span>
                            {item.sub ? <span className="muted" style={{ fontSize: "11px" }}>{item.sub}</span> : null}
                            <span className="cmdk-kind">{item.kind}</span>
                        </button>
                    ))}
                    {items.length === 0 && !found.isPending && !found.isError && <div className="empty" style={{ padding: "26px" }}><h4>No matches</h4></div>}
                </div>
                <div className="cmdk-foot"><span>↑↓ to move</span><span>↵ to open</span><span>esc to close</span></div>
            </div>
        </div>
    );
}

/** The API's matches, each kept only if this person may open its page. */
function resultItems(data: SearchResponse | undefined, p: Permissions, current: Domain | null): Item[] {
    if (!data) return [];
    const several = p.visibleDomains.length > 1;
    const where = (d: string | null) => (several && d ? ` · ${DOMAIN_LABEL[d] ?? d}` : "");
    const out: Item[] = [];
    for (const pr of data.projects) {
        if (!p.canSeeDomain(pr.domain) || !canOpen(p, pr.domain, `projects/${pr.id}`)) continue;
        out.push({
            key: `p${pr.id}`, kind: "Project", label: pr.title, sub: `${PROJECT_STATUS[pr.status]?.label ?? pr.status}${where(pr.domain)}`,
            node: <ProjectTile icon={pr.icon} tint={pr.tint} size="sm" />, go: `/${pr.domain}/projects/${pr.id}`,
        });
    }
    for (const c of data.clients) {
        if (!p.canSeeDomain(c.domain) || !canOpen(p, c.domain, `clients/${c.id}`)) continue;
        out.push({ key: `c${c.id}`, kind: "Client", label: c.displayName, sub: c.secondary, node: <Icon name="briefcase" />, go: `/${c.domain}/clients/${c.id}` });
    }
    for (const person of data.people) {
        // Super admins belong to no domain: their profile opens in the domain being looked at.
        const d = p.canSeeDomain(person.domain) ? person.domain : current ?? p.visibleDomains[0];
        if (!d || !canOpen(p, d, `people/${person.id}`)) continue;
        out.push({
            key: `e${person.id}`, kind: "Employee", label: person.name, sub: person.position,
            node: <Avatar person={{ name: person.name }} size={20} />, go: `/${d}/people/${person.id}`,
        });
    }
    return out;
}

/** The quick actions of the area, each shown only where this person may follow it. */
function actionItems(p: Permissions, area: ShellArea): Item[] {
    if (area.kind === "company") {
        return companyNav(p).map((n) => ({ key: `a${n.path}`, kind: "Action", label: `Open ${n.label.toLowerCase()}`, node: <Icon name={n.icon} />, go: `/company/${n.path}` }));
    }
    const d = area.domain;
    const actions: Action[] = p.isAdmin
        ? [
            { label: "New project", icon: "plus", path: "projects?new=1", when: p.has(P.PROJECT_CREATE) },
            { label: "Add employee", icon: "userPlus", path: "people?invite=1", when: p.has(P.EMPLOYEE_INVITE) },
            { label: "Open clients", icon: "briefcase", path: "clients" },
            { label: "Open financials", icon: "card", path: "financials" },
            { label: "Billing and invoices", icon: "file", path: "financials?tab=billing" },
            { label: "Overdue invoices", icon: "alert", path: "financials?tab=billing&overdue=1" },
            { label: "Open reports", icon: "reports", path: "reports" },
            { label: "Open activity", icon: "activity", path: "activity" },
            { label: "Settings", icon: "settings", path: "settings" },
        ]
        : [
            { label: "Log work", icon: "plus", path: "my-work?log=1", when: d === "design" && p.has(P.WORK_ENTRY_CREATE) },
            { label: "My work", icon: "clock", path: "my-work" },
            { label: "My profile", icon: "user", path: "profile" },
        ];
    return actions
        .filter((a) => a.when !== false && canOpen(p, d, a.path))
        .map((a) => ({ key: `a${a.path}`, kind: "Action", label: a.label, node: <Icon name={a.icon} />, go: `/${d}/${a.path}` }));
}
