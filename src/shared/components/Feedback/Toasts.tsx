import Icon from "@/shared/icons/Icon";
import { dismissToast, useToasts } from "./toast";

/** Where toasts appear, bottom right (the prototype's UI.Toasts). Rendered once by the app. */
export default function Toasts() {
    const toasts = useToasts();
    return (
        <div className="toasts" aria-live="polite">
            {toasts.map((t) => (
                <div className="toast" key={t.id}>
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
