import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import Empty from "@/shared/components/Feedback/Empty";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { plural } from "@/shared/format/labels";
import Icon from "@/shared/icons/Icon";
import { useTeams } from "../../design/people/peopleWorkApi";
import { useDeleteTeam, useSaveTeam, type Team } from "./settingsApi";
import { saved } from "./settingsToasts";
import { loadFailed } from "@/api/queryState";

/**
 * The business's teams: what each person belongs to, shown on their profile and in the schedules. The
 * prototype had them fixed; the API lets them be added, renamed and removed (team:manage).
 */
export default function TeamsSettings({ domain }: { domain: Domain }) {
    const permissions = usePermissions();
    const canEdit = permissions.has(P.TEAM_MANAGE);
    const teams = useTeams(domain);
    const [adding, setAdding] = useState(false);
    const list = (teams.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

    return (
        <div className="panel">
            <div className="panel-head">
                <div><div className="panel-title">Teams</div><div className="panel-sub">Who works with whom. A person's team is shown on their profile and groups the schedules.</div></div>
                {canEdit && !adding && <div className="panel-tools"><button className="btn btn-sm" onClick={() => setAdding(true)}><Icon name="plus" />Add team</button></div>}
            </div>
            <div className="panel-body">
                {loadFailed(teams) ? <LoadError error={teams.error} retry={() => teams.refetch()} what="the teams" />
                    : !teams.data ? <SkeletonLines lines={4} /> : (
                        <>
                            {adding && <TeamRow domain={domain} team={null} canEdit onDone={() => setAdding(false)} />}
                            {list.map((t) => <TeamRow key={t.id} domain={domain} team={t} canEdit={canEdit} />)}
                            {!list.length && !adding && <Empty art="search" title="No teams yet" text={canEdit ? "Add the first one: people can then be put in it from their profile." : "An admin with team access can add them."} />}
                        </>
                    )}
            </div>
        </div>
    );
}

/** One team: its name and people, renamed in place; or the new team being named. */
function TeamRow({ domain, team, canEdit, onDone }: { domain: Domain; team: Team | null; canEdit: boolean; onDone?: () => void }) {
    const save = useSaveTeam();
    const remove = useDeleteTeam();
    const [name, setName] = useState<string | null>(team ? null : "");
    const [confirming, setConfirming] = useState(false);
    const editing = name != null;
    const error = save.error ?? remove.error;

    function submit() {
        if (!name?.trim()) return;
        save.mutate({ id: team?.id ?? null, name: name.trim(), domain }, {
            onSuccess: () => { saved(team ? "Team renamed" : "Team added", name.trim())(); setName(null); onDone?.(); },
        });
    }

    return (
        <div className="switch-row">
            <div className="grow">
                {editing ? (
                    <input className="input" autoFocus aria-label="Team name" placeholder="e.g. Interiors" value={name} maxLength={100}
                        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setName(team ? null : ""); onDone?.(); } }} />
                ) : (
                    <>
                        <div style={{ fontWeight: 600 }}>{team!.name}</div>
                        <p>{plural(team!.memberCount, "person", "people")}</p>
                    </>
                )}
                {error != null && <div className="err mt-s" style={{ fontSize: 12 }}><Icon name="alert" />{errorMessage(error)}</div>}
            </div>
            {canEdit && (editing ? (
                <div className="row" style={{ gap: 6 }}>
                    <button className="btn btn-sm btn-primary" disabled={!name?.trim() || save.isPending} onClick={submit}>{team ? "Save" : "Add"}</button>
                    <button className="btn btn-sm" onClick={() => { setName(team ? null : ""); save.reset(); onDone?.(); }}>Cancel</button>
                </div>
            ) : confirming ? (
                <div className="row" style={{ gap: 6 }}>
                    <span className="muted" style={{ fontSize: 12 }}>Remove {team!.name}?</span>
                    <button className="btn btn-sm btn-danger" disabled={remove.isPending}
                        onClick={() => remove.mutate(team!.id, { onSuccess: saved("Team removed", team!.name), onSettled: () => setConfirming(false) })}>Remove</button>
                    <button className="btn btn-sm" onClick={() => setConfirming(false)}>Keep</button>
                </div>
            ) : (
                <div className="row" style={{ gap: 6 }}>
                    <button className="btn btn-sm btn-quiet" onClick={() => setName(team!.name)}>Rename</button>
                    <button className="btn btn-sm btn-quiet" onClick={() => { remove.reset(); setConfirming(true); }}>Remove</button>
                </div>
            ))}
        </div>
    );
}
