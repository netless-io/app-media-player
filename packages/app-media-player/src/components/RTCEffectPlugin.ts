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
}

function debug(msg: string, ...args: any[]) {
    if (options.verbose) {
        console.log(`[RTCEffect] ${msg}`, ...args);
    }
}

export default function setupRTCEffectMixing(rtcAudioEffectClient: RTCEffectClient, player: VideoJsPlayer, src: string) {
    function playEffectId(playingId: number) {
        if (activeRTCEffectStates[playingId].playState !== RTCEffectPlayState.Idle) {
            debug(">>> Skip Play", { playingId, state: activeRTCEffectStates[playingId].playState });
            return
        }
        rtcAudioEffectClient.playEffect(playingId, src, 0, 1, 0, 100, false, 0)
            .then(() => {
                debug(">>> Play Success", { playingId });
            });
        activeRTCEffectStates[playingId].playState = RTCEffectPlayState.Playing;
    }

    function resetEffectState(playingId: number) {
        activeRTCEffectStates[playingId].playState = RTCEffectPlayState.Idle;
        activeRTCEffectStates[playingId].previousVideoJSAdvance = 0;
        activeRTCEffectStates[playingId].previousSeekTargetTime = 0;
        activeRTCEffectStates[playingId].previousBeginSeekTime = 0;
    }

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
            resetEffectState(soundId);
        });
        rtcAudioEffectClient.addListener('effectFinished', (soundId: number) => {
            debug(">>> Finished", { soundId });
            resetEffectState(soundId);
        });
        player.on("play", () => {
            const currenState = activeRTCEffectStates[playingId].playState;
            switch (currenState) {
                case RTCEffectPlayState.Idle:
                    debug(">>> Start play", { playingId });
                    playEffectId(playingId);
                    break;
                case RTCEffectPlayState.Paused:
                    debug(">>> Resume play", { playingId });
                    rtcAudioEffectClient.resumeEffect(playingId);
                    activeRTCEffectStates[playingId].playState = RTCEffectPlayState.Playing;
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
                    debug(">>> Skip Pause", { playingId, currenState });
                    break;
            }
        });
        // player.on("ended", () => {
        //     const currenState = activeRTCEffectStates[playingId].playState;
        //     switch (currenState) {
        //         case RTCEffectPlayState.Playing:
        //         case RTCEffectPlayState.Paused:
        //             // <<End event>>
        //             // Player ended. We should seek to 0.
        //             rtcAudioEffectClient
        //                 .getEffectCurrentPosition(playingId)
        //                 .then((rtcEffectMSTime: number) => {
        //                     if (rtcEffectMSTime > 0) {
        //                         const s = activeRTCEffectStates[playingId].playState;
        //                         switch (s) {
        //                             case RTCEffectPlayState.Playing:
        //                             case RTCEffectPlayState.Paused:
        //                                 debug(">>> Found player ended Seek to 0 ", { playingId, state: s });
        //                                 rtcAudioEffectClient.setEffectPosition(playingId, 0);
        //                             default:
        //                                 break;
        //                         }
        //                     }
        //                 })
        //         default:
        //             break
        //     }
        // });
        player.on("timeupdate", () => { // RTC native clien time unit is millisecond. JS player time unit is second.
            const state = activeRTCEffectStates[playingId];
            // debug(">>> timeupdate", { playingId, state: state.playState, jsSecond: player.currentTime() });
            rtcAudioEffectClient
                .getEffectCurrentPosition(playingId)
                .then((rtcEffectMSTime: number) => {
                    const state = activeRTCEffectStates[playingId];
                    const rtcEffectTime = rtcEffectMSTime / 1000;
                    const jsPlayerTime = player.currentTime();
                    const isSeeking = state.previousSeekTargetTime !== 0 && state.previousBeginSeekTime !== 0;
                    debug(`>>> EffectSecond rtc: ${rtcEffectTime} js: ${jsPlayerTime} seeking: ${isSeeking}`, { playingId });
                    if (state.playState == RTCEffectPlayState.Idle) {
                        if (!player.paused()) {
                            debug(">>> Play effect due to time update.", { playingId });
                            playEffectId(playingId);
                        }
                        return;
                    }
                    // if (state.playState == RTCEffectPlayState.Paused) {
                    //     // <<End event>>
                    //     // This behavior is: 
                    //     // jsplayer seek to 0, and pause.
                    //     // So js player will send a "timeupdate" event when player state is playing and jstime is 0.
                    //     const jsPlayerTime = player.currentTime();
                    //     if (jsPlayerTime === 0 && rtcEffectTime > 0) {
                    //         debug(">>> Special event. JS player time is 0. RTC paused. Seek rtc to 0", { playingId, rtcEffectMSTime });
                    //         rtcAudioEffectClient.setEffectPosition(playingId, 0);
                    //     }
                    //     return;
                    // }
                    // Reject all update event when rtc effect is seeking.
                    if (isSeeking && rtcEffectTime < state.previousSeekTargetTime) { return }
                    if (state.playState !== RTCEffectPlayState.Playing) { // Get effect postion is async, so we need to check the play state again. Only playing should be cared.)
                        debug(">>> Skip timupdate", { playingId, state: state.playState, jsTime: player.currentTime(), rtcEffectTime });
                        return;
                    }
                    function startRTCEffectSeek(second: number, id: number) {
                        rtcAudioEffectClient.setEffectPosition(id, second * 1000);
                        state.previousBeginSeekTime = Date.now() / 1000;
                        state.previousSeekTargetTime = second;
                    }
                    const previousBeginSeekTime = state.previousBeginSeekTime;
                    if (rtcEffectMSTime > 0) {
                        const jsPlayerTimerAdvance = jsPlayerTime - rtcEffectTime;
                        const absAdvance = Math.abs(jsPlayerTimerAdvance);
                        const rtcLagTolerance = 0.5;
                        if (absAdvance > rtcLagTolerance) { // Once the lag is larger than the tolerance, we should do something.
                            if (isSeeking) { // Lagging from seeking.
                                const timeElapse = state.previousSeekTargetTime - rtcEffectTime;
                                const lastSeekingCost = (Date.now() / 1000) - previousBeginSeekTime;
                                const rtcEffectLag = jsPlayerTimerAdvance > 0 ? jsPlayerTimerAdvance : 0; // If rtc is advance, we should not correct it. It just means we seek too much.
                                const estimatedRTCLag = lastSeekingCost + rtcEffectLag;
                                const targetRTCSeekTime = jsPlayerTime + estimatedRTCLag;
                                startRTCEffectSeek(targetRTCSeekTime, playingId);
                                debug(">>> Start seeking after seeking lag", { jsPlayerTime, rtcEffectTime, jsPlayerTimerAdvance, lastSeekingCost, estimatedRTCLag, targetRTCSeekTime, previousBeginSeekTime, timeElapse });
                            } else {
                                if (absAdvance > 10) { // If the lag is too large, we should seek directly.
                                    startRTCEffectSeek(jsPlayerTime, playingId);
                                    debug(">>> DirectSeek", { time: jsPlayerTime, rtcEffectTime, jsPlayerTimerAdvance });
                                } else { // Here is the normal lagging case.
                                    const previousAdvance = state.previousVideoJSAdvance;
                                    // Specially, the first seeking forced to be 0.
                                    const estimatedRTCLag = 0;
                                    const targetRTCSeekTime = jsPlayerTime + estimatedRTCLag;
                                    state.previousVideoJSAdvance = estimatedRTCLag;
                                    startRTCEffectSeek(targetRTCSeekTime, playingId);
                                    debug(">>> Start seeking with lag", { jsPlayerTime, rtcEffectTime, jsPlayerTimerAdvance, previousAdvance, estimatedRTCLag, targetRTCSeekTime });
                                }
                            }
                        } else {
                            if (isSeeking) {
                                debug(">>> SeekingFinish no lag", { jsPlayerTime, rtcEffectTime, jsPlayerTimerAdvance, previousBeginSeekTime, rtcLagTolerance });
                                state.previousBeginSeekTime = 0;
                                state.previousSeekTargetTime = 0;
                            }
                        }
                    }
                });
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