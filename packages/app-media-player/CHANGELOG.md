# Changelog

## 0.1.6 (2026-09-27)

- Wait for the actual player ready signal in lazy WindowManager hosts; keep the bounded setup wait for older hosts.
- Route diagnostics through WindowManager or Room logging, including playback and RTC effect failures.
- Remove RTC effect listeners when the player is disposed and ignore late position responses.

## 0.1.5 (2026-09-23)

- Add a bounded player setup ready wait and a configurable `setupReadyTimeout`.
- Add idempotent teardown and cancel pending player initialization after unmount.
