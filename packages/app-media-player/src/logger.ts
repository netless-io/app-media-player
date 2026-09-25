import { options } from "./options";

type LogLevel = "info" | "warn" | "error";
type LogRoom = {
    logger?: Partial<Record<LogLevel, (...args: unknown[]) => void>>;
};

export function report(room: unknown, level: LogLevel, ...args: unknown[]): void {
    const logger = (room as LogRoom | undefined)?.logger;
    try {
        logger?.[level]?.(...args);
    } catch {
        // Logging must not interrupt player setup or cleanup.
    }
}

export function debug(room: unknown, source: string, message: string, ...args: unknown[]): void {
    if (!options.verbose) return;
    const entry = `[${source}] ${message}`;
    if (options.log) {
        try {
            options.log(entry, ...args);
        } catch {
            // A custom logger must not interrupt playback.
        }
    } else {
        report(room, "info", entry, ...args);
    }
}
