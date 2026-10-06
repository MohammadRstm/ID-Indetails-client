import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { dismissToast, holdToast, releaseToast, useToasts } from "./toast";

/**
 * Where toasts appear: the top right corner, under the top bar, newest first. They slide in from the right and fade
 * out the same way, the ones below closing the gap. Rendered once by the app. A toast being read stays.
 */
export default function Toasts() {
    const toasts = useToasts();
    return (
        <div className="toasts" aria-live="polite">
            {[...toasts].reverse().map((t) => (
                <div className={cx("toast", t.leaving && "leaving")} key={t.id}
                    onMouseEnter={() => holdToast(t.id)} onMouseLeave={() => releaseToast(t.id)}
                    onFocus={() => holdToast(t.id)} onBlur={() => releaseToast(t.id)}>
                    <Icon name={t.icon ?? "checkCircle"} />
                    <div className="grow">
                        <div>{t.text}</div>
                        {t.sub && <div className="toast-sub">{t.sub}</div>}
                    </div>
                    {t.actionLabel && (
                        <button onClick={() => { t.action?.(); dismissToast(t.id); }}>{t.actionLabel}</button>
                    )}
                    <button onClick={() => dismissToast(t.id)} aria-label="Dismiss">✕</button>
                </div>
            ))}
        </div>
    );
}
