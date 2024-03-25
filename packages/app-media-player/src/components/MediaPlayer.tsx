import type { AppContext, Player, Room } from "@netless/window-manager";

import React, { Component } from "react";
import videojs from "video.js";
import type { VideoJsPlayer } from "video.js";

import { defaultAttributes, Version } from "../constants";
import { options } from "../options";
import type { Props, Attributes, Keys, RTCEffectClient } from "../types";
import { AudioExts, checkWhiteWebSdkVersion, getCurrentTime, isSafari, nextFrame } from "../utils";
import PlayerController from "./PlayerController";
import setupRTCEffectMixing from "./RTCEffectPlugin";

export class MediaPlayer extends Component<Props> {
    render() {
        const { context } = this.props;
        const room = context.getRoom();
        const player = room ? undefined : (context.getDisplayer() as Player);
        const putAttributes = this.putAttributes;
        return (
            <MediaPlayerImpl
                room={room}
                player={player}
                context={context}
                plugin={{ putAttributes }}
            />
        );
    }
    putAttributes = (b: Partial<Attributes>) => {
        const { context } = this.props;
        const a = (context.getAttributes() || {}) as any;
        for (const k in b) {
            if (a[k] !== b[k as Keys]) {
                context.updateAttributes([k], b[k as Keys]);
            }
        }
    };
}

export interface ImplProps {
    room?: Room;
    player?: Player;
    context: AppContext<Attributes>;
    plugin: { putAttributes(attrs: any): void };
}

interface State {
    NoSound: boolean;
    MediaError: boolean;
    updater: boolean;
    controllerVisible: boolean;
}

class MediaPlayerImpl extends Component<ImplProps, State> {
    alertMask: HTMLDivElement | null = null;
    container = React.createRef<HTMLDivElement>();
    player: VideoJsPlayer | undefined;
    controllerHiddenTimer = 0;
    syncPlayerTimer = 0;
    retryCount = 0;
    decreaseRetryTimer = 0;
    noSoundSyncCount = 0;

    constructor(props: ImplProps) {
        super(props);
        this.state = {
            NoSound: false,
            MediaError: false,
            updater: false,
            controllerVisible: false,
        };

        props.room && checkWhiteWebSdkVersion(props.room);
    }

    getAttributes() {
        const { context } = this.props;
        let s = context.getAttributes();
        if (!s) return;
        s = { ...defaultAttributes, ...s };
        // 如果 s.currentTime > player.duration()，说明线上的状态大概率是错了
        if (this.player) {
            let currentTime = getCurrentTime(s, this.props);
            let duration = this.player.duration();
            if (!s.paused && currentTime > duration) {
                s = { ...s, currentTime: 0, paused: true };
                this.resetPlayer();
            }
        }
        return s;
    }

    isShowingPoster() {
        const s = this.getAttributes();
        if (!s?.src) return true;
        return AudioExts.some(e => s.src.endsWith(e));
    }

    render() {
        if (!(this.props.room || this.props.player)) {
            return null;
        }
        const s = this.getAttributes();
        if (!s) {
            return null;
        }
        const duration = (this.player?.duration() || 1e3) * 1000;
        const bufferedPercent = this.player?.bufferedPercent() || 0;

        // const controllerVisible = this.state.isAudio || this.state.controllerVisible;
        return (
            <div
                className={this.isEnabled() ? "vjs-p" : "vjs-p disabled"}
                onMouseEnter={this.showController}
                onMouseMove={this.showController}
            >
                <div className="video-js-plugin-player" ref={this.container} />
                {this.isShowingPoster() && (
                    <div className="video-js-plugin-poster">
                        {s.poster && <img src={s.poster} alt="" draggable={false} />}
                    </div>
                )}
                <PlayerController
                    duration={duration}
                    volume={s.volume}
                    setVolume={this.setVolume}
                    paused={s.paused}
                    play={this.play}
                    pause={this.pause}
                    currentTime={getCurrentTime(s, this.props) * 1000}
                    setCurrentTime={this.setCurrentTime}
                    buffered={duration * bufferedPercent}
                    visible
                />
                {this.state.NoSound && (
                    <div ref={this.setupAlert} className="videojs-plugin-muted-alert" />
                )}
                {this.state.MediaError && (
                    <div className="videojs-plugin-recovery-mode">
                        <button ref={this.setupReload}>Reload Player</button>
                    </div>
                )}
            </div>
        );
    }

    debug(msg: string, ...args: any[]) {
        if (options.verbose) {
            options.log(`[MediaPlayer] ${msg}`, ...args);
        }
    }

    showController = () => {
        this.setState({ controllerVisible: true });
        this.debounceHidingController();
    };

    play = () => {
        const hostTime = this.props.room?.calibrationTimestamp;
        this.debug(">>> play", { paused: false, hostTime });
        this.isEnabled() && this.props.plugin.putAttributes({ paused: false, hostTime });
    };

    pause = () => {
        const currentTime = getCurrentTime(this.getAttributes()!, this.props);
        this.debug(">>> pause", { paused: true, currentTime });
        this.isEnabled() && this.props.plugin.putAttributes({ paused: true, currentTime });
    };

    setVolume = (volume: number) => {
        this.debug(">>> volume", { volume });
        this.isEnabled() && this.props.plugin.putAttributes({ volume });
        this.isEnabled() && this.props.plugin.putAttributes({ volume, muted: volume === 0 });
    };

    setCurrentTime = (t: number) => {
        const hostTime = this.props.room?.calibrationTimestamp;
        this.debug(">>> seek", { currentTime: t / 1000, hostTime });
        this.isEnabled() && this.props.plugin.putAttributes({ currentTime: t / 1000, hostTime });
    };

    resetPlayer = () => {
        this.player?.autoplay(false);
        // 如果此时处于异常状态, 此 ended 事件不会同步到其他端
        if (!this.state.NoSound) {
            this.debug(">>> ended", { paused: true, currentTime: 0 });
            this.isEnabled() && this.props.plugin.putAttributes({ paused: true, currentTime: 0 });
        }
    };

    componentDidMount() {
        this.debug("app version =", Version);
        this.debug("video.js version =", videojs.VERSION);
        this.initPlayer();
        this.props.context.emitter.on("attributesUpdate", this.syncPlayerWithAttributes);
        this.syncPlayerTimer = setInterval(this.syncPlayerWithAttributes, options.syncInterval);
        this.decreaseRetryTimer = setInterval(this.decreaseRetryCount, options.retryInterval);
    }

    componentWillUnmount() {
        this.debug("unmount");
        this.props.context.emitter.off("attributesUpdate", this.syncPlayerWithAttributes);
        this.player?.dispose();
        clearInterval(this.syncPlayerTimer);
        clearInterval(this.decreaseRetryTimer);
    }

    syncPlayerWithAttributes = () => {
        const s = this.getAttributes();
        if (!s) return;

        const player = this.player;
        if (!player) return;

        // 如果此时处于异常状态，增加容错 (每 8 个 interval 同步一次)
        if (this.state.NoSound && (this.noSoundSyncCount += 1) % 8 !== 0) {
            return;
        }

        if (player.paused() !== s.paused) {
            this.debug("<<< paused -> %o", s.paused);
            if (s.paused) {
                player.pause();
            } else {
                player.play()?.catch(this.catchPlayFail);
            }
        }

        // NOTE: 2 actions below will cause error message in console (ignore them)
        if (player.muted() !== s.muted) {
            this.debug("<<< muted -> %o", s.muted);
            player.muted(s.muted);
        }

        if (player.volume() !== s.volume) {
            this.debug("<<< volume -> %o", s.volume);
            player.volume(s.volume);
        }

        const currentTime = getCurrentTime(s, this.props);
        let maxError = options.currentTimeMaxError;
        // 如果此时处于异常状态，增加同步时间的容错 (3 倍)
        if (this.state.NoSound) {
            maxError *= 3;
        }
        if (currentTime > player.duration()) {
            this.resetPlayer();
        } else if (Math.abs(player.currentTime() - currentTime) > maxError) {
            this.debug("<<< currentTime -> %o", currentTime);
            player.currentTime(currentTime);
        }
    };

    debounceHidingController = () => {
        if (this.controllerHiddenTimer) {
            clearTimeout(this.controllerHiddenTimer);
            this.controllerHiddenTimer = 0;
        }
        this.controllerHiddenTimer = setTimeout(() => {
            this.setState({ controllerVisible: false });
            this.controllerHiddenTimer = 0;
        }, 3000);
    };

    decreaseRetryCount = () => {
        if (!this.player) return;
        if (this.retryCount > 0) {
            this.retryCount = this.retryCount - 1;
        }
    };

    catchPlayFail = (err: Error) => {
        const string = String(err);
        if ((isSafari && string.includes("NotAllowedError")) || string.includes("interact")) {
            this.player?.autoplay("any");
            this.setState({ NoSound: true });
        } else {
            const mediaError = this.player?.error();
            if (mediaError) {
                if (this.retryCount <= 3) {
                    this.initPlayer();
                    this.retryCount = this.retryCount + 1;
                } else {
                    this.debug("catch videojs media error", mediaError);
                    this.setState({ MediaError: true });
                }
            }
            this.debug("catch error", err);
        }
    };

    fixPlayFail = () => {
        this.debug("try to fix play state");
        this.setState({ NoSound: false });
        const { muted, volume } = this.getAttributes()!;
        if (this.player) {
            this.player.muted(muted);
            this.player.volume(volume);
        }
    };

    initPlayer = async () => {
        this.player?.dispose();
        this.player = undefined;

        this.debug("creating elements ...");
        const { type, src, poster } = this.getAttributes()!;

        const wrapper = document.createElement("div");
        wrapper.setAttribute("data-vjs-player", "");

        const video = document.createElement("video");
        video.className = "video-js";
        poster && (video.poster = poster);

        video.setAttribute("playsInline", "");
        video.setAttribute("webkit-playsinline", "");

        const source = document.createElement("source");
        if (new URL(src).pathname.endsWith(".m3u8")) {
            source.type = "application/x-mpegURL";
        } else {
            video.src = src;
        }
        source.src = src;
        type && (source.type = type);

        video.appendChild(source);
        wrapper.appendChild(video);
        this.container.current!.appendChild(wrapper);

        // NOTE: don't remove this line!
        await nextFrame();

        this.debug("initializing videojs() ...");
        const player = videojs(video);
        this.player = player;
        (window as any).player = player;

        player.one("loadedmetadata", this.gracefullyUpdate);

        // Native RTC effect mixing check.
        const rtcAudioEffectClient: RTCEffectClient = (window as any).__mediaPlayerAudioEffectClient;
        if (rtcAudioEffectClient !== undefined) {
            setupRTCEffectMixing(rtcAudioEffectClient, player, src);
        }

        player.on("ready", () => {
            options.onPlayer?.(player);

            player.on("timeupdate", this.gracefullyUpdate);
            player.on("volumechange", this.gracefullyUpdate);
            player.on("seeked", this.gracefullyUpdate);
            player.on("play", this.gracefullyUpdate);
            player.on("pause", this.gracefullyUpdate);
            player.on("ended", this.resetPlayer);
        });

        player.on("error", this.catchPlayFail);

        this.setState({ MediaError: false });
    };

    gracefullyUpdate = () => this.setState({ updater: !this.state.updater });

    setupAlert = (element: HTMLDivElement | null) => {
        if (element) {
            element.addEventListener("touchstart", this.fixPlayFail);
            element.addEventListener("click", this.fixPlayFail);
        }
        this.alertMask = element;
    };

    setupReload = (element: HTMLButtonElement | null) => {
        if (element) {
            element.addEventListener("touchstart", this.initPlayer);
            element.addEventListener("click", this.initPlayer);
        }
    };

    isEnabled() {
        return this.props.context.getIsWritable();
    }
}
