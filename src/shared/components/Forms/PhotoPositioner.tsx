import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import Modal from "@/shared/components/Overlays/Modal";
import {
    centered, clampPlacement, cropToSquare, MAX_ZOOM, MIN_ZOOM, openPicture, shownSize, sourceSquare, zoomTo, type Placement,
} from "@/shared/files/squareCrop";
import Icon from "@/shared/icons/Icon";

/** The window the picture is placed in, and the finished square: both in pixels. */
const SIDE = 240;
const EDGE = 480;
/** How far an arrow key moves the picture (a held Shift moves it four times as far). */
const NUDGE = 8;
const ARROWS = new Map<string, [number, number]>([["ArrowLeft", [-1, 0]], ["ArrowRight", [1, 0]], ["ArrowUp", [0, -1]], ["ArrowDown", [0, 1]]]);

type Drag = { id: number; fromX: number; fromY: number; x: number; y: number };

/**
 * A picked photo placed by hand before it is used as someone's picture: drag it (or use the arrow keys) and zoom until
 * the face sits in the circle, then it is cut to that square. A photo the browser can't open to place (HEIC) goes up as
 * it is, as before.
 */
export default function PhotoPositioner({ file, onDone, onCancel }: { file: File; onDone: (picture: File) => void; onCancel: () => void }) {
    const [opened, setOpened] = useState<{ bitmap: ImageBitmap; url: string } | null>(null);
    const [place, setPlace] = useState<Placement>({ zoom: MIN_ZOOM, x: 0, y: 0 });
    const [saving, setSaving] = useState(false);
    const drag = useRef<Drag | null>(null);
    const sendAsPicked = useEffectEvent((picture: File) => onDone(picture));

    useEffect(() => {
        let alive = true;
        let bitmap: ImageBitmap | null = null;
        let url: string | null = null;
        void openPicture(file).then((picture) => {
            if (!alive) {
                picture?.close();
                return;
            }
            if (!picture) {
                sendAsPicked(file);
                return;
            }
            bitmap = picture;
            url = URL.createObjectURL(file);
            setPlace(centered(picture, SIDE));
            setOpened({ bitmap: picture, url });
        });
        return () => {
            alive = false;
            bitmap?.close();
            if (url) URL.revokeObjectURL(url);
        };
    }, [file]);

    if (!opened) return null;
    const { bitmap, url } = opened;
    const shown = shownSize(bitmap, SIDE, place.zoom);
    const move = (x: number, y: number) => setPlace((p) => clampPlacement({ ...p, x, y }, bitmap, SIDE));

    const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
        const arrow = ARROWS.get(e.key);
        if (!arrow) return;
        e.preventDefault();
        const step = e.shiftKey ? NUDGE * 4 : NUDGE;
        move(place.x + arrow[0] * step, place.y + arrow[1] * step);
    };
    const onPointerDown = (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return;
        drag.current = { id: e.pointerId, fromX: e.clientX, fromY: e.clientY, x: place.x, y: place.y };
        e.currentTarget.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent<HTMLElement>) => {
        const d = drag.current;
        if (d && d.id === e.pointerId) move(d.x + e.clientX - d.fromX, d.y + e.clientY - d.fromY);
    };
    const onPointerEnd = () => {
        drag.current = null;
    };

    async function use() {
        if (saving) return;
        setSaving(true);
        // a browser that can't write the square sends the photo as it was picked
        onDone((await cropToSquare(bitmap, sourceSquare(place, bitmap, SIDE), EDGE)) ?? file);
    }

    return (
        <Modal
            title="Position your photo"
            sub="Drag the picture until it sits in the circle the way you want it."
            size="md"
            onClose={onCancel}
            foot={
                <>
                    <div className="grow" />
                    <button type="button" className="btn" onClick={onCancel}>Cancel</button>
                    <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void use()}><Icon name="check" />Use this photo</button>
                </>
            }
        >
            <div className="photo-pos">
                <div
                    className="photo-pos-view"
                    role="group"
                    tabIndex={0}
                    aria-label="Photo position: drag to move it, or use the arrow keys"
                    onKeyDown={onKeyDown}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerEnd}
                    onPointerCancel={onPointerEnd}
                >
                    <img src={url} alt="" draggable={false} style={{ width: shown.width, height: shown.height, transform: `translate(${place.x}px, ${place.y}px)` }} />
                    <div className="photo-pos-mask" aria-hidden="true" />
                </div>
                <div className="photo-pos-tools">
                    <label className="label" htmlFor="photo-pos-zoom">Zoom</label>
                    <input
                        id="photo-pos-zoom"
                        type="range"
                        min={MIN_ZOOM}
                        max={MAX_ZOOM}
                        step={0.01}
                        value={place.zoom}
                        onChange={(e) => setPlace((p) => zoomTo(p, Number(e.target.value), bitmap, SIDE))}
                    />
                    <button type="button" className="btn btn-sm btn-quiet" onClick={() => setPlace((p) => centered(bitmap, SIDE, p.zoom))}>Center</button>
                </div>
            </div>
        </Modal>
    );
}
