# Testing the plugin in Photoshop

What actually works for driving Photoshop and UDT from a terminal, and the traps that cost an hour
the first time. Written after the Step 3 session; extend it rather than rediscovering it.

## The trap that matters most

**Edits made by script do not trigger re-analysis.** Running `selection.fill` (or anything else)
through `do javascript` changes the document but does not emit `historyStateChanged`, which is the
only event `src/uxp/events.ts` listens for. The panel stays empty and it looks exactly like a broken
bridge.

Use a script to _create and prepare_ the test document — that part works and gives a deterministic
palette to compare against — but trigger the analysis through the UI (⌘U → OK, Curves, Levels).

## A deterministic test document

Colors chosen to match what the pipeline test already pins, so the panel can be checked against an
expected answer instead of judged by eye:

```js
var doc = app.documents.add(400, 400, 72, "HarmonyTest", NewDocumentMode.RGB);
// 75% red over 25% blue -> two dots, hue 0 and 240, weights 0.75 and 0.25
```

On screen that has to render as: red dot at the top of the wheel, blue dot in the lower-left
quadrant, red dot larger by a factor of √3 in radius, and a bar split roughly 75/25.

## Driving the machine

`mcp__computer-use` is not usable here — its screenshots fail and its cursor lands on a phantom
monitor at negative coordinates. What works, all from a shell:

| Need                          | Command                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| Screenshot                    | `screencapture -x -t png out.png`, region via `-R x,y,w,h`                                         |
| One window, even when covered | `screencapture -x -o -l <windowID>`                                                                |
| Window IDs                    | `CGWindowListCopyWindowInfo` via Python `ctypes`                                                   |
| Clicks and keys               | `CGEventCreateMouseEvent` / `CGEventCreateKeyboardEvent` via `ctypes`                              |
| Photoshop scripting           | `osascript -e 'tell application "Adobe Photoshop 2026" to do javascript (read POSIX file "…jsx")'` |

Notes worth having up front:

- The floating plugin panel is the **unnamed** window owned by the Photoshop process. Capturing it
  by window ID is the only way to see it while a terminal sits on top.
- `osascript` cannot click: `click at` returns "osascript is not allowed assistive access", even
  though reading the accessibility tree through System Events works.
- The screen is 3840×2160 pixels but 1920×1080 points. Clicks take points, screenshots produce
  pixels, so halve any coordinate read off an image.
- The first `do javascript` call raises a macOS permission dialog and blocks until someone answers it.
- Reload the plugin with **Reload** in its row in UDT (raise the main window first). Reopen the panel
  from **Plugins → Color Harmony Wheel → Color Harmony Wheel** — that entry is a toggle, so check the
  window list instead of clicking blind. Photoshop's own theme cycles with Shift+F1 / Shift+F2.

## When the panel misbehaves

**Do not trust the UDT debugger window.** After a reload it can keep showing the previous session's
bundle, and `Debug Selected` may not open a fresh one — so an empty console proves nothing.

The faster route is to render diagnostics into the panel itself and read them off a window capture:
a counter of received bridge messages on the WebView side, and on the UXP side whether the sink is
connected, whether the handshake landed, and how far the pipeline got
(`subscribed → tick → analyze → publish → send`). That chain is what turns "the panel is empty" into
a specific missing step. Strip the diagnostics before committing.
