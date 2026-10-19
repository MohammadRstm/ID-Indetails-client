import { useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import { toast } from "@/shared/components/Feedback/toast";
import Field, { FieldError } from "@/shared/components/Forms/Field";
import { SearchInput, SwitchRow, Toggle } from "@/shared/components/Forms/Filters";
import Select from "@/shared/components/Forms/Select";
import Modal from "@/shared/components/Overlays/Modal";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { PictureSlot, Thumb } from "./WebsitePictures";
import {
    moved, PICTURE_TYPES, STATUS_LABEL, uploadPictures, TYPE_LABEL, useDeleteWebsiteProject, useGallery, useLinkCandidates, useSaveWebsiteProject, useWebsiteProjects,
    type LinkCandidate, type WebsiteProject, type WebsiteProjectBody, type WebsiteProjectType, type WebsiteStatus,
} from "./websiteApi";
import { missingToPublish, placeError, slugOf, splitPosition, yearError } from "./websiteRules";
import PlaceFields from "./WebsitePlaceFields";

type Linked = { id: number; title: string; domainCode: string; status: WebsiteStatus; year: number };

/** A website project's form, new or existing; an existing one has its gallery under it. Read-only without website:manage. */
export default function WebsiteProjectModal({ project, canManage, onClose }: { project: WebsiteProject | null; canManage: boolean; onClose: () => void }) {
    const save = useSaveWebsiteProject();
    const remove = useDeleteWebsiteProject();
    const errors = useFormErrors();
    const [saved, setSaved] = useState<WebsiteProject | null>(project);
    // the project as the list has it now: a gallery change shows here as soon as it is saved
    const listed = useWebsiteProjects().data?.projects.find((x) => x.id === saved?.id);
    const p = listed ?? saved;
    const [title, setTitle] = useState(p?.title ?? "");
    const [type, setType] = useState<WebsiteProjectType>(p?.type ?? "villa");
    const [status, setStatus] = useState<WebsiteStatus | "">(p?.status ?? "");
    const [year, setYear] = useState(p?.year != null ? String(p.year) : "");
    const [client, setClient] = useState(p?.client ?? "");
    const [city, setCity] = useState(p?.city ?? "");
    const [country, setCountry] = useState(p?.country ?? "");
    const [latitude, setLatitude] = useState(p?.latitude != null ? String(p.latitude) : "");
    const [longitude, setLongitude] = useState(p?.longitude != null ? String(p.longitude) : "");
    const [description, setDescription] = useState(p?.description ?? "");
    // the point was picked at random in the city: shown, and kept while the city stays the same
    const [approximate, setApproximate] = useState(p?.positionApproximate ?? false);
    const [linked, setLinked] = useState<Linked | null>(p?.linkedProject ? { ...p.linkedProject, status: p.linkedProject.status ?? "in_progress" } : null);
    const [thumbnail, setThumbnail] = useState<number | null>(p?.thumbnailFileId ?? null);
    const [hero, setHero] = useState<number | null>(p?.heroFileId ?? null);
    const [heroAlt, setHeroAlt] = useState(p?.heroAlt ?? "");
    const [published, setPublished] = useState(p?.published ?? false);
    const [confirming, setConfirming] = useState(false);
    const edit = canManage;

    const shownStatus = status || linked?.status || null;
    const shownYear = year.trim() ? Number(year) : linked?.year ?? null;
    const titleError = !title.trim() ? "Give the project a title."
        : title.trim().length > 150 ? "A title can be at most 150 characters."
            : !slugOf(title) && "The name needs at least one Latin letter or digit: the project's page address is made from it.";
    const statusError = !linked && !status && "Choose a status, or link a system project to follow its status.";
    const yearProblem = yearError(year, !!linked);
    const positionError = placeError(latitude, longitude);
    const missing = missingToPublish({ status: shownStatus, year: shownYear, city, country, latitude, longitude, description, thumbnail, hero });
    const publishError = published && missing.length > 0 && `To publish it, add ${missing.join(", ")}.`;

    function body(): WebsiteProjectBody {
        return {
            title: title.trim(), type, status: status || null, year: year.trim() ? Number(year) : null,
            client: client.trim() || null, city: city.trim() || null, country: country.trim() || null,
            latitude: latitude.trim() ? Number(latitude) : null, longitude: longitude.trim() ? Number(longitude) : null,
            description: description.trim() || null, projectId: linked?.id ?? null, thumbnailFileId: thumbnail, heroFileId: hero,
            heroAlt: heroAlt.trim() || null,
            published,
        };
    }

    function submit() {
        if (save.isPending) return;
        if (titleError || statusError || yearProblem || positionError || publishError) return errors.tried();
        save.mutate({ id: p?.id ?? null, body: body() }, {
            onSuccess: (result) => {
                const found = !city.trim() && result.city ? `${result.city}, ${result.country} found from the coordinates` : null;
                toast({ text: p ? "Project saved" : "Project added", sub: found ?? (result.published ? "It's on the website" : "Saved as a draft"), icon: "checkCircle" });
                // what the API worked out shows in the form: the city found, or the point picked in the city
                setCity(result.city ?? ""); setCountry(result.country ?? "");
                setLatitude(result.latitude != null ? String(result.latitude) : ""); setLongitude(result.longitude != null ? String(result.longitude) : "");
                setApproximate(result.positionApproximate);
                // a new project stays open, so its gallery can be filled
                if (p) onClose(); else setSaved(result);
            },
        });
    }

    function link(candidate: LinkCandidate) {
        setLinked({ id: candidate.id, title: candidate.title, domainCode: candidate.domainCode, status: candidate.status ?? "in_progress", year: candidate.year });
        // copied once, where nothing was written yet; status and year follow the project
        if (!title.trim()) setTitle(candidate.title);
        if (!description.trim() && candidate.description) setDescription(candidate.description);
        if (!client.trim() && candidate.client) setClient(candidate.client);
        setStatus("");
        setYear("");
    }

    const statusOptions = [
        ...(linked ? [{ value: "", label: `Follow the project (${STATUS_LABEL[linked.status]})` }] : [{ value: "", label: "Choose a status", disabled: true }]),
        { value: "in_progress", label: STATUS_LABEL.in_progress },
        { value: "completed", label: STATUS_LABEL.completed },
    ];

    return (
        <Modal title={p ? p.title : "New website project"} sub={p ? `/projects/${p.slug}` : "Everything here can be public: it shows on the company's website once published."}
            size="lg" onClose={onClose}
            foot={edit ? (
                <>
                    <div className="grow">
                        {save.error != null ? <span className="err"><Icon name="alert" />{errorMessage(save.error)}</span>
                            : remove.error != null ? <span className="err"><Icon name="alert" />{errorMessage(remove.error)}</span>
                                : p && confirming ? (
                                    <span className="row" style={{ gap: 6 }}>
                                        <span className="muted">Delete it from the website for good?</span>
                                        <button className="btn btn-sm btn-danger" disabled={remove.isPending}
                                            onClick={() => remove.mutate(p.id, { onSuccess: () => { toast({ text: "Project deleted", sub: p.title, icon: "trash" }); onClose(); } })}>Delete</button>
                                        <button className="btn btn-sm" onClick={() => setConfirming(false)}>Keep</button>
                                    </span>
                                ) : p ? <button className="btn btn-sm btn-quiet" onClick={() => setConfirming(true)}><Icon name="trash" />Delete</button> : null}
                    </div>
                    <button className="btn" onClick={onClose}>{p ? "Close" : "Cancel"}</button>
                    <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>{p ? "Save" : "Add project"}</button>
                </>
            ) : <button className="btn" onClick={onClose}>Close</button>}>
            {edit && <LinkPicker linked={linked} onLink={link} onUnlink={() => {
                // the values it followed become the project's own
                if (linked) { setStatus(status || linked.status); setYear(year || String(linked.year)); }
                setLinked(null);
            }} />}
            {!edit && linked && <div className="hint">Follows {linked.title}.</div>}

            <div className="grid g-2 mt">
                <Field id="wp-title" label="Title" required={edit} error={errors.show("title", titleError)}>
                    <input id="wp-title" className="input" value={title} disabled={!edit} onChange={(e) => setTitle(e.target.value)} onBlur={errors.touch("title")} />
                </Field>
                <Field id="wp-client" label="Client">
                    <input id="wp-client" className="input" value={client} disabled={!edit} placeholder="Optional - shown on the project's page" onChange={(e) => setClient(e.target.value)} />
                </Field>
            </div>
            <div className="grid g-3 mt">
                <Field id="wp-type" label="Type" required={edit}>
                    <Select id="wp-type" value={type} disabled={!edit} onChange={setType}
                        options={(Object.keys(TYPE_LABEL) as WebsiteProjectType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
                </Field>
                <Field id="wp-status" label="Status" required={edit && !linked} error={errors.show("status", statusError)}>
                    <Select id="wp-status" value={status} disabled={!edit} onChange={(v) => { setStatus(v as WebsiteStatus | ""); errors.touch("status")(); }} options={statusOptions} />
                </Field>
                <Field id="wp-year" label="Year" required={edit && !linked} error={errors.show("year", yearProblem)}
                    hint={linked && !year.trim() ? `Follows the project: ${linked.year}` : "The year it was finished, or will be."}>
                    <input id="wp-year" className="input" inputMode="numeric" value={year} disabled={!edit} placeholder={linked ? String(linked.year) : "e.g. 2024"}
                        onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} onBlur={errors.touch("year")} />
                </Field>
            </div>
            <div className="hint" style={{ marginTop: 4 }}>
                Page address: /projects/{slugOf(title) || "…"} (from the name; numbered if another project has the same name).
            </div>
            <div className="mt">
                <PlaceFields idPrefix="wp" country={country} city={city} disabled={!edit} cityOptional
                    onChange={(nextCountry, nextCity) => { setCountry(nextCountry); setCity(nextCity); }} onBlur={errors.touch("place")} />
            </div>
            <div className="grid g-2 mt">
                <Field id="wp-lat" label="Latitude" error={errors.show("position", positionError)}
                    hint={approximate ? `A point picked near ${city || `a town of ${country || "the country"}`}. Type the real coordinates for the exact spot.`
                        : "The exact spot, or leave it empty: a point is then picked near the city, or near a town of the country. Paste “33.8938, 35.5018” from a map into either box."}>
                    <input id="wp-lat" className="input" inputMode="decimal" value={latitude} disabled={!edit} placeholder="e.g. 33.8938"
                        onChange={(e) => { const both = splitPosition(e.target.value); if (both) { setLatitude(both[0]); setLongitude(both[1]); } else setLatitude(e.target.value); setApproximate(false); }}
                        onBlur={errors.touch("position")} />
                </Field>
                <Field id="wp-lng" label="Longitude">
                    <input id="wp-lng" className="input" inputMode="decimal" value={longitude} disabled={!edit} placeholder="e.g. 35.5018"
                        onChange={(e) => { const both = splitPosition(e.target.value); if (both) { setLatitude(both[0]); setLongitude(both[1]); } else setLongitude(e.target.value); setApproximate(false); }}
                        onBlur={errors.touch("position")} />
                </Field>
            </div>
            <Field id="wp-description" label="Description">
                <textarea id="wp-description" className="input" rows={4} maxLength={4000} value={description} disabled={!edit} onChange={(e) => setDescription(e.target.value)} />
            </Field>

            <div className="grid g-2 mt">
                <PictureSlot label="Card picture" hint="Tall, 4:5 (about 720 × 900). Only on the project's card: in the website's moving strip and its Projects grid."
                    fileId={thumbnail} ratio={4 / 5} canEdit={edit} onChange={setThumbnail} />
                <PictureSlot label="Page picture" hint="Wide, 16:9 (about 1920 × 1080). Only across the top of the project's own page, beside the globe."
                    fileId={hero} ratio={16 / 9} canEdit={edit} onChange={setHero} />
            </div>
            <Field id="wp-hero-alt" label="Page picture description" hint="Read out to people who can't see it, e.g. “The villa at dusk”.">
                <input id="wp-hero-alt" className="input" value={heroAlt} disabled={!edit} maxLength={200} onChange={(e) => setHeroAlt(e.target.value)} />
            </Field>

            <SwitchRow title="Published" style={{ marginTop: 14 }}
                description={published ? "It's on the website: the globe, the projects page and its own page." : "A draft: only people on this page see it."}
                control={<Toggle checked={published} disabled={!edit} label="Published" onChange={(on) => { setPublished(on); errors.touch("published")(); }} />} />
            <FieldError message={errors.show("published", publishError)} />

            {p && <Gallery project={p} canManage={edit} />}
            {!p && edit && <div className="hint mt">Gallery pictures are added once the project is saved.</div>}
        </Modal>
    );
}

/** Picks the system project a website project shows, from both businesses; its status and year then follow it. */
function LinkPicker({ linked, onLink, onUnlink }: { linked: Linked | null; onLink: (candidate: LinkCandidate) => void; onUnlink: () => void }) {
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState(false);
    const candidates = useLinkCandidates(search.trim(), open);
    if (linked) {
        return (
            <SwitchRow title={<>Shows {linked.title}</>}
                description={`A ${linked.domainCode === "execution" ? "site" : "Design"} project in the system. Its status and year follow it until you type your own.`}
                control={<button type="button" className="btn btn-sm" onClick={onUnlink}>Unlink</button>} />
        );
    }
    return (
        <div className="field">
            <div className="label">System project</div>
            {!open ? (
                <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}><Icon name="projects" />Link a system project</button>
                    <span className="hint" style={{ margin: 0 }}>Optional. Fills the form in, and keeps the status and year up to date.</span>
                </div>
            ) : (
                <>
                    <SearchInput value={search} onChange={setSearch} placeholder="Search projects of both businesses" autoFocus width="100%" aria-label="Search system projects" />
                    <div role="listbox" aria-label="System projects" style={{ display: "grid", gap: 4, marginTop: 6, maxHeight: 200, overflowY: "auto" }}>
                        {candidates.isLoading ? <span className="muted">Searching…</span>
                            : candidates.data?.length === 0 ? <span className="muted">No project matches.</span>
                                : candidates.data?.map((c) => (
                                    <button key={c.id} type="button" role="option" aria-selected={false} className="btn btn-sm" style={{ justifyContent: "flex-start" }}
                                        disabled={c.websiteProjectId != null} onClick={() => onLink(c)}>
                                        {c.title}<span className="muted">· {c.domainCode === "execution" ? "Execution" : "Design"} · {STATUS_LABEL[c.status ?? "in_progress"]} · {c.year}
                                            {c.websiteProjectId != null && " · already on the website"}</span>
                                    </button>
                                ))}
                    </div>
                </>
            )}
        </div>
    );
}

/** The project's gallery: pictures added, described, ordered and removed straight away. */
function Gallery({ project, canManage }: { project: WebsiteProject; canManage: boolean }) {
    const gallery = useGallery(project.id);
    const input = useRef<HTMLInputElement>(null);
    const [adding, setAdding] = useState(false);
    const [failed, setFailed] = useState<string>();
    const ids = project.gallery.map((i) => i.id);
    const error = failed ?? (gallery.order.error ?? gallery.remove.error ?? gallery.edit.error ? errorMessage(gallery.order.error ?? gallery.remove.error ?? gallery.edit.error) : undefined);

    async function add(files: File[]) {
        if (!files.length) return;
        setAdding(true);
        setFailed(undefined);
        try {
            for (const fileId of await uploadPictures(files)) await gallery.add.mutateAsync({ fileId, alt: project.title });
        } catch (e) {
            setFailed(errorMessage(e));
        } finally {
            setAdding(false);
        }
    }

    return (
        <div className="mt">
            <div className="row" style={{ justifyContent: "space-between" }}>
                <div style={{ fontWeight: 600 }}>Gallery <span className="muted num">{project.gallery.length}</span></div>
                {canManage && (
                    <>
                        <button type="button" className="btn btn-sm" disabled={adding} onClick={() => input.current?.click()}><Icon name="plus" />{adding ? "Adding…" : "Add pictures"}</button>
                        <input ref={input} type="file" accept={PICTURE_TYPES} multiple hidden aria-label="Gallery pictures"
                            onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; void add(files); }} />
                    </>
                )}
            </div>
            {project.gallery.length === 0 && <div className="muted mt-s">No gallery pictures yet. They show further down the project's own page; wide pictures (3:2) look best.</div>}
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                {project.gallery.map((image, index) => (
                    <GalleryRow key={image.id} image={image} index={index} count={ids.length} canManage={canManage}
                        onMove={(by) => gallery.order.mutate(moved(ids, image.id, by))}
                        onSave={(alt) => gallery.edit.mutate({ imageId: image.id, body: { alt } })}
                        onRemove={() => gallery.remove.mutate(image.id)} busy={gallery.order.isPending || gallery.remove.isPending} />
                ))}
            </div>
            <FieldError message={error} />
        </div>
    );
}

type GalleryRowProps = {
    image: WebsiteProject["gallery"][number];
    index: number;
    count: number;
    canManage: boolean;
    busy: boolean;
    onMove: (by: -1 | 1) => void;
    onSave: (alt: string) => void;
    onRemove: () => void;
};

function GalleryRow({ image, index, count, canManage, busy, onMove, onSave, onRemove }: GalleryRowProps) {
    const [alt, setAlt] = useState(image.alt);
    const errors = useFormErrors();
    const altError = !alt.trim() && "Describe the picture.";
    const changed = alt.trim() !== image.alt;

    return (
        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
            <Thumb fileId={image.fileId} width={96} ratio={3 / 2} alt={image.alt} />
            <div className="grow">
                <input className="input" aria-label={`Description of picture ${index + 1}`} value={alt} maxLength={200} disabled={!canManage}
                    onChange={(e) => setAlt(e.target.value)} onBlur={errors.touch("alt")} />
                <FieldError message={errors.show("alt", altError)} />
                {canManage && changed && (
                    <button type="button" className="btn btn-sm btn-primary mt-s" onClick={() => {
                        if (altError) return errors.tried();
                        onSave(alt.trim());
                    }}>Save picture</button>
                )}
            </div>
            {canManage && (
                <div className="row" style={{ gap: 4 }}>
                    <button type="button" className="icon-btn" aria-label={`Move picture ${index + 1} up`} disabled={busy || index === 0} onClick={() => onMove(-1)}><Icon name="arrowUp" /></button>
                    <button type="button" className="icon-btn" aria-label={`Move picture ${index + 1} down`} disabled={busy || index === count - 1} onClick={() => onMove(1)}><Icon name="arrowDown" /></button>
                    <button type="button" className="icon-btn" aria-label={`Remove picture ${index + 1}`} disabled={busy} onClick={onRemove}><Icon name="trash" /></button>
                </div>
            )}
        </div>
    );
}
