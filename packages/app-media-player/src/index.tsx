import type { NetlessApp } from "@netless/window-manager";

import React from "react";
import ReactDOM from "react-dom";
import { MediaPlayer } from "./components/MediaPlayer";

import styles from "./style.css?inline";

import { defaultAttributes, Kind } from "./constants";
import { options, setOptions } from "./options";
import { report } from "./logger";
import { waitForPlayerReady } from "./setup-ready";
import type { Attributes } from "./types";

export { setOptions } from "./options";
export type { MediaPlayerOptions } from "./options";
export { Version } from "./constants";
export type { Attributes as NetlessAppMediaPlayerAttributes };

const teardownByContext = new WeakMap<object, () => void>();

const DEFAULT_SETUP_READY_TIMEOUT = 5_000;

const NetlessAppMediaPlayer: NetlessApp<Attributes> & {
  teardown(context: import("@netless/window-manager").AppContext<Attributes>): void;
} = {
  kind: Kind,
  setup(context) {
    let attrs = context.getAttributes();
    if (!attrs || !attrs.src) {
      const error = new Error(`[MediaPlayer]: Missing 'attributes'.'src'.`);
      report(context, "error", error.message, error);
      return context.emitter.emit("destroy", {
        error,
      });
    }
    attrs = { ...defaultAttributes, ...attrs };

    const box = context.getBox();
    box.mountStyles(styles);

    const container = document.createElement("div");
    container.classList.add("netless-app-media-player-container");

    // Serial setup queue support: new lazy hosts await the player; legacy
    // hosts keep the bounded wait after a warning.
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
      ReactDOM.unmountComponentAtNode(container);
    };
    offDestroy = context.emitter.on("destroy", teardown);

    if ((window as any).__pcmProxy) {
      offDestroy?.();
      offDestroy = undefined;
      const visibilityHandler = () => {
        if (document.visibilityState === "hidden") {
          ReactDOM.unmountComponentAtNode(container);
        } else {
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
    return waitForPlayerReady(playerReady, setupReadyTimeout, context) as unknown as void;
  },
  teardown(context) {
    teardownByContext.get(context)?.();
    teardownByContext.delete(context);
  },
};

export default NetlessAppMediaPlayer;
