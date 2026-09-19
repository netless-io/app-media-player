import type { NetlessApp } from "@netless/window-manager";

import React from "react";
import ReactDOM from "react-dom";
import { MediaPlayer } from "./components/MediaPlayer";

import styles from "./style.css?inline";

import { defaultAttributes, Kind } from "./constants";
import { options, setOptions } from "./options";
import type { Attributes } from "./types";

export { setOptions } from "./options";
export type { MediaPlayerOptions } from "./options";
export { Version } from "./constants";
export type { Attributes as NetlessAppMediaPlayerAttributes };

const teardownByContext = new WeakMap<object, () => void>();

const DEFAULT_SETUP_READY_TIMEOUT = 5_000;

/**
 * Wait until the video.js player instance is created (or the component
 * unmounts). A timeout resolves anyway so a slow media source never blocks
 * WindowManager's serial setup queue.
 */
const waitForPlayerReady = (playerReady: Promise<unknown>, timeoutMs: number): Promise<void> =>
  new Promise<void>(resolve => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      console.warn(
        `[MediaPlayer]: setup ready wait timed out after ${timeoutMs}ms, keeping loading in background`
      );
      settle();
    }, timeoutMs);
    playerReady.then(settle, settle);
  });

const NetlessAppMediaPlayer: NetlessApp<Attributes> & {
  teardown(context: import("@netless/window-manager").AppContext<Attributes>): void;
} = {
  kind: Kind,
  setup(context) {
    let attrs = context.getAttributes();
    if (!attrs || !attrs.src) {
      return context.emitter.emit("destroy", {
        error: new Error(`[MediaPlayer]: Missing 'attributes'.'src'.`),
      });
    }
    attrs = { ...defaultAttributes, ...attrs };

    const box = context.getBox();
    box.mountStyles(styles);

    const container = document.createElement("div");
    container.classList.add("netless-app-media-player-container");

    // Serial setup queue support: resolve setup once the video.js player
    // instance exists (or the component unmounted / the wait timed out).
    let resolvePlayerReady!: (player: unknown) => void;
    const playerReady = new Promise<unknown>(resolve => {
      resolvePlayerReady = resolve;
    });

    ReactDOM.render(
      <MediaPlayer context={context} onPlayerReady={resolvePlayerReady} />,
      container,
    );

    box.mountContent(container);

    let disposed = false;
    let offDestroy: (() => void) | undefined;
    const teardown = () => {
      if (disposed) return;
      disposed = true;
      const removeDestroy = offDestroy;
      offDestroy = undefined;
      removeDestroy?.();
      console.log("[MediaPlayer]: destroy");
      ReactDOM.unmountComponentAtNode(container);
    };
    offDestroy = context.emitter.on("destroy", teardown);

    if ((window as any).__pcmProxy) {
      offDestroy?.();
      offDestroy = undefined;
      const visibilityHandler = () => {
        if (document.visibilityState === "hidden") {
          console.log(
            "[MediaPlayer]: visibilitychange -> hidden. unmount for pcmproxy",
          );
          ReactDOM.unmountComponentAtNode(container);
        } else {
          console.log(
            "[MediaPlayer]: visibilitychange -> visible. mount for pcmproxy",
          );
          ReactDOM.render(
            <MediaPlayer context={context} onPlayerReady={resolvePlayerReady} />,
            container,
          );
        }
      };
      document.addEventListener("visibilitychange", visibilityHandler);
      const removeVisibilityListener = () => {
        document.removeEventListener("visibilitychange", visibilityHandler);
      };
      const cleanup = () => {
        removeVisibilityListener();
        teardown();
      };
      offDestroy = context.emitter.on("destroy", cleanup);
      teardownByContext.set(context, cleanup);
    } else {
      teardownByContext.set(context, teardown);
    }

    // Older WindowManager declarations model setup as synchronous even though
    // AppProxy awaits its result. Keep that source compatibility.
    // Timeout precedence: per-app AppOptions > global setOptions() > default.
    // getAppOptions is accessed defensively: older @netless/window-manager
    // typings/runtime may not expose it.
    const appOptions = (context as any).getAppOptions?.() as
      | { setupReadyTimeout?: number }
      | undefined;
    const setupReadyTimeout =
      appOptions?.setupReadyTimeout ?? options.setupReadyTimeout ?? DEFAULT_SETUP_READY_TIMEOUT;
    return waitForPlayerReady(playerReady, setupReadyTimeout) as unknown as void;
  },
  teardown(context) {
    teardownByContext.get(context)?.();
    teardownByContext.delete(context);
  },
};

export default NetlessAppMediaPlayer;
