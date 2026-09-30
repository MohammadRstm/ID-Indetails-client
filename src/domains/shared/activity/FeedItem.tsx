import { useState } from "react";
import { useNavigate } from "react-router";
import type { Domain } from "@/app/permissions/permissions";
import { usePermissions } from "@/app/permissions/usePermissions";
import { useDomain } from "@/app/routing/domainContext";
import { canOpen } from "@/app/routing/routeTable";
import { PersonAvatar, PersonName, type Person } from "@/shared/components/Identity/People";
import MediaLightbox from "@/shared/components/Overlays/MediaLightbox";
import { fmtDayDate, fmtDur, fmtRange, relTime } from "@/shared/format/time";
import Icon from "@/shared/icons/Icon";
import EntryModal from "../../design/projects/EntryModal";
import { commentCount } from "../../design/work/entryWords";
import { feedWords, type FeedEvent } from "./feedWords";
import { clickable } from "@/shared/utils/clickable";

type FeedItemProps = {
    item: FeedEvent;
    /** People the feed knows more about (photo, presence), by id. */
    people?: Map<number, Person>;
    /** Inside a project, where "on <project>" says nothing. */
    hideProject?: boolean;
};

/** One line of the activity feed (the prototype's HL.FeedItem): logged work opens its entry; anything else says what happened. */
export default function FeedItem({ item, people, hideProject }: FeedItemProps) {
    const navigate = useNavigate();
    const permissions = usePermissions();
    const workspace = useDomain();
    const [viewing, setViewing] = useState(false);
    const [opened, setOpened] = useState(false);
    const domain = (item.domain ?? workspace) as Domain;
    const link = (path: string) => (canOpen(permissions, domain, path) ? `/${domain}/${path}` : null);
    const projectPath = item.project && !hideProject ? link(`projects/${item.project.id}`) : null;
    const clientPath = item.client && !item.project ? link(`clients/${item.client.id}`) : null;
    const personOf = (ref: { id: number; name: string }): Person => people?.get(ref.id) ?? { id: ref.id, name: ref.name };

    const e = item.kind === "work_entry_logged" ? item.workEntry : null;
    if (e) {
        const person = personOf(e.person);
        return (
            <>
                <div className="feed-item click" title="Open this entry - details, file and comments" {...clickable(() => setOpened(true), "button")}>
                    <PersonAvatar person={person} size={28} presence />
                    <div className="grow" style={{ minWidth: 0 }}>
                        <div className="feed-text">
                            <PersonName person={person} bold /> logged <b className="mono">{fmtDur(e.minutes)}</b>
                            {!hideProject && (
                                <span> on <span className="link" {...clickable((ev) => { ev.stopPropagation(); navigate(`/design/projects/${e.project.id}`); }, "link")}>{e.project.title}</span></span>
                            )}
                        </div>
                        <div className="feed-quote trunc">{e.description}</div>
                        <div className="feed-meta">
                            <span className="mono">{fmtDayDate(e.startedAt)} · {fmtRange(e.startedAt, e.endedAt)}</span>
                            <span>·</span><span>logged {relTime(e.createdAt)}</span>
                            {e.attachment && (
                                <>
                                    <span>·</span>
                                    <span className="link" {...clickable((ev) => { ev.stopPropagation(); setViewing(true); }, "button")}><Icon name="file" style={{ width: 11, height: 11 }} />View file</span>
                                </>
                            )}
                            {e.commentCount > 0 && <><span>·</span><span className="link"><Icon name="chat" style={{ width: 11, height: 11 }} />{commentCount(e.commentCount)}</span></>}
                        </div>
                    </div>
                </div>
                {viewing && e.attachment && <MediaLightbox file={e.attachment} onClose={() => setViewing(false)} />}
                {opened && <EntryModal entryId={e.id} onClose={() => setOpened(false)} />}
            </>
        );
    }

    const names = (id: number) => people?.get(id)?.name;
    const { icon, text } = feedWords(item, names);
    const actor = item.actor ? personOf(item.actor) : null;
    return (
        <div className="feed-item">
            {actor && item.kind.startsWith("employee")
                ? <PersonAvatar person={actor} size={28} />
                : <span className="feed-ic"><Icon name={icon} /></span>}
            <div className="grow" style={{ minWidth: 0 }}>
                <div className="feed-text">{actor && <><PersonName person={actor} bold /> </>}{text}</div>
                <div className="feed-meta">
                    <span>{relTime(item.occurredAt)}</span>
                    {projectPath && <><span>·</span><span className="link" {...clickable(() => navigate(projectPath), "link")}>Open project</span></>}
                    {clientPath && <><span>·</span><span className="link" {...clickable(() => navigate(clientPath), "link")}>Open client</span></>}
                </div>
            </div>
        </div>
    );
}
