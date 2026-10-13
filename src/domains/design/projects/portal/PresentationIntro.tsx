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
import { HERO_EXTENSIONS, SUMMARY_MAX, useClearHero, useSetHero, useSetSummary, type PortalContent, type PortalContentItem } from "./contentApi";
import { useUploads } from "./useUploads";

const accept = HERO_EXTENSIONS.map((e) => `.${e}`).join(",");

type Props = {
    projectId: number;
    content: PortalContent;
    /** The hero picture wouldn't load (its link may have expired): the drafts are loaded again. */
    onImageFailed: (fileId: number) => void;
};

/**
 * The top of the Presentation part: the hero image across the top of the client's page, and the introduction under
 * it. Both are drafts like the files, and say so when they differ from what clients see.
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

// ---- the hero image ----

function HeroPanel({ projectId, content, onImageFailed }: Props) {
    const { hero, canEdit, storageReady, changes } = content;
    const uploads = useUploads(projectId);
    const clear = useClearHero(projectId);
    const chooser = useRef<HTMLInputElement>(null);
    const [picking, setPicking] = useState(false);
    // a link that fails is replaced once; if the new one fails too, the empty picture is shown
    const [brokenFile, setBrokenFile] = useState<number | null>(null);
    const retried = useRef<number | null>(null);
    const pictures = content.items.filter((item) => item.canBeHero && item.state !== "removed");
    const src = hero?.url && brokenFile !== hero.fileId ? hero.url : null;

    function failed() {
        if (!hero) return;
        if (retried.current === hero.fileId) return setBrokenFile(hero.fileId);
        retried.current = hero.fileId;
        onImageFailed(hero.fileId);
    }

    function chosen(e: ChangeEvent<HTMLInputElement>) {
        const [file] = Array.from(e.target.files ?? []);
        if (file) uploads.addHero(file);
        // the same file can be chosen again
        e.target.value = "";
    }

    async function remove() {
        try {
            await clear.mutateAsync();
            toast({ text: "Hero image removed", icon: "trash" });
        } catch (error) {
            toast({ text: "The hero image wasn't removed", sub: errorMessage(error), icon: "alert" });
        }
    }

    return (
        <Panel title="Hero image" sub="The picture across the top of what clients see."
            tools={canEdit && (
                <>
                    {storageReady && (
                        <>
                            <button type="button" className="btn btn-sm" onClick={() => chooser.current?.click()}><Icon name="upload" />Upload hero image</button>
                            <input ref={chooser} type="file" hidden accept={accept} aria-label="Hero image to upload" onChange={chosen} />
                        </>
                    )}
                    <button type="button" className="btn btn-sm" disabled={pictures.length === 0} onClick={() => setPicking(true)}><Icon name="grid" />Choose from images</button>
                    {hero && <button type="button" className="btn btn-sm btn-quiet" disabled={clear.isPending} onClick={() => void remove()}><Icon name="trash" />Remove hero</button>}
                </>
            )}>
            <div className="pc-hero">
                {src ? <img className="pc-hero-img" src={src} alt="Hero image" onError={failed} />
                    : <div className="pc-hero-empty"><Icon name="file" /><span>{hero ? hero.name : "No hero image yet"}</span></div>}
            </div>
            {changes.heroChanged && <Changed />}
            {picking && <HeroPicker projectId={projectId} pictures={pictures} onClose={() => setPicking(false)} />}
        </Panel>
    );
}

/** The images of the drafts that can be the hero, to pick one from. */
function HeroPicker({ projectId, pictures, onClose }: { projectId: number; pictures: PortalContentItem[]; onClose: () => void }) {
    const setHero = useSetHero(projectId);

    async function choose(item: PortalContentItem) {
        try {
            await setHero.mutateAsync(item.id);
            toast({ text: "Hero image set", sub: item.title, icon: "checkCircle" });
            onClose();
        } catch {
            // the answer is shown in the window
        }
    }

    return (
        <Modal title="Choose the hero image" sub="Any JPG, PNG or WebP image in the drafts." size="md" onClose={onClose}
            foot={
                <>
                    <div className="grow">{setHero.error ? <span className="err" role="alert"><Icon name="alert" />{errorMessage(setHero.error)}</span> : null}</div>
                    <button type="button" className="btn" onClick={onClose}>Cancel</button>
                </>
            }>
            <div className="pc-picks">
                {pictures.map((item) => (
                    <button key={item.id} type="button" className={cx("pc-pick", item.isHero && "on")} disabled={setHero.isPending} onClick={() => void choose(item)}>
                        <span className="pc-pick-img">{item.previewUrl ? <img src={item.previewUrl} alt="" loading="lazy" /> : <Icon name="file" />}</span>
                        <span className="pc-pick-name trunc">{item.title}</span>
                        {item.isHero && <span className="pc-pick-now">Current hero</span>}
                    </button>
                ))}
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
