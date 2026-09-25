import assert from "node:assert/strict";
import { test } from "node:test";
import { waitForPlayerReady } from "../src/setup-ready";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("legacy setup completes on timeout and reports a warning", async () => {
    const warnings: string[] = [];
    const context = {
        waitForActualSetupReady: false,
        getWindowManager: () => ({ Logger: { warn: (message: string) => warnings.push(message) } }),
    } as any;
    await waitForPlayerReady(new Promise(() => {}), 5, context);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /keeping loading in background/);
});

test("lazy setup warns once but waits for actual player readiness", async () => {
    const warnings: string[] = [];
    const context = {
        waitForActualSetupReady: true,
        getWindowManager: () => ({ Logger: { warn: (message: string) => warnings.push(message) } }),
    } as any;
    let ready!: () => void;
    const playerReady = new Promise<void>(resolve => { ready = resolve; });
    let completed = false;
    const setup = waitForPlayerReady(playerReady, 5, context).then(() => { completed = true; });

    await delay(25);
    assert.equal(completed, false);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /still waiting for player/);
    ready();
    await setup;
    assert.equal(completed, true);
});

test("a pending lazy wait completes if the host returns to eager mode", async () => {
    const context = {
        waitForActualSetupReady: true,
        getWindowManager: () => ({ Logger: { warn() {} } }),
    } as any;
    const setup = waitForPlayerReady(new Promise(() => {}), 5, context);
    await delay(25);
    context.waitForActualSetupReady = false;
    await setup;
});

test("lazy setup stops waiting when the player unmounts", async () => {
    const warnings: string[] = [];
    const context = {
        waitForActualSetupReady: true,
        getWindowManager: () => ({ Logger: { warn: (message: string) => warnings.push(message) } }),
    } as any;
    let unmount!: (player: null) => void;
    const playerReady = new Promise<null>(resolve => { unmount = resolve; });
    const setup = waitForPlayerReady(playerReady, 5, context);
    await delay(25);
    unmount(null);
    await setup;
    assert.equal(warnings.length, 1);
});
