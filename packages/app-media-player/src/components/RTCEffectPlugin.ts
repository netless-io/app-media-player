import { options } from "../options";
import { RTCEffectClient } from "../types";
import type { VideoJsPlayer } from "video.js";

let assignableRtcEffectId = 99999;
// Create a new effect object and return the id.
function createRTCEffectObject(): number {
    // The effect id maybe duplicate with other mixing user. The value should be unique but can't be unique. Currently it's unique between ppt and media player.
    const playingId = assignableRtcEffectId--;
    const state = {
        playState: RTCEffectPlayState.Idle,
        previousVideoJSAdvance: 0,
        previousSeekTargetTime: 0,
        previousBeginSeekTime: 0,
        seekEnable: false
    };
    activeRTCEffectStates[playingId] = state;
    return playingId;
}
enum RTCEffectPlayState {
    Idle = 0,
    Playing = 1,
    Paused = 2,
}
let activeRTCEffectStates: {
    [id: number]: RTCEffectState
} = {};
interface RTCEffectState {
    playState: RTCEffectPlayState;
    previousVideoJSAdvance: number;
    previousSeekTargetTime: number;
    previousBeginSeekTime: number;
    seekEnable: boolean;
}

function debug(msg: string, ...args: any[]) {
    if (options.verbose) {
        console.log(`[RTCEffect] ${msg}`, ...args);
    }
}

export default function setupRTCEffectMixing(rtcAudioEffectClient: RTCEffectClient, player: VideoJsPlayer, src: string) {
    player.one("ready", () => {
        const src = (player as any)?.tagAttributes?.src || "";
        const isAudio = src.endsWith("mp3") || src.endsWith("wav") || src.endsWith("m4a");
        // Because mute audio will lead to a videojs error. So we should avoid mute audio. But it will lead to echo. Anyway...
        if (!isAudio) {
            debug(">>> Mute js player", { src });
            // Force mute js player to avoid echo.
            player.muted(true);
            // Hook js player mute event so the player wont be muted during native rtc effect mixing.
            player.muted = (i: boolean | void): boolean => {
                return false;
            }
        }
        const playingId = createRTCEffectObject();
        debug(">>> Setup", { playingId, src });
        // Can't preload media due to the limitation of native rtc effect so far.
        // rtcAudioEffectClient.preloadEffect(playingId, src, 0);

        rtcAudioEffectClient.addListener("error", (soundId) => {
            debug(">>> Error", { soundId });
            activeRTCEffectStates[soundId].playState = RTCEffectPlayState.Idle;
        });
        rtcAudioEffectClient.addListener('effectFinished', (soundId: number) => {
            debug(">>> Finished", { soundId });
            activeRTCEffectStates[soundId].playState = RTCEffectPlayState.Idle;
            activeRTCEffectStates[soundId].previousVideoJSAdvance = 0;
            activeRTCEffectStates[soundId].previousSeekTargetTime = 0;
            activeRTCEffectStates[soundId].previousBeginSeekTime = 0;
            activeRTCEffectStates[soundId].seekEnable = false;
        });

        player.on("play", () => {
            const currenState = activeRTCEffectStates[playingId].playState;
            switch (currenState) {
                case RTCEffectPlayState.Idle:
                    debug(">>> Start play", { playingId });
                    rtcAudioEffectClient.playEffect(playingId, src, 0, 1, 0, 100, false, 0)
                        .then(() => {
                            debug(">>> Play Success", { playingId });
                            activeRTCEffectStates[playingId].seekEnable = true;
                        });
                    activeRTCEffectStates[playingId].playState = RTCEffectPlayState.Playing;
                    break;
                case RTCEffectPlayState.Paused:
                    rtcAudioEffectClient.resumeEffect(playingId);
                    activeRTCEffectStates[playingId].playState = RTCEffectPlayState.Playing;
                    debug(">>> Resume play", { playingId });
                    break;
                default:
                    break;
            }
        });
        player.on("pause", () => {
            const currenState = activeRTCEffectStates[playingId].playState;
            switch (currenState) {
                case RTCEffectPlayState.Playing:
                    debug(">>> Pause play", { playingId });
                    rtcAudioEffectClient.pauseEffect(playingId);
                    activeRTCEffectStates[playingId].playState = RTCEffectPlayState.Paused;
                    break;
                default:  // Can't pause before play due to the limitation of native rtc effect. So we just ignore the pause event.
                    break;
            }
        });
        player.on("timeupdate", () => { // RTC native clien time unit is millisecond. JS player time unit is second.
            const state = activeRTCEffectStates[playingId];
            if (state.playState === RTCEffectPlayState.Playing && state.seekEnable) {
                rtcAudioEffectClient
                    .getEffectCurrentPosition(playingId)
                    .then((rtcEffectMSTime: number) => {
                        const state = activeRTCEffectStates[playingId];
                        const rtcEffectTime = rtcEffectMSTime / 1000;
                        const isSeeking = state.previousSeekTargetTime !== 0 && state.previousBeginSeekTime !== 0;
                        debug(">>> getEffectCurrentPosition", { playingId, rtcEffectTime, isSeeking });
                        if (isSeeking && rtcEffectTime < state.previousSeekTargetTime) { // Reject all update event when rtc effect is seeking.
                            return
                        }
                        if (state.playState !== RTCEffectPlayState.Playing) { // Get effect postion is async, so we need to check the play state again. Only playing should be cared.
                            debug(">>> Skip timeupdate", { playingId, state: state.playState });
                            return;
                        }
                        function startRTCEffectSeek(second: number, id: number) {
                            rtcAudioEffectClient.setEffectPosition(id, second * 1000);
                            state.previousBeginSeekTime = Date.now() / 1000;
                            state.previousSeekTargetTime = second;
                        }
                        const previousBeginSeekTime = state.previousBeginSeekTime;
                        if (rtcEffectMSTime > 0) {
                            const jsPlayerTime = player.currentTime();
                            const jsPlayerTimerAdvance = jsPlayerTime - rtcEffectTime;
                            const absAdvance = Math.abs(jsPlayerTimerAdvance);
                            const rtcLagTolerance = 0.5;
                            if (absAdvance > rtcLagTolerance) { // Once the lag is larger than the tolerance, we should do something.
                                if (isSeeking) { // Lagging from seeking.
                                    const lastSeekingCost = (Date.now() / 1000) - previousBeginSeekTime;
                                    const rtcEffectLag = jsPlayerTimerAdvance > 0 ? jsPlayerTimerAdvance : 0; // If rtc is advance, we should not correct it. It just means we seek too much.
                                    const estimatedRTCLag = lastSeekingCost + rtcEffectLag;
                                    const targetRTCSeekTime = jsPlayerTime + estimatedRTCLag;
                                    startRTCEffectSeek(targetRTCSeekTime, playingId);
                                    debug(">>> seeking after seeking lag", { jsPlayerTime, rtcEffectTime, jsPlayerTimerAdvance, lastSeekingCost, estimatedRTCLag, targetRTCSeekTime });
                                } else {
                                    if (absAdvance > 10) { // If the lag is too large, we should seek directly.
                                        startRTCEffectSeek(jsPlayerTime, playingId);
                                        debug(">>> direct seek", { jsPlayerTime, rtcEffectTime, jsPlayerTimerAdvance });
                                    } else { // Here is the normal lagging case.
                                        const previousAdvance = state.previousVideoJSAdvance;
                                        const estimatedRTCLag = Math.max(previousAdvance + jsPlayerTimerAdvance, 0);
                                        const targetRTCSeekTime = jsPlayerTime + estimatedRTCLag;
                                        state.previousVideoJSAdvance = estimatedRTCLag;
                                        startRTCEffectSeek(targetRTCSeekTime, playingId);
                                        debug(">>> normal lag seeking", { jsPlayerTime, rtcEffectTime, jsPlayerTimerAdvance, previousAdvance, estimatedRTCLag, targetRTCSeekTime });
                                    }
                                }
                            } else {
                                if (isSeeking) {
                                    debug(">>> seeking finished with no log", { jsPlayerTime, rtcEffectTime, jsPlayerTimerAdvance, previousBeginSeekTime, rtcLagTolerance });
                                    state.previousBeginSeekTime = 0;
                                    state.previousSeekTargetTime = 0;
                                }
                            }
                        }
                    });
            }
        });
        player.on("dispose", () => {
            const currentState = activeRTCEffectStates[playingId].playState;
            if (currentState) {
                rtcAudioEffectClient.stopEffect(playingId);
                // rtcAudioEffectClient.unloadEffect(playingId);
                delete activeRTCEffectStates[playingId];
                debug(">>> Dispose", { playingId });
            }
        });
    });
}