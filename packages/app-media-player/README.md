# @netless/app-media-player

## Usage

```ts
import type { NetlessAppMediaPlayerAttributes } from "@netless/app-media-player";
import NetlessAppMediaPlayer, { setOptions } from "@netless/app-media-player";
import "video.js/dist/video-js.min.css";

setOptions({ verbose: true });

WindowManager.register(NetlessAppMediaPlayer);

manager.addApp({
    kind: NetlessAppMediaPlayer.kind,
    attributes: <NetlessAppMediaPlayerAttributes>{
        src: "https://beings.oss-cn-hangzhou.aliyuncs.com/test/aaa59a55-81ff-45e8-8185-fd72c695def4/1606277539701637%E7%9A%84%E5%89%AF%E6%9C%AC.mp4",
        type: "video/mp4",
    },
});
```

## Changelog

## 0.1.4

- iOS PCM 混音后台行为修复。

## 0.1.3

- iOS PCM 混音代理。

## 0.1.0-beta.12

- iOS 某些情况首帧黑屏修复。

### 0.1.0-beta.0

- 修复了没有权限时播放器进度条超出范围的问题。
