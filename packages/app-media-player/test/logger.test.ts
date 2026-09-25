import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { debug, report } from "../src/logger";
import { setOptions } from "../src/options";

afterEach(() => setOptions({}));

const context = (managerLogger?: unknown, roomLogger?: unknown) => ({
    getWindowManager: () => ({ Logger: managerLogger }),
    getRoom: () => roomLogger ? { logger: roomLogger } : undefined,
}) as any;

test("verbose diagnostics use the WindowManager logger", () => {
    const calls: unknown[][] = [];
    const appContext = context({ info: (...args: unknown[]) => calls.push(args) });
    setOptions({ verbose: true });

    debug(appContext, "MediaPlayer", "ready", 1);
    assert.deepEqual(calls, [["[MediaPlayer] ready", 1]]);
});

test("a custom log overrides the WindowManager verbose destination", () => {
    const calls: unknown[][] = [];
    const appContext = context({ info: () => { throw new Error("manager logger should not run"); } });
    setOptions({ verbose: true, log: (...args: unknown[]) => calls.push(args) });

    debug(appContext, "RTCEffect", "ready");
    assert.deepEqual(calls, [["[RTCEffect] ready"]]);
});

test("warnings and errors use the WindowManager logger during replay", () => {
    const calls: unknown[][] = [];
    const appContext = context({
        warn: (...args: unknown[]) => calls.push(["warn", ...args]),
        error: (...args: unknown[]) => calls.push(["error", ...args]),
    });
    const error = new Error("failed");

    report(appContext, "warn", "retry", error);
    report(appContext, "error", "failed", error);
    assert.deepEqual(calls, [["warn", "retry", error], ["error", "failed", error]]);
});

test("older WindowManager versions fall back to room.logger", () => {
    const calls: unknown[][] = [];
    report(context(undefined, { warn: (...args: unknown[]) => calls.push(args) }), "warn", "pending");
    assert.deepEqual(calls, [["pending"]]);
    report({ getRoom: () => ({ logger: { warn: (...args: unknown[]) => calls.push(args) } }) } as any, "warn", "legacy");
    assert.deepEqual(calls, [["pending"], ["legacy"]]);
});

test("logger failures do not interrupt media operations", () => {
    const appContext = context({ warn: () => { throw new Error("logger failed"); } });
    assert.doesNotThrow(() => report(appContext, "warn", "retry"));
    setOptions({ verbose: true, log: () => { throw new Error("logger failed"); } });
    assert.doesNotThrow(() => debug(appContext, "MediaPlayer", "ready"));
});
