import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import setupRTCEffectMixing from "../src/components/RTCEffectPlugin";

test("RTC effect listeners belong to one player and are removed on dispose", () => {
    const rtc = new EventEmitter() as any;
    const played: number[] = [];
    const stopped: number[] = [];
    const errors: number[] = [];
    rtc.playEffect = (id: number) => {
        played.push(id);
        return Promise.resolve(0);
    };
    rtc.stopEffect = (id: number) => {
        stopped.push(id);
        return Promise.resolve(0);
    };
    const context = {
        getWindowManager: () => ({ Logger: { error: (_: string, id: number) => errors.push(id) } }),
    } as any;
    const createPlayer = () => {
        const player = new EventEmitter() as any;
        player.tagAttributes = { src: "audio.mp3" };
        player.one = player.once.bind(player);
        setupRTCEffectMixing(rtc, player, "audio.mp3", context);
        player.emit("ready");
        return player;
    };

    const first = createPlayer();
    first.emit("play");
    assert.equal(rtc.listenerCount("error"), 1);
    rtc.emit("error", played[0] + 1);
    assert.deepEqual(errors, [], "another effect is ignored");
    first.emit("dispose");
    assert.deepEqual(stopped, [played[0]]);
    assert.equal(rtc.listenerCount("error"), 0);
    assert.equal(rtc.listenerCount("effectFinished"), 0);

    const second = createPlayer();
    second.emit("play");
    rtc.emit("error", played[1]);
    assert.deepEqual(errors, [played[1]], "only the live player reports its error");
    second.emit("dispose");
    assert.equal(rtc.listenerCount("error"), 0);
    assert.equal(rtc.listenerCount("effectFinished"), 0);
});

test("a pending RTC position response is ignored after player disposal", async () => {
    const rtc = new EventEmitter() as any;
    let resolvePosition!: (position: number) => void;
    rtc.getEffectCurrentPosition = () => new Promise<number>(resolve => {
        resolvePosition = resolve;
    });
    rtc.stopEffect = () => Promise.resolve(0);
    const player = new EventEmitter() as any;
    player.one = player.once.bind(player);
    player.tagAttributes = { src: "audio.mp3" };
    player.currentTime = () => 1;
    const context = { getWindowManager: () => ({ Logger: {} }) } as any;

    setupRTCEffectMixing(rtc, player, "audio.mp3", context);
    player.emit("ready");
    player.emit("timeupdate");
    player.emit("dispose");
    resolvePosition(1000);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(rtc.listenerCount("effectFinished"), 0);
});
