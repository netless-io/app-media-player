import type { AppContext } from "@netless/window-manager";
import { report } from "./logger";

export function waitForPlayerReady(
    playerReady: Promise<unknown>,
    timeoutMs: number,
    context: AppContext<any>,
): Promise<void> {
    return new Promise<void>(resolve => {
        let settled = false;
        let pollTimer: ReturnType<typeof setInterval> | undefined;
        const settle = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (pollTimer !== undefined) clearInterval(pollTimer);
            resolve();
        };
        const waitForActualReady = () => Boolean((context as any).waitForActualSetupReady);
        const timer = setTimeout(() => {
            const strict = waitForActualReady();
            report(context, "warn",
                `[MediaPlayer]: setup ready wait timed out after ${timeoutMs}ms, ${strict ? "still waiting for player" : "keeping loading in background"}`
            );
            if (strict) {
                pollTimer = setInterval(() => {
                    if (!waitForActualReady()) settle();
                }, 100);
            } else {
                settle();
            }
        }, timeoutMs);
        playerReady.then(settle, settle);
    });
}
