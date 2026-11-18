import Icon from "@/shared/icons/Icon";
import { cx } from "@/shared/utils/cx";
import { ErrorText } from "./ErrorText";
import { dismissToast, holdToast, releaseToast, useToasts, type Toast } from "./toast";

/**
 * What kind of toast it is, from the icon it already carries: a failure (alert) is tinted red, a confirmation
 * green, a removal or cancellation (trash, x, usually with Undo) stays plain, anything else is a teal notice.
 */
function kindOf(t: Toast) {
    if (t.icon === "alert") return "toast-error";
    if (!t.icon || t.icon === "checkCircle" || t.icon === "check") return "toast-ok";
    if (t.icon === "trash" || t.icon === "x") return "toast-plain";
    return "toast-info";
}

/**
 * Where toasts appear: the top right corner, under the top bar, newest first. They slide in from the right and fade
 * out the same way, the ones below closing the gap. Rendered once by the app. A toast being read stays. Each is
 * tinted by its kind (client.css).
 */
export default function Toasts() {
    const toasts = useToasts();
    return (
        <div className="toasts" aria-live="polite">
            {[...toasts].reverse().map((t) => (
                <div className={cx("toast", kindOf(t), t.leaving && "leaving")} key={t.id}
                    // only a mouse holds it: a tap on a touch screen never "leaves", so it would stay for good
                    onPointerEnter={(e) => e.pointerType === "mouse" && holdToast(t.id)} onPointerLeave={(e) => e.pointerType === "mouse" && releaseToast(t.id)}
                    onFocus={() => holdToast(t.id)} onBlur={() => releaseToast(t.id)}>
                    <Icon name={t.icon ?? "checkCircle"} />
                    <div className="grow">
                        <div>{t.text}</div>
                        {/* a failure on the server links to Contact the developer */}
                        {t.sub && <div className="toast-sub"><ErrorText text={t.sub} /></div>}
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
