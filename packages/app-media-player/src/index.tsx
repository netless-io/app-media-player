import type { NetlessApp } from "@netless/window-manager";

import React from "react";
import ReactDOM from "react-dom";
import { MediaPlayer } from "./components/MediaPlayer";

import styles from "./style.css?inline";

import { defaultAttributes, Kind } from "./constants";
import type { Attributes } from "./types";

export { setOptions } from "./options";
export type { MediaPlayerOptions } from "./options";
export { Version } from "./constants";
export type { Attributes as NetlessAppMediaPlayerAttributes };

const teardownByContext = new WeakMap<object, () => void>();

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
    ReactDOM.render(<MediaPlayer context={context} />, container);

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
          ReactDOM.render(<MediaPlayer context={context} />, container);
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
  },
  teardown(context) {
    teardownByContext.get(context)?.();
    teardownByContext.delete(context);
  },
};

export default NetlessAppMediaPlayer;
