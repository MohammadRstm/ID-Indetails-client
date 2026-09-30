/*
 * A stand-in for @microsoft/signalr in tests (set up in setup.ts): connections "open" at once, and a test
 * sends the API's signals with live.emit("notifications") or live.emit("messages", { teamId: 4 }).
 */

type Handler = (...args: unknown[]) => void;

export const HubConnectionState = { Disconnected: "Disconnected", Connected: "Connected" } as const;

export const LogLevel = { None: 6 };

const open = new Set<FakeConnection>();

class FakeConnection {
    state: string = HubConnectionState.Disconnected;
    private handlers = new Map<string, Handler[]>();

    on(signal: string, handler: Handler) {
        this.handlers.set(signal, [...(this.handlers.get(signal) ?? []), handler]);
    }

    onreconnected() {}

    onclose() {}

    start() {
        this.state = HubConnectionState.Connected;
        open.add(this);
        return Promise.resolve();
    }

    stop() {
        this.state = HubConnectionState.Disconnected;
        open.delete(this);
        return Promise.resolve();
    }

    emit(signal: string, payload?: unknown) {
        this.handlers.get(signal)?.forEach((h) => (payload === undefined ? h() : h(payload)));
    }
}

export class HubConnectionBuilder {
    withUrl() { return this; }
    withAutomaticReconnect() { return this; }
    configureLogging() { return this; }
    build() { return new FakeConnection(); }
}

export const live = {
    /** Sends a signal to every open connection, as the API's hub would. */
    emit(signal: string, payload?: unknown) {
        open.forEach((c) => c.emit(signal, payload));
    },
    get connected() {
        return open.size;
    },
};
