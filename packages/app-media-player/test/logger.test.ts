import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { debug, report } from "../src/logger";
import { setOptions } from "../src/options";

afterEach(() => setOptions({}));

test("verbose diagnostics default to room.logger.info", () => {
    const calls: unknown[][] = [];
    const room = { logger: { info: (...args: unknown[]) => calls.push(args) } };
    setOptions({ verbose: true });

    debug(room, "MediaPlayer", "ready", 1);
    assert.deepEqual(calls, [["[MediaPlayer] ready", 1]]);
});

test("a custom log overrides the room's verbose destination", () => {
    const calls: unknown[][] = [];
    const room = { logger: { info: () => { throw new Error("room logger should not run"); } } };
    setOptions({ verbose: true, log: (...args: unknown[]) => calls.push(args) });

    debug(room, "RTCEffect", "ready");
    assert.deepEqual(calls, [["[RTCEffect] ready"]]);
});

test("warnings and errors use the room logger without a local fallback", () => {
    const calls: unknown[][] = [];
    const room = { logger: {
        warn: (...args: unknown[]) => calls.push(["warn", ...args]),
        error: (...args: unknown[]) => calls.push(["error", ...args]),
    } };
    const error = new Error("failed");

    report(room, "warn", "retry", error);
    report(room, "error", "failed", error);
    report(undefined, "error", "no room");
    assert.deepEqual(calls, [["warn", "retry", error], ["error", "failed", error]]);
});

test("logger failures do not interrupt media operations", () => {
    const room = { logger: { warn: () => { throw new Error("logger failed"); } } };
    assert.doesNotThrow(() => report(room, "warn", "retry"));
    setOptions({ verbose: true, log: () => { throw new Error("logger failed"); } });
    assert.doesNotThrow(() => debug(room, "MediaPlayer", "ready"));
});
