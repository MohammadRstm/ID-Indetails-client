import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { PROJECT_COLORS, hexToHsv, hsvToHex, type Hsv } from "@/shared/format/color";
import { cx } from "@/shared/utils/cx";

const KEY_STEPS: Record<string, [number, number]> = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowDown: [0, -0.05], ArrowUp: [0, 0.05] };

/**
 * A colour, picked on a wheel (the hue around it, its strength out from the white centre) with a brightness slider,
 * from the palette's swatches, or typed as a hex code. `value` is what the hex box holds, so the form can say when
 * it isn't a colour; every pick writes the hex code there.
 */
export default function ColorField({ id, value, onChange, invalid }: {
    id: string;
    value: string;
    onChange: (value: string) => void;
    invalid?: boolean;
}) {
    const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value) ?? { h: 0, s: 0, v: 1 });
    const pick = (next: Hsv) => {
        setHsv(next);
        onChange(hsvToHex(next));
    };

    function fromPointer(e: PointerEvent<HTMLDivElement>) {
        const box = e.currentTarget.getBoundingClientRect();
        const r = box.width / 2;
        const dx = e.clientX - box.left - r, dy = e.clientY - box.top - r;
        pick({ h: ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360, s: Math.min(1, Math.hypot(dx, dy) / r), v: hsv.v });
    }
    function onKey(e: KeyboardEvent<HTMLDivElement>) {
        const step = KEY_STEPS[e.key];
        if (!step) return;
        e.preventDefault();
        pick({ h: (hsv.h + step[0] + 360) % 360, s: Math.min(1, Math.max(0, hsv.s + step[1])), v: hsv.v });
    }

    const angle = (hsv.h * Math.PI) / 180;
    const typed = value.trim().toUpperCase();
    return (
        <div className="cw">
            <div className="cw-wheel" role="slider" tabIndex={0} aria-valuemin={0} aria-valuemax={359} aria-valuenow={Math.round(hsv.h)}
                aria-valuetext={hsvToHex(hsv)} aria-label="Colour wheel. Left and right change the hue, up and down its strength."
                onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); fromPointer(e); }}
                onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture?.(e.pointerId)) fromPointer(e); }}
                onKeyDown={onKey}>
                <i className="cw-shade" style={{ opacity: 1 - hsv.v }} />
                <i className="cw-dot" style={{ left: `${50 + 50 * hsv.s * Math.sin(angle)}%`, top: `${50 - 50 * hsv.s * Math.cos(angle)}%`, background: hsvToHex(hsv) }} />
            </div>
            <div className="cw-side">
                <input type="range" className="cw-bright" aria-label="Brightness" min={0} max={100} value={Math.round(hsv.v * 100)}
                    style={{ background: `linear-gradient(to right, #000, ${hsvToHex({ ...hsv, v: 1 })})` }}
                    onChange={(e) => pick({ ...hsv, v: Number(e.target.value) / 100 })} />
                <div className="cw-swatches">
                    {PROJECT_COLORS.map((c) => (
                        <button key={c.hex} type="button" className={cx("cw-sw", typed === c.hex && "on")} style={{ background: c.hex }}
                            title={c.name} aria-label={c.name} aria-pressed={typed === c.hex}
                            onClick={() => { setHsv(hexToHsv(c.hex) ?? hsv); onChange(c.hex); }} />
                    ))}
                </div>
                <input id={id} className="input mono" maxLength={9} spellCheck={false} placeholder="#2F6FEB" aria-invalid={invalid || undefined}
                    value={value}
                    onChange={(e) => {
                        const parsed = hexToHsv(e.target.value);
                        if (parsed) setHsv(parsed);
                        onChange(e.target.value);
                    }} />
            </div>
        </div>
    );
}
