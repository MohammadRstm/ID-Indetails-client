import { useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { loadFailed } from "@/api/queryState";
import { Presence } from "@/shared/components/Data/Bits";
import { StatusBadge } from "@/shared/components/Data/Pills";
import Pager from "@/shared/components/Data-Tables/Pager";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { ChipGroup, SearchInput } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import { PersonLine } from "@/shared/components/Identity/People";
import { DOMAIN_LABEL } from "@/shared/format/labels";
import { fmtDateY } from "@/shared/format/time";
import useDebounce from "@/shared/hooks/useDebounce";
import Icon from "@/shared/icons/Icon";
import PersonActions from "../../design/people/PersonActions";
import InviteModal from "../../shared/people/InviteModal";
import { personName, usePeople, type EmployeeSummary } from "../../shared/people/peopleApi";

type Status = "all" | "active" | "invited" | "deactivated";
type Where = "all" | "design" | "execution" | "company";

const PAGE = 25;
const ROLE: Record<string, string> = { super_admin: "Super admin", admin: "Admin", employee: "Employee" };

/** Where the filter looks: a business, or the super admins above both. */
const whereParams = (where: Where) =>
    where === "company" ? { role: "super_admin" } : where === "all" ? {} : { domain: where };

/**
 * Everyone in the company, in both businesses and above them (employee:view): who is working, who is still
 * invited and who has left. People are added by invitation, and never edited here: their account is ended and
 * started again (deactivate and reactivate), which keeps their history. Their details are on their profile.
 * Given a business, it lists only that business's people (its Employees page, for someone who can't see
 * everyone's hours).
 */
export default function CompanyPeople({ domain }: { domain?: Domain }) {
    const permissions = usePermissions();
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<Status>("all");
    const [where, setWhere] = useState<Where>(domain ?? "all");
    const [page, setPage] = useState(1);
    const [inviting, setInviting] = useState(false);
    const topRef = useRef<HTMLDivElement>(null);
    const typed = useDebounce({ value: search.trim(), debounceTimeMs: 300 });
    const query = usePeople({ search: typed, status: status === "all" ? undefined : status, ...whereParams(where), page, pageSize: PAGE });
    const list = query.data;
    const canInvite = permissions.hasAny(P.EMPLOYEE_INVITE, P.EMPLOYEE_INVITE_SUPER_ADMIN);
    // ?invite=1 (from search) opens the invitation
    const [params, setParams] = useSearchParams();
    const asked = params.get("invite") === "1" && canInvite;
    const closeInvite = () => {
        setInviting(false);
        if (asked) { params.delete("invite"); setParams(params, { replace: true }); }
    };
    // a filter starts again from the first page
    const filter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

    return (
        <div ref={topRef}>
            <div className="filters">
                <SearchInput width={240} value={search} onChange={filter(setSearch)} placeholder="Search name, position or email" />
                <ChipGroup value={status} onChange={filter(setStatus)} aria-label="Status" options={[
                    { value: "all", label: "Everyone" }, { value: "active", label: "Active" }, { value: "invited", label: "Invited" }, { value: "deactivated", label: "Left" },
                ]} />
                <div className="grow" />
                {!domain && (
                    <Select className="select sm" style={{ width: 170 }} aria-label="Business" value={where} onChange={filter(setWhere)} options={[
                        { value: "all", label: "Both businesses" }, { value: "design", label: "Design" }, { value: "execution", label: "Execution" }, { value: "company", label: "Super admins" },
                    ]} />
                )}
                {canInvite && <button className="btn btn-primary btn-sm" onClick={() => setInviting(true)}><Icon name="userPlus" />Add person</button>}
            </div>

            <div className="panel">
                {loadFailed(query) ? <div className="panel-body"><LoadError error={query.error} retry={() => query.refetch()} what="the people" /></div>
                    : !list ? <div className="panel-body"><SkeletonLines lines={8} /></div>
                        : list.items.length === 0 ? (
                            <Empty art="search" title={typed || status !== "all" || where !== "all" ? "Nobody matches" : "Nobody here yet"}
                                text={typed || status !== "all" || where !== "all" ? "Try another filter or clear the search." : "Add the first person: they get an invitation by email."} />
                        ) : (
                            <>
                                <div className="tbl-wrap">
                                    <table className="tbl tbl-min">
                                        <thead>
                                            <tr><th>Person</th><th>Access</th>{!domain && <th>Business</th>}<th>Team</th><th>Status</th><th>Joined</th><th aria-label="Actions" /></tr>
                                        </thead>
                                        <tbody>{list.items.map((p) => <PersonRow key={p.id} person={p} business={!domain} />)}</tbody>
                                    </table>
                                </div>
                                <div className="panel-body" style={{ paddingTop: 0 }}>
                                    <Pager page={page} pageSize={PAGE} total={list.totalCount} onPage={setPage} anchor={topRef} />
                                </div>
                            </>
                        )}
            </div>
            <p className="hint mt">
                People aren't edited here: someone who leaves is deactivated, which ends every session they have open, and reactivated if they come back.
                Their work, pay and messages stay either way. Their details are on their profile.
            </p>

            {(inviting || asked) && <InviteModal domain={domain ?? null} onClose={closeInvite} />}
        </div>
    );
}

function PersonRow({ person: p, business }: { person: EmployeeSummary; business: boolean }) {
    const name = personName(p);
    return (
        <tr>
            <td><PersonLine person={{ id: p.id, name, photoFileId: p.photoFileId, online: p.online, domain: p.domain }} size={30} presence link sub={p.position || (name !== p.email && p.email)} /></td>
            <td className="nowrap">{ROLE[p.role] ?? p.role}{p.isJoker && <span className="badge" style={{ marginLeft: 6 }} title="Holds a different set of permissions from the role's">Custom</span>}</td>
            {business && <td className="muted nowrap">{p.domain ? DOMAIN_LABEL[p.domain] ?? p.domain : "Company"}</td>}
            <td className="muted nowrap">{p.team?.name ?? "-"}</td>
            <td className="nowrap">
                {p.status === "invited" ? <StatusBadge status="invited" />
                    : p.status === "deactivated" ? <span className="badge badge-archived"><Icon name="lock" />{p.leftOn ? `Left ${fmtDateY(p.leftOn)}` : "Deactivated"}</span>
                        : p.sessionsRevokedAt ? <span className="badge badge-hold" title={`Sessions ended ${fmtDateY(p.sessionsRevokedAt)}`}><Icon name="lock" />Sign-in suspended</span>
                            : <Presence online={p.online} lastSeenAt={p.lastSeenAt} />}
            </td>
            <td className="muted nowrap">{p.joinedOn ? fmtDateY(p.joinedOn) : "-"}</td>
            <td className="r"><PersonActions account={{ id: p.id, name, role: p.role, domain: p.domain, status: p.status, leftOn: p.leftOn, sessionsRevokedAt: p.sessionsRevokedAt }} /></td>
        </tr>
    );
}
