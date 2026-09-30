import { useEffect, useState } from "react";
import { useCurrentUser } from "@/app/session/useSession";
import Icon from "@/shared/icons/Icon";
import { startTimer, stopTimer, useTimer } from "./timer";
import { useDomainSettings, useMyProjects } from "./workApi";

const two = (n: number) => String(n).padStart(2, "0");

/** The top bar's timer: running time and Stop, or Start timer when the domain allows it (the prototype's .timer). */
export default function TimerControl() {
    const me = useCurrentUser();
    const settings = useDomainSettings("design").data;
    const timer = useTimer(me.id);
    const projects = useMyProjects(timer?.projectId != null);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!timer) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [timer]);

    if (timer) {
        const elapsed = Math.max(0, Math.round((now - Date.parse(timer.startedAt)) / 1000));
        const title = projects.data?.find((p) => p.id === timer.projectId)?.title;
        return (
            <div className="timer">
                <span className="live" />
                <span className="mono">{two(Math.floor(elapsed / 3600))}:{two(Math.floor(elapsed / 60) % 60)}:{two(elapsed % 60)}</span>
                {title && <span className="muted trunc" style={{ maxWidth: 120 }}>{title}</span>}
                <button className="btn btn-sm" onClick={stopTimer}><Icon name="stop" />Stop</button>
            </div>
        );
    }
    if (!settings?.timerEnabled) return null;
    return <button className="btn btn-sm btn-quiet" onClick={() => startTimer(me.id)}><Icon name="play" />Start timer</button>;
}
