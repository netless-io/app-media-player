import { Player, Room } from "@netless/window-manager";
import { ImplProps } from "./components/MediaPlayer";
import { Version } from "./constants";
import { Attributes } from "./types";

export function checkWhiteWebSdkVersion(room: Room) {
    if (!room.calibrationTimestamp) {
        // prettier-ignore
        throw new Error(`@netless/app-media-player@${Version} requires white-web-sdk@^2.13.8 to work properly.`);
    }
}

export function nextFrame() {
    return new Promise(r => (window.requestAnimationFrame || window.setTimeout)(r));
}

export function getCurrentTime(attributes: Attributes, props: ImplProps) {
    if (attributes.paused) {
        return attributes.currentTime;
    }
    const now = getTimestamp(props);
    if (now) {
        return attributes.currentTime + (now - attributes.hostTime) / 1000;
    } else {
        return attributes.currentTime;
    }
}

export function getTimestamp(props: { player?: Player; room?: Room }) {
    if (props.player) {
        return props.player.beginTimestamp + props.player.progressTime;
    }
    if (props.room) {
        return props.room.calibrationTimestamp;
    }
}

export const isSafari = navigator.userAgent.includes("Safari");
