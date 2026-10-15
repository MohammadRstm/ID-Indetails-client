import { useRef, useState, type ChangeEvent } from "react";
import { z } from "zod";
import { errorMessage } from "@/api/errors";
import Panel from "@/shared/components/Data/Panel";
import { toast } from "@/shared/components/Feedback/toast";
import Field, { FieldError } from "@/shared/components/Forms/Field";
import { useForm } from "@/shared/components/Forms/useForm";
import Modal from "@/shared/components/Overlays/Modal";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import {
    HERO_EXTENSIONS, MAX_HEROES, SUMMARY_MAX, useAddHero, useOrderHeroes, useRemoveHero, useSetSummary,
    type PortalContent, type PortalContentItem, type PortalHero,
} from "./contentApi";
import { useUploads } from "./useUploads";

const accept = HERO_EXTENSIONS.map((e) => `.${e}`).join(",");

type Props = {
    projectId: number;
    content: PortalContent;
    /** A hero picture wouldn't load (its link may have expired): the drafts are loaded again. */
    onImageFailed: (fileId: number) => void;
};

/**
 * The top of the Presentation part: the hero images at the top of the client's page (added from the client's images or
 * uploaded, put in order, removed; up to 12), and the introduction. Both are drafts like the client's files, and say
 * so when they differ from what clients see. Only client_portal:manage changes them (the content's canEdit); anyone
 * else reads them.
 */
export default function PresentationIntro({ projectId, content, onImageFailed }: Props) {
    return (
        <div className="pc-top">
            <HeroPanel projectId={projectId} content={content} onImageFailed={onImageFailed} />
            <IntroPanel projectId={projectId} content={content} />
        </div>
    );
}

function Changed() {
    return <div className="pc-changed"><Icon name="info" />Changed since last publish</div>;
}

// ---- the hero images ----

function HeroPanel({ projectId, content, onImageFailed }: Props) {
    const { heroes, canEdit, storageReady, changes } = content;
    const uploads = useUploads(projectId);
    const remove = useRemoveHero(projectId);
    const order = useOrderHeroes(projectId);
    const chooser = useRef<HTMLInputElement>(null);
    const [picking, setPicking] = useState(false);
    // a link that fails is replaced once; if the new one fails too, the picture's place stays empty
    const [broken, setBroken] = useState<number[]>([]);
    const retried = useRef(new Set<number>());
    // what a screen reader is told after a move
    const [said, setSaid] = useState("");
    const heroFiles = heroes.map((hero) => hero.fileId);
    const pictures = content.items.filter((item) => item.canBeHero && item.state !== "removed");
    const full = heroes.length >= MAX_HEROES;
    const busy = remove.isPending || order.isPending;

    function failed(fileId: number) {
        if (retried.current.has(fileId)) return setBroken((list) => [...list, fileId]);
        retried.current.add(fileId);
        onImageFailed(fileId);
    }

    function chosen(e: ChangeEvent<HTMLInputElement>) {
        const [file] = Array.from(e.target.files ?? []);
        if (file) uploads.addHero(file);
        // the same file can be chosen again
        e.target.value = "";
    }

    async function move(hero: PortalHero, from: number, to: number) {
        const fileIds = [...heroFiles];
        fileIds.splice(from, 1);
        fileIds.splice(to, 0, hero.fileId);
        try {
            await order.mutateAsync(fileIds);
            setSaid(`${hero.name} is now ${to + 1} of ${fileIds.length}.`);
        } catch (error) {
            toast({ text: "The hero images' order wasn't saved", sub: errorMessage(error), icon: "alert" });
        }
    }

    async function drop(hero: PortalHero) {
        try {
            await remove.mutateAsync(hero.fileId);
            toast({ text: "Hero image removed", sub: hero.name, icon: "trash" });
        } catch (error) {
            toast({ text: "The hero image wasn't removed", sub: errorMessage(error), icon: "alert" });
        }
    }

    return (
        <Panel title="Hero images" sub={`The pictures at the top of what clients see: the first is the big one. Up to ${MAX_HEROES}.`}
            tools={canEdit && (
                <>
                    {storageReady && (
                        <>
                            <button type="button" className="btn btn-sm" disabled={full} onClick={() => chooser.current?.click()}><Icon name="upload" />Upload hero image</button>
                            <input ref={chooser} type="file" hidden accept={accept} aria-label="Hero image to upload" onChange={chosen} />
                        </>
                    )}
                    <button type="button" className="btn btn-sm" disabled={full || pictures.every((item) => heroFiles.includes(item.file.id))}
                        onClick={() => setPicking(true)}><Icon name="grid" />Choose from images</button>
                </>
            )}>
            {heroes.length === 0 ? (
                <div className="pc-hero-empty pc-heroes-empty"><Icon name="file" /><span>No hero image yet</span></div>
            ) : (
                <ol className="pc-heroes" aria-label="Hero images">
                    {heroes.map((hero, i) => (
                        <li key={hero.fileId} className="pc-hero-row">
                            <span className="pc-hero-thumb">
                                {hero.url && !broken.includes(hero.fileId)
                                    ? <img src={hero.url} alt="" onError={() => failed(hero.fileId)} />
                                    : <Icon name="file" />}
                            </span>
                            <span className="pc-hero-name">
                                <span className="trunc" title={hero.name}>{hero.name}</span>
                                <span className="pc-hero-place">{i === 0 ? "First: the big one" : `${i + 1} of ${heroes.length}`}</span>
                            </span>
                            {canEdit && (
                                <span className="pc-hero-tools">
                                    <button type="button" className="icon-btn" aria-label={`Move ${hero.name} earlier`} disabled={busy || i === 0}
                                        onClick={() => void move(hero, i, i - 1)}><Icon name="arrowUp" /></button>
                                    <button type="button" className="icon-btn" aria-label={`Move ${hero.name} later`} disabled={busy || i === heroes.length - 1}
                                        onClick={() => void move(hero, i, i + 1)}><Icon name="arrowDown" /></button>
                                    <button type="button" className="icon-btn" aria-label={`Remove ${hero.name}`} disabled={busy}
                                        onClick={() => void drop(hero)}><Icon name="trash" /></button>
                                </span>
                            )}
                        </li>
                    ))}
                </ol>
            )}
            {canEdit && full && <div className="hint pc-heroes-full">That's the most there can be. Remove one to add another.</div>}
            <div className="sr" aria-live="polite">{said}</div>
            {changes.heroChanged && <Changed />}
            {picking && <HeroPicker projectId={projectId} pictures={pictures} heroFiles={heroFiles} onClose={() => setPicking(false)} />}
        </Panel>
    );
}

type PickerProps = { projectId: number; pictures: PortalContentItem[]; heroFiles: number[]; onClose: () => void };

/** The images chosen for the client that can be a hero image, to add one from. Those that are one already say so. */
function HeroPicker({ projectId, pictures, heroFiles, onClose }: PickerProps) {
    const add = useAddHero(projectId);

    async function choose(item: PortalContentItem) {
        try {
            await add.mutateAsync(item.id);
            toast({ text: "Hero image added", sub: item.title, icon: "checkCircle" });
            onClose();
        } catch {
            // the answer is shown in the window
        }
    }

    return (
        <Modal title="Add a hero image" sub="Any JPG, PNG or WebP image chosen for the client. It goes after the others." size="md" onClose={onClose}
            foot={
                <>
                    <div className="grow">{add.error ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(add.error)}</span> : null}</div>
                    <button type="button" className="btn" onClick={onClose}>Cancel</button>
                </>
            }>
            <div className="pc-picks">
                {pictures.map((item) => {
                    const already = heroFiles.includes(item.file.id);
                    return (
                        <button key={item.id} type="button" className={cx("pc-pick", already && "on")} disabled={add.isPending || already} onClick={() => void choose(item)}>
                            <span className="pc-pick-img">{item.previewUrl ? <img src={item.previewUrl} alt="" loading="lazy" /> : <Icon name="file" />}</span>
                            <span className="pc-pick-name trunc">{item.title}</span>
                            {already && <span className="pc-pick-now">A hero image</span>}
                        </button>
                    );
                })}
            </div>
        </Modal>
    );
}

// ---- the introduction ----

const schema = z.object({ summary: z.string().max(SUMMARY_MAX, `Use at most ${SUMMARY_MAX} characters.`) });

function IntroPanel({ projectId, content }: { projectId: number; content: PortalContent }) {
    const saved = content.summary ?? "";
    return (
        <Panel title="Introduction" sub="A few words clients read at the top of their page. Plain text.">
            {content.canEdit
                // starts again from what is saved when that changes (here or from someone else)
                ? <IntroForm key={saved} projectId={projectId} saved={saved} />
                : saved ? <p className="pc-summary-text">{saved}</p> : <p className="muted">No introduction.</p>}
            {content.changes.summaryChanged && <Changed />}
        </Panel>
    );
}

function IntroForm({ projectId, saved }: { projectId: number; saved: string }) {
    const save = useSetSummary(projectId);
    const form = useForm({ summary: saved }, schema);
    // checked as it is typed, not only when Save is pressed
    const rule = schema.safeParse(form.values);
    const error = form.errors.summary ?? (rule.success ? undefined : rule.error.issues[0].message);
    const text = form.values.summary;
    const dirty = text !== saved;

    async function submit() {
        if (save.isPending || !dirty || !form.validate()) return;
        const trimmed = text.trim();
        try {
            await save.mutateAsync(trimmed || null);
            form.set("summary", trimmed);
            toast({ text: "Introduction saved", icon: "checkCircle" });
        } catch (failure) {
            form.fail(failure);
        }
    }

    return (
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
            <Field id="pc-summary" label="Introduction for the client" error={error}>
                <textarea id="pc-summary" className="textarea" rows={5} value={text} aria-describedby="pc-summary-count"
                    onChange={(e) => form.set("summary", e.target.value)} />
            </Field>
            <FieldError message={form.errors.form} />
            <div className="pc-intro-foot">
                <span id="pc-summary-count" className={cx("pc-count", text.length > SUMMARY_MAX && "over")}>{text.length} / {SUMMARY_MAX}</span>
                <span className="grow" />
                {dirty && <button type="button" className="btn btn-sm btn-quiet" onClick={() => form.set("summary", saved)}>Cancel</button>}
                <button type="submit" className="btn btn-sm btn-primary" disabled={!dirty || save.isPending}>Save</button>
            </div>
        </form>
    );
}
