import { useState, type MouseEvent } from "react";
import { errorMessage } from "@/api/errors";
import { http } from "@/api/http";
import { keys, useInvalidate } from "@/api/keys";
import LoadError from "@/shared/components/Feedback/LoadError";
import { SkeletonLines } from "@/shared/components/Feedback/Skeleton";
import { toast } from "@/shared/components/Feedback/toast";
import ContextMenu from "@/shared/components/Overlays/ContextMenu";
import Modal from "@/shared/components/Overlays/Modal";
import { inkOn } from "@/shared/format/color";
import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { useProjectColors, useSwapProjectColor, type Project, type ProjectColor } from "./projectsApi";

type ProjectColorPickerProps = {
    project: Pick<Project, "id" | "title" | "domain">;
    /** The colour the form holds now. */
    value: string;
    /** A free colour picked: the form saves it with the rest. */
    onPick: (hex: string) => void;
    onClose: () => void;
};

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The thirty colours in a grid. Those another active or on-hold project of the business has are faded: clicking one
 * offers to swap colours with that project, which happens at once. The free ones are picked for the form.
 */
export default function ProjectColorPicker({ project, value, onPick, onClose }: ProjectColorPickerProps) {
    const colors = useProjectColors(project.domain);
    const swap = useSwapProjectColor(project.id);
    const invalidate = useInvalidate();
    const [menu, setMenu] = useState<{ color: ProjectColor; x: number; y: number } | null>(null);

    function choose(color: ProjectColor, ev: MouseEvent<HTMLButtonElement>) {
        const holder = color.takenBy;
        if (!holder || holder.id === project.id) {
            onPick(color.hex);
            return;
        }
        const r = ev.currentTarget.getBoundingClientRect();
        setMenu({ color, x: r.left, y: r.bottom + 4 });
    }

    function swapWith(color: ProjectColor) {
        const holder = color.takenBy!;
        setMenu(null);
        swap.mutate(holder.id, {
            onSuccess: (saved) => {
                // swapping again puts both back; it runs after this window has closed
                const back = () => void http.post(`/projects/${project.id}/swap-color`, { otherProjectId: holder.id })
                    .then(() => invalidate(keys.projects.all, keys.activity.all))
                    .catch((e: unknown) => toast({ text: "The colours weren't swapped back", sub: errorMessage(e), icon: "alert" }));
                toast({
                    text: `Colours swapped with ${holder.title}`, sub: `${project.title} is ${color.name.toLowerCase()} now`, icon: "checkCircle",
                    actionLabel: "Undo", action: back,
                });
                onPick(saved.tint ?? color.hex);
            },
            onError: (e) => toast({ text: "The colours weren't swapped", sub: errorMessage(e), icon: "alert" }),
        });
    }

    return (
        <Modal title="Project colour" sub="The faded colours belong to another open project: pick one to swap colours with it." size="md" onClose={onClose}
            foot={<><div className="grow" /><button type="button" className="btn" onClick={onClose}>Close</button></>}>
            {colors.isError ? <LoadError error={colors.error} retry={() => colors.refetch()} what="the colours" />
                : !colors.data ? <SkeletonLines lines={4} />
                    : (
                        <div className="color-grid" role="list">
                            {colors.data.map((c) => {
                                const mine = same(c.hex, value);
                                const taken = c.takenBy != null && c.takenBy.id !== project.id;
                                const label = `${c.name}${mine ? ", the project's colour" : taken ? `, taken by ${c.takenBy!.title}` : ""}`;
                                return (
                                    <div role="listitem" key={c.hex}>
                                        <button type="button" className={cx("color-swatch", mine && "on", taken && "taken")} style={{ background: c.hex, color: inkOn(c.hex) }}
                                            aria-label={label} title={label} disabled={swap.isPending} onClick={(ev) => choose(c, ev)}>
                                            {mine && <Icon name="check" />}
                                        </button>
                                        <div className="color-name">{c.name}</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
            {menu && (
                <ContextMenu x={menu.x} y={menu.y} label="Taken colour" onClose={() => setMenu(null)}>
                    <button type="button" role="menuitem" className="pop-item" onClick={() => swapWith(menu.color)}>
                        <Icon name="refresh" />Swap colours with {menu.color.takenBy!.title}
                    </button>
                </ContextMenu>
            )}
        </Modal>
    );
}
