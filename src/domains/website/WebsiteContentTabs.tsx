import { useRef, useState, type ReactNode } from "react";
import { errorMessage } from "@/api/errors";
import { loadFailed } from "@/api/queryState";
import Panel from "@/shared/components/Data/Panel";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import { FieldError } from "@/shared/components/Forms/Field";
import { SwitchRow } from "@/shared/components/Forms/Filters";
import { useFormErrors } from "@/shared/hooks/useFormErrors";
import Icon from "@/shared/icons/Icon";
import { Thumb } from "./WebsitePictures";
import PlaceFields from "./WebsitePlaceFields";
import { moved, PICTURE_TYPES, uploadPictures, useSetContactEmail, useSetFavicon, useWebsiteContent, useWebsiteList, type ListKind, type WebsiteContent } from "./websiteApi";
import { linkError, placeError, splitPosition } from "./websiteRules";

/** The content once loaded; a skeleton, or what went wrong, until then. */
function WithContent({ children }: { children: (content: WebsiteContent) => ReactNode }) {
    const query = useWebsiteContent();
    if (query.data) return <>{children(query.data)}</>;
    return (
        <div className="panel"><div className="panel-body">
            {loadFailed(query) ? <LoadError error={query.error} retry={() => query.refetch()} what="the website's content" /> : <SkeletonLines lines={5} />}
        </div></div>
    );
}

type Problems = Record<string, string | false>;

type ListSpec<Row extends { id: number }, Body> = {
    kind: ListKind;
    /** What one row is called: "service", "office", "link". */
    noun: string;
    blank: Body;
    fromRow: (row: Row) => Body;
    /** The request body: trimmed, numbers as numbers. */
    clean: (body: Body) => object;
    problems: (body: Body) => Problems;
    view: (row: Row) => { title: ReactNode; text?: ReactNode };
    fields: (body: Body, set: (body: Body) => void, show: (field: string) => string | undefined, touch: (field: string) => () => void) => ReactNode;
};

/** One of the website's ordered lists, edited in place: add, change, remove (after asking) and move up or down. */
function OrderedList<Row extends { id: number }, Body>({ spec, rows, canManage }: { spec: ListSpec<Row, Body>; rows: Row[]; canManage: boolean }) {
    const list = useWebsiteList<object>(spec.kind);
    const [editing, setEditing] = useState<number | "new" | null>(null);
    const ids = rows.map((r) => r.id);
    return (
        <>
            {rows.length === 0 && editing !== "new" && <div className="muted">Nothing here yet.</div>}
            {rows.map((row, index) => editing === row.id
                ? <RowEditor key={row.id} spec={spec} initial={spec.fromRow(row)} save={(body, done) => list.update.mutate({ id: row.id, body }, { onSuccess: done })}
                    pending={list.update.isPending} error={list.update.error} onDone={() => setEditing(null)} />
                : <ListRow key={row.id} view={spec.view(row)} noun={spec.noun} canManage={canManage} first={index === 0} last={index === rows.length - 1}
                    busy={list.order.isPending || list.remove.isPending}
                    onEdit={() => { list.update.reset(); setEditing(row.id); }}
                    onMove={(by) => list.order.mutate(moved(ids, row.id, by))}
                    onRemove={(done) => list.remove.mutate(row.id, { onSettled: done })} />)}
            {editing === "new" && (
                <RowEditor spec={spec} initial={spec.blank} save={(body, done) => list.add.mutate(body, { onSuccess: done })}
                    pending={list.add.isPending} error={list.add.error} onDone={() => setEditing(null)} />
            )}
            {(list.order.error ?? list.remove.error) != null && <FieldError message={errorMessage(list.order.error ?? list.remove.error)} />}
            {canManage && editing !== "new" && (
                <button className="btn btn-sm mt-s" onClick={() => { list.add.reset(); setEditing("new"); }}><Icon name="plus" />Add {spec.noun}</button>
            )}
        </>
    );
}

type ListRowProps = {
    view: { title: ReactNode; text?: ReactNode };
    noun: string;
    canManage: boolean;
    first: boolean;
    last: boolean;
    busy: boolean;
    onEdit: () => void;
    onMove: (by: -1 | 1) => void;
    onRemove: (done: () => void) => void;
};

function ListRow({ view, noun, canManage, first, last, busy, onEdit, onMove, onRemove }: ListRowProps) {
    const [confirming, setConfirming] = useState(false);
    return (
        <div className="switch-row">
            <div className="grow">
                <div style={{ fontWeight: 600 }}>{view.title}</div>
                {view.text && <p style={{ whiteSpace: "pre-line" }}>{view.text}</p>}
            </div>
            {canManage && (confirming ? (
                <div className="row" style={{ gap: 6 }}>
                    <span className="muted" style={{ fontSize: 12 }}>Remove this {noun} from the website?</span>
                    <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => onRemove(() => setConfirming(false))}>Remove</button>
                    <button className="btn btn-sm" onClick={() => setConfirming(false)}>Keep</button>
                </div>
            ) : (
                <div className="row" style={{ gap: 4 }}>
                    <button className="icon-btn" aria-label={`Move ${noun} up`} disabled={busy || first} onClick={() => onMove(-1)}><Icon name="arrowUp" /></button>
                    <button className="icon-btn" aria-label={`Move ${noun} down`} disabled={busy || last} onClick={() => onMove(1)}><Icon name="arrowDown" /></button>
                    <button className="btn btn-sm btn-quiet" onClick={onEdit}>Edit</button>
                    <button className="btn btn-sm btn-quiet" onClick={() => setConfirming(true)}>Remove</button>
                </div>
            ))}
        </div>
    );
}

type RowEditorProps<Row extends { id: number }, Body> = {
    spec: ListSpec<Row, Body>;
    initial: Body;
    save: (body: object, done: () => void) => void;
    pending: boolean;
    error: unknown;
    onDone: () => void;
};

function RowEditor<Row extends { id: number }, Body>({ spec, initial, save, pending, error, onDone }: RowEditorProps<Row, Body>) {
    const [body, setBody] = useState(initial);
    const errors = useFormErrors();
    const problems = spec.problems(body);
    function submit() {
        if (pending) return;
        if (Object.values(problems).some(Boolean)) return errors.tried();
        save(spec.clean(body), () => { toast({ text: "Saved", sub: "It's on the website", icon: "checkCircle" }); onDone(); });
    }
    return (
        <div className="switch-row" style={{ alignItems: "flex-start" }}>
            <div className="grow" onKeyDown={(e) => { if (e.key === "Escape") onDone(); }}>
                {spec.fields(body, setBody, (field) => errors.show(field, problems[field]), errors.touch)}
                {error != null && <FieldError message={errorMessage(error)} />}
            </div>
            <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-sm btn-primary" disabled={pending} onClick={submit}>Save</button>
                <button className="btn btn-sm" onClick={onDone}>Cancel</button>
            </div>
        </div>
    );
}

/** A labelled input of a row editor, with its live error. */
function Input({ id, label, value, onChange, onBlur, error, placeholder, multiline, maxLength, optional }: {
    id: string; label: string; value: string; onChange: (v: string) => void; onBlur: () => void; error?: string; placeholder?: string; multiline?: boolean; maxLength?: number;
    /** Not required on its own (an office's place is its coordinates or its city). */
    optional?: boolean;
}) {
    return (
        <div className="field">
            <label className={optional ? "label" : "label required"} htmlFor={id}>{label}</label>
            {multiline
                ? <textarea id={id} className="input" rows={3} value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
                : <input id={id} className="input" value={value} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />}
            <FieldError message={error} />
        </div>
    );
}

const required = (value: string, message: string) => !value.trim() && message;
type ServiceBody = { title: string; description: string };
type LocationBody = { city: string; country: string; latitude: string; longitude: string; address: string; phone: string };
type LinkBody = { label: string; url: string };

const SERVICES: ListSpec<WebsiteContent["services"][number], ServiceBody> = {
    kind: "services",
    noun: "service",
    blank: { title: "", description: "" },
    fromRow: (s) => ({ title: s.title, description: s.description }),
    clean: (b) => ({ title: b.title.trim(), description: b.description.trim() }),
    problems: (b) => ({ title: required(b.title, "Name the service."), description: required(b.description, "Describe the service.") }),
    view: (s) => ({ title: s.title, text: s.description }),
    fields: (b, set, show, touch) => (
        <>
            <Input id="ws-title" label="Service" value={b.title} maxLength={120} placeholder="e.g. Interior design" onChange={(title) => set({ ...b, title })} onBlur={touch("title")} error={show("title")} />
            <Input id="ws-description" label="Description" value={b.description} maxLength={1000} multiline onChange={(description) => set({ ...b, description })} onBlur={touch("description")} error={show("description")} />
        </>
    ),
};

/** A position typed or pasted: "33.8938, 35.5018" fills both boxes. */
function positionInput(b: LocationBody, which: "latitude" | "longitude", value: string): LocationBody {
    const both = splitPosition(value);
    return both ? { ...b, latitude: both[0], longitude: both[1] } : { ...b, [which]: value };
}

const LOCATIONS: ListSpec<WebsiteContent["locations"][number], LocationBody> = {
    kind: "locations",
    noun: "office",
    blank: { city: "", country: "", latitude: "", longitude: "", address: "", phone: "" },
    // a point picked in the city goes back unchanged, so it stays while the city does
    fromRow: (l) => ({ city: l.city, country: l.country, latitude: String(l.latitude), longitude: String(l.longitude), address: l.address, phone: l.phone }),
    clean: (b) => ({
        city: b.city.trim() || null, country: b.country.trim() || null, address: b.address.trim(), phone: b.phone.trim(),
        latitude: b.latitude.trim() ? Number(b.latitude) : null, longitude: b.longitude.trim() ? Number(b.longitude) : null,
    }),
    problems: (b) => ({
        place: !b.latitude.trim() && !b.longitude.trim() && (!b.city.trim() || !b.country.trim()) && "Choose the office's country and city, or type its coordinates.",
        position: placeError(b.latitude, b.longitude),
        address: required(b.address, "Enter the address."),
        phone: required(b.phone, "Enter the phone number."),
    }),
    view: (l) => ({
        title: `${l.city}, ${l.country}`,
        text: `${l.address}\n${l.phone} · ${l.positionApproximate ? `a point picked in ${l.city}` : `${l.latitude}, ${l.longitude}`}`,
    }),
    fields: (b, set, show, touch) => (
        <>
            <div className="hint" style={{ marginTop: 0 }}>Choose the country and city, or type the exact coordinates: the city is then found from them.</div>
            <PlaceFields idPrefix="wl" country={b.country} city={b.city} cityOptional={false} cityError={show("place")}
                onChange={(country, city) => set({ ...b, country, city })} onBlur={touch("place")} />
            <div className="grid g-2">
                <Input id="wl-lat" label="Latitude" optional value={b.latitude} placeholder="e.g. 33.8938" onChange={(v) => set(positionInput(b, "latitude", v))} onBlur={touch("position")} error={show("position")} />
                <Input id="wl-lng" label="Longitude" optional value={b.longitude} placeholder="e.g. 35.5018" onChange={(v) => set(positionInput(b, "longitude", v))} onBlur={touch("position")} />
            </div>
            <Input id="wl-address" label="Address" value={b.address} maxLength={300} onChange={(address) => set({ ...b, address })} onBlur={touch("address")} error={show("address")} />
            <Input id="wl-phone" label="Phone" value={b.phone} maxLength={50} placeholder="e.g. +961 1 234 567" onChange={(phone) => set({ ...b, phone })} onBlur={touch("phone")} error={show("phone")} />
        </>
    ),
};

const LINKS: ListSpec<WebsiteContent["socialLinks"][number], LinkBody> = {
    kind: "social-links",
    noun: "link",
    blank: { label: "", url: "" },
    fromRow: (l) => ({ label: l.label, url: l.url }),
    clean: (b) => ({ label: b.label.trim(), url: b.url.trim() }),
    problems: (b) => ({ label: required(b.label, "Name the link, e.g. Instagram."), url: linkError(b.url) }),
    view: (l) => ({ title: l.label, text: l.url }),
    fields: (b, set, show, touch) => (
        <div className="grid g-2">
            <Input id="wk-label" label="Name" value={b.label} maxLength={50} placeholder="e.g. Instagram" onChange={(label) => set({ ...b, label })} onBlur={touch("label")} error={show("label")} />
            <Input id="wk-url" label="Link" value={b.url} maxLength={500} placeholder="https://instagram.com/…" onChange={(url) => set({ ...b, url })} onBlur={touch("url")} error={show("url")} />
        </div>
    ),
};

/** What the company offers: title and description, in the website's order. */
export function ServicesTab() {
    return (
        <WithContent>{(c) => (
            <Panel title="Services" sub="What the company does, listed on the website in this order.">
                <OrderedList spec={SERVICES} rows={c.services} canManage={c.canManage} />
            </Panel>
        )}</WithContent>
    );
}

/** The company's offices: points on the website's globe, and addresses and maps on its contact page. */
export function LocationsTab() {
    return (
        <WithContent>{(c) => (
            <Panel title="Locations" sub="The company's offices: shown on the website's globe and its contact page, with a map.">
                <OrderedList spec={LOCATIONS} rows={c.locations} canManage={c.canManage} />
            </Panel>
        )}</WithContent>
    );
}

/** The company email the website shows and its contact form sends to, and the footer's social links. */
export function ContactTab() {
    return (
        <WithContent>{(c) => (
            <>
                <ContactEmail content={c} />
                <Panel className="mt" title="Social links" sub="Shown in the website's footer, in this order.">
                    <OrderedList spec={LINKS} rows={c.socialLinks} canManage={c.canManage} />
                </Panel>
            </>
        )}</WithContent>
    );
}

function ContactEmail({ content }: { content: WebsiteContent }) {
    const save = useSetContactEmail();
    const errors = useFormErrors();
    const [email, setEmail] = useState(content.contactEmail ?? "");
    const changed = email.trim() !== (content.contactEmail ?? "");
    const problem = email.trim() && !/^[^\s@?%,;<>]+@[^\s@?%,;<>]+\.[^\s@?%,;<>]+$/.test(email.trim()) && "Enter an email like hello@company.com.";

    function submit() {
        if (save.isPending || !changed) return;
        if (problem) return errors.tried();
        save.mutate(email.trim(), { onSuccess: () => toast({ text: "Contact email saved", sub: email.trim() || "The website shows none now", icon: "checkCircle" }) });
    }

    return (
        <Panel title="Contact email" sub="Shown on the website's contact page. Messages from its contact form are emailed here. It's the company's email in Settings too.">
            <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                <div className="field grow">
                    <input className="input" type="email" aria-label="Contact email" placeholder="hello@company.com" value={email} disabled={!content.canManage}
                        onChange={(e) => setEmail(e.target.value)} onBlur={errors.touch("email")} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
                    {errors.show("email", problem) ? <FieldError message={errors.show("email", problem)} />
                        : save.error != null ? <FieldError message={errorMessage(save.error)} />
                            : !content.contactEmail && <div className="hint">Until one is set, the website's contact form can't send.</div>}
                </div>
                {content.canManage && changed && (
                    <>
                        <button className="btn btn-sm btn-primary" disabled={save.isPending} onClick={submit}>Save</button>
                        <button className="btn btn-sm" onClick={() => setEmail(content.contactEmail ?? "")}>Cancel</button>
                    </>
                )}
            </div>
        </Panel>
    );
}

/** The website's favicon: a small square picture in the browser tab. */
export function SiteTab() {
    return <WithContent>{(c) => <Favicon content={c} />}</WithContent>;
}

function Favicon({ content }: { content: WebsiteContent }) {
    const set = useSetFavicon();
    const input = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [failed, setFailed] = useState<string>();

    async function pick(file: File | undefined) {
        if (!file) return;
        setUploading(true);
        setFailed(undefined);
        try {
            await set.mutateAsync((await uploadPictures([file]))[0]);
            toast({ text: "Favicon updated", sub: "Browsers may show the old one for a while", icon: "checkCircle" });
        } catch (e) {
            setFailed(errorMessage(e));
        } finally {
            setUploading(false);
        }
    }

    return (
        <Panel title="Site">
            <SwitchRow title="Favicon" description="The small picture in the browser tab. A square PNG of at least 64 × 64 works best. Without one, the website keeps its own."
                control={
                    <div className="row" style={{ gap: 8 }}>
                        <Thumb fileId={content.faviconFileId} width={32} ratio={1} alt="Favicon" />
                        {content.canManage && (
                            <>
                                <button className="btn btn-sm" disabled={uploading} onClick={() => input.current?.click()}>{uploading ? "Uploading…" : content.faviconFileId == null ? "Choose" : "Replace"}</button>
                                {content.faviconFileId != null && (
                                    <button className="btn btn-sm btn-quiet" disabled={set.isPending}
                                        onClick={() => set.mutate(null, { onSuccess: () => toast({ text: "Favicon removed", icon: "checkCircle" }) })}>Remove</button>
                                )}
                                <input ref={input} type="file" accept={PICTURE_TYPES} hidden aria-label="Favicon file"
                                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pick(f); }} />
                            </>
                        )}
                    </div>
                } />
            <FieldError message={failed ?? (set.error != null ? errorMessage(set.error) : undefined)} />
        </Panel>
    );
}
