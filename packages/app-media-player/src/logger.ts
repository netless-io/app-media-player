import { options } from "./options";
import type { AppContext } from "@netless/window-manager";

type LogLevel = "info" | "warn" | "error";
type LogSink = Partial<Record<LogLevel, (...args: unknown[]) => void>>;

export function getLogger(context: AppContext<any>): LogSink | undefined {
    const manager = (context as any).getWindowManager?.() as { Logger?: LogSink } | undefined;
    return manager?.Logger ?? (context.getRoom() as unknown as { logger?: LogSink } | undefined)?.logger;
}

export function report(context: AppContext<any>, level: LogLevel, ...args: unknown[]): void {
    try {
        getLogger(context)?.[level]?.(...args);
    } catch {
        // Logging must not interrupt player setup or cleanup.
    }
}

export function debug(context: AppContext<any>, source: string, message: string, ...args: unknown[]): void {
    if (!options.verbose) return;
    const entry = `[${source}] ${message}`;
    if (options.log) {
        try {
            options.log(entry, ...args);
        } catch {
            // A custom logger must not interrupt playback.
        }
    } else {
        report(context, "info", entry, ...args);
    }
}
