import type { VideoJsPlayer } from "video.js";

export interface MediaPlayerOptions {
    /**
     * 播放器时间和全局时间最大误差（秒）
     * 超过这个时间就会触发一次 `currentTime(globalTime)`
     * - 如果设得太小，播放器会一卡一卡的
     * - 如果设得太大，两边播放时间会相差比较远
     * @default 1
     */
    currentTimeMaxError: number;

    /**
     * 同步全局状态的时间间隔（毫秒）
     * 每隔这段时间同步一次全局状态
     * @default 1000
     */
    syncInterval: number;

    /**
     * 恢复重试间隔（毫秒）
     * 每隔这段时间恢复一次重试的机会
     * @default 15000
     */
    retryInterval: number;

    /**
     * 可以自定义播放器的接口，每次创建出一个播放器都会调一下这个函数
     */
    onPlayer?: (player: VideoJsPlayer) => void;

    /**
     * 自定义 log 函数
     */
    log: Console["log"];

    /**
     * 是否 log
     */
    verbose: boolean;

    /**
     * Max time (ms) `setup()` waits for the video.js player instance before
     * resolving anyway (loading continues in background). Also settable
     * per-app via AppOptions `setupReadyTimeout`, which takes precedence.
     * @default 5000
     */
    setupReadyTimeout?: number;
}

export const defaultOptions: MediaPlayerOptions = {
    currentTimeMaxError: 1,
    syncInterval: 1000,
    retryInterval: 15000,
    verbose: false,
    log: console.log.bind(console),
};

export let options = defaultOptions;

export function setOptions(userDefined: Partial<MediaPlayerOptions>) {
    options = { ...defaultOptions, ...userDefined };
}
