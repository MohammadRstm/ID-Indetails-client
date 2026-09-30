import { P } from "@/app/permissions/codes";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { SwitchRow, Toggle } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import { useDomainSettings, type DomainSettings } from "../../design/work/workApi";
import { rulesBody } from "./domainRules";
import { Always } from "./SettingBits";
import { useSaveDomainRules } from "./settingsApi";
import { notSaved, saved } from "./settingsToasts";

/** Reading and saving one domain's rules, a setting at a time. */
function useRules(domain: Domain) {
    const permissions = usePermissions();
    const query = useDomainSettings(domain);
    const rules = query.data;
    const save = useSaveDomainRules(domain);
    // each save sends every rule, so nothing else changes until the last one is back
    const canEdit = permissions.has(P.DOMAIN_SETTINGS_MANAGE) && !save.isPending;
    const set = (patch: Partial<DomainSettings>) => rules && save.mutate({ ...rulesBody(rules), ...patch }, { onSuccess: saved(), onError: notSaved });
    const toggle = (k: keyof DomainSettings, label: string) => (
        <Toggle label={label} checked={!!rules?.[k]} disabled={!canEdit} onChange={(on) => set({ [k]: on })} />
    );
    // what a section shows until the rules are here: a skeleton, or why they aren't
    const pending = query.isError ? <LoadError error={query.error} retry={() => query.refetch()} what="the settings" /> : <SkeletonLines lines={4} />;
    return { rules, canEdit, set, toggle, pending };
}

/** The prototype's Settings → Projects. */
export function ProjectSettings({ domain }: { domain: Domain }) {
    const { rules, toggle, pending } = useRules(domain);
    return (
        <div className="panel">
            <div className="panel-head"><div><div className="panel-title">Projects</div></div></div>
            <div className="panel-body">
                {!rules ? pending : (
                    <>
                        <SwitchRow title="Every employee can see every active project" description="Projects are open to the whole business; requirements say who is on what." control={<Always />} />
                        <SwitchRow title="Notify employees about projects" description="“New project added”, and when a project is put on hold, completed or reopened." control={toggle("notifyProject", "Notify employees about projects")} />
                        <SwitchRow title="Allow logging on projects that are on hold" description="Off keeps paused projects read-only." control={toggle("holdLogging", "Allow logging on projects that are on hold")} />
                        <SwitchRow title="Archive completed projects automatically" description="Completed projects with nothing in the last 90 days move to Archived."
                            control={toggle("autoArchive", "Archive completed projects automatically")} />
                    </>
                )}
            </div>
        </div>
    );
}

/** The prototype's Settings → Notifications. */
export function NotificationSettings({ domain }: { domain: Domain }) {
    const { rules, canEdit, set, toggle, pending } = useRules(domain);
    return (
        <div className="panel">
            <div className="panel-head"><div><div className="panel-title">Notifications</div><div className="panel-sub">Admin notifications get noisy fast - this is where we tune it.</div></div></div>
            <div className="panel-body">
                {!rules ? pending : (
                    <>
                        <SwitchRow title="Work entries" description="What the admin hears when someone logs work." control={
                            <Select className="select sm" style={{ width: 170 }} aria-label="Work entry notifications" disabled={!canEdit} value={rules.notifyEntry}
                                onChange={(v) => set({ notifyEntry: v })} options={[
                                    { value: "all", label: "Every entry" }, { value: "long", label: "Entries of 3 hours or more" },
                                    { value: "digest", label: "One daily digest" }, { value: "off", label: "Off" },
                                ]} />
                        } />
                        <SwitchRow title="Project status changes" description="Employees hear when a project is created, put on hold, completed or reopened." control={toggle("notifyProject", "Project status changes")} />
                        <SwitchRow title="Inactive project alerts" description="Flags an active project with no work for 7 days under “Needs attention”." control={toggle("notifyIdle", "Inactive project alerts")} />
                        <SwitchRow title="Weekly summary" description="The Monday “you logged … last week” notification every employee gets." control={toggle("weeklySummary", "Weekly summary")} />
                    </>
                )}
            </div>
        </div>
    );
}
