# Arduino Web Compiler

Browser-based Arduino IDE with remote compilation through Vercel Serverless Functions and GitHub Actions.

Write Arduino / ESP32 sketches in the browser, attach extra project files, compile them in GitHub Actions, and flash the generated firmware from the web UI — no local IDE required.

## Features

**Editor**
- Monaco code editor with Arduino snippets, syntax highlighting, and autocomplete.
- Editor settings overlay: font size, tab size, word wrap, line numbers, minimap toggle.
- Auto-format code (`Ctrl+Shift+F`) — normalises braces, spacing, and trailing whitespace.
- Keyboard shortcuts dialog (`Ctrl+/`) with all editor and app hotkeys.
- Lightweight pre-compile diagnostics for common syntax mistakes.

**Compilation**
- Remote compile using `arduino-cli` inside GitHub Actions.
- Board selector: Arduino Uno, Nano, Mega, ESP32, ESP32-S3, ESP32-C3.
- Live GitHub Actions build progress in the web UI with per-step status.
- Build cancellation — stop an in-progress compile from the UI.
- Compile error parsing — on build failure, logs are fetched and parsed into Monaco markers and a Problems panel with file/line/message.

**Project Management**
- Extra project files: `.h`, `.hpp`, `.cpp`, `.c`, `.ino`, `.txt`, `.json`.
- File tab context menu — right-click to rename or delete files.
- Project ZIP export/import with board, library, and Smart Wi-Fi settings.
- Export Arduino IDE (`Export .INO`) — creates a folder structure with the main sketch renamed to match the folder name, ready for Arduino IDE.
- Wokwi project export with `diagram.json`, `libraries.txt`, `wokwi.toml`, and optional latest firmware.

**Libraries**
- Library manager with common Arduino libraries — insert `#include` with a click.
- ZIP library upload through the Vercel API.

**Serial & Plotting**
- Serial Monitor using Web Serial API.
- Serial Plotter — real-time canvas line chart; numeric CSV data from the serial port auto-plots with multiple coloured traces.

**Flashing**
- AVR flashing through `arduino-web-uploader`.
- ESP32 flashing through `esp-web-tools`.
- Build artifacts published to the `builds` branch.

**Other**
- Smart Wi-Fi for ESP32: generated captive portal fallback when the board cannot connect.
- PWA install support with offline app shell caching.
- On-screen status bar with build and connection state.

## Architecture

```text
Browser
  |
  | POST /api/compile
  v
Vercel Serverless Function
  |
  | writes .compile-requests/request-*.json to GitHub
  | sends repository_dispatch
  v
GitHub Actions
  |
  | restores sketch + attached files
  | runs arduino-cli compile
  | pushes firmware artifacts
  v
builds branch
  |
  | raw.githubusercontent.com/.../builds
  v
Web flasher

Browser
  |
  | GET /api/status?request_id=...
  | GET /api/logs?run_id=...         (on failure)
  v
Vercel Serverless Function
  |
  | reads GitHub Actions run + job steps
  v
Build Progress panel / Problems panel
```

## Repository Layout

```text
.
├── index.html                  # Main web app (all UI, logic, styles)
├── api/
│   ├── compile.js              # Vercel API for triggering compile
│   ├── status.js               # Vercel API for reading Actions progress
│   ├── cancel.js               # Vercel API for cancelling a running build
│   ├── logs.js                 # Vercel API for fetching build logs
│   └── upload-library.js       # Vercel API for uploading ZIP libraries
├── .github/workflows/
│   └── compile.yml             # Arduino / ESP32 compile workflow
├── libraries/                  # Custom ZIP libraries used by GitHub Actions
└── site.webmanifest
```

## Deployment

This project should be deployed on **Vercel**, not GitHub Pages.

GitHub Pages can serve `index.html`, but it cannot run the Node.js files in `api/`. The compile, cancel, logs, and ZIP upload features require Vercel Serverless Functions.

## Required Setup

### 1. GitHub Token

Create a GitHub token and add it to Vercel as:

```text
MY_GITHUB_TOKEN
```

The token must be able to:

- create files in the repository contents;
- trigger `repository_dispatch`;
- cancel workflow runs;
- read action logs;
- update files in `libraries/` if ZIP upload is used.

For a classic token, `repo` permission is usually enough for a private repository. For a fine-grained token, allow access to this repository with read/write Contents and read/write Actions metadata.

### 2. GitHub Actions Permissions

In GitHub:

```text
Settings → Actions → General → Workflow permissions
```

Enable:

```text
Read and write permissions
```

### 3. Repository Name

The current code points to:

```text
Narek-D8v/arduino-web-compiler
```

If you fork or rename the project, update the repository name everywhere it appears — see the **Required Setup → Repository Name** section of previous README versions, or simply search for `Narek-D8v` in the source files and the API functions.

## How Compile Works

When the user clicks **Compile**:

1. The browser sends the main sketch and attached files to `/api/compile`.
2. `api/compile.js` sanitises file names.
3. The API writes a temporary `.compile-requests/request-*.json` file to the repository.
4. The API triggers GitHub Actions with `repository_dispatch` and returns `request_id`.
5. `.github/workflows/compile.yml` reads the temporary project file.
6. The workflow writes `build_sketch/build_sketch.ino` plus all attached files.
7. `arduino-cli compile` builds the project.
8. The output firmware is pushed to the `builds` branch.
9. The workflow removes the temporary compile request file.

The browser polls `/api/status?request_id=<id>` and displays the GitHub Actions run status, job steps, result, and an **Open Actions** link. On failure, `/api/logs?run_id=<id>` is called to parse errors and populate the **Problems** panel with Monaco markers.

## Build Cancellation

During an active build, a **Cancel** button appears in the build progress pane. Clicking it sends a `POST` to `/api/cancel` with the `run_id`, which calls the GitHub Actions cancel API for that run.

## Compile Error Parsing

When a build fails, the app automatically fetches the workflow logs via `/api/logs`, parses them for `error:` / `warning:` lines with file paths and line numbers, and:

- Adds Monaco editor markers underlining the problematic lines.
- Populates the **Problems** panel with file, position, and message.
- Logs a summary to the Serial Monitor.

## Editor Settings

Click the **Settings** (gear) button in the toolbar to open the editor settings overlay:

- **Font Size** — slider (10–32 px)
- **Tab Size** — slider (1–8)
- **Word Wrap** — on/off toggle
- **Line Numbers** — on/off toggle
- **Minimap** — on/off toggle

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save project |
| `Ctrl+Shift+F` | Format code |
| `Ctrl+L` | Open library manager |
| `F8` | Focus first compile error |
| `Ctrl+/` | Show keyboard shortcuts |
| `Ctrl+Tab` | Switch to next file tab |
| `Escape` | Close any open overlay |

## Serial Plotter

The Serial Plotter renders a real-time canvas line chart from numeric serial data.

- **Toggle** — enable/disable plotting while the serial monitor is open.
- **Clear** — reset the plot.
- **Data format** — comma-separated numbers on a single line, e.g. `512, 340, 128`. Each column becomes a separate coloured trace.
- **Buffer** — shows the last 200 samples by default.
- **Grid** — faint horizontal grid lines for reference.

## Auto-Format

`Ctrl+Shift+F` or the **Format** toolbar button runs a built-in formatter that:

- Strips trailing whitespace.
- Normalises line endings (`\r\n` → `\n`).
- Collapses excess blank lines.
- Ensures a space after `if`, `for`, `while`, `switch`, `catch`.
- Normalises spacing around braces and commas.

This is a lightweight formatter and not a full `clang-format` replacement.

## File Context Menu

Right-click any file tab to open a context menu with:

- **Rename** — renames the file (duplicate names are rejected).
- **Delete** — removes the file from the project (confirm dialog on non-empty files).

## Export Arduino IDE

The **Export .INO** button creates a ZIP with the Arduino IDE folder structure:

```
projectname/
  projectname.ino   (sketch.ino is renamed)
  other files...
```

This matches Arduino IDE's requirement that the main `.ino` file name matches its parent folder name.

## Attached Project Files

The web app supports extra files, similar to Wokwi-style projects.

Supported file extensions in the workflow:

```text
.h .hpp .hh .c .cpp .cc .ino .txt .json .csv
```

Use **+ File** to create a new file in the browser, or **Attach** to add files from your computer.

Example:

```cpp
// sketch.ino
#include "Blinker.h"

Blinker led(LED_BUILTIN);

void setup() {
  led.begin();
}

void loop() {
  led.tick();
}
```

```cpp
// Blinker.h
#pragma once
#include <Arduino.h>

class Blinker {
public:
  explicit Blinker(uint8_t pin);
  void begin();
  void tick();

private:
  uint8_t pin_;
  bool state_ = false;
};
```

```cpp
// Blinker.cpp
#include "Blinker.h"

Blinker::Blinker(uint8_t pin) : pin_(pin) {}

void Blinker::begin() {
  pinMode(pin_, OUTPUT);
}

void Blinker::tick() {
  state_ = !state_;
  digitalWrite(pin_, state_ ? HIGH : LOW);
  delay(500);
}
```

For `.cpp` files, include Arduino types manually:

```cpp
#include <Arduino.h>
```

The workflow intentionally ignores `Arduino.h` during library installation because it is provided by the selected Arduino core.

## Smart Wi-Fi

For ESP32 boards, enable **Smart Wi-Fi** in the Captive Portal Wizard before compiling.

During GitHub Actions compilation, the workflow generates:

```text
smart_wifi.h
secrets.h
```

It injects:

```cpp
#include "smart_wifi.h"
SmartWiFi.begin();
SmartWiFi.handle();
```

If the ESP32 cannot connect within the configured timeout, it starts a setup access point and captive portal. Credentials saved there are stored in ESP32 NVS through `Preferences`, then the board restarts and connects normally.

## Wokwi

Use **Wokwi ZIP** to export a simulation-ready project. The export includes:

```text
sketch.ino and attached project files
diagram.json
libraries.txt
wokwi.toml
firmware.hex or firmware.bin when the latest build artifact is available
```

**Open Wokwi** opens the matching Wokwi starter template for the selected board.

## Editor Diagnostics

The editor uses Monaco markers to show lightweight diagnostics before compilation.

Diagnostics run while you type and can also be triggered manually with the **Check** button in the toolbar.

It can catch common issues such as:

- unclosed brackets, braces, and parentheses;
- unexpected closing brackets;
- unclosed string or character literals;
- malformed `#include` lines;
- `#include` lines ending with `;`;
- stray standalone identifiers outside a declaration;
- missing `void setup()` or `void loop()` in `sketch.ino`;
- common Arduino typos like `Serial.Begin`, `serial`, `pinmode`, and `digitalwrite`.

This is intentionally not a full C++ compiler or `clangd` language server. The final source of truth is still the GitHub Actions compile step.

## Libraries

The Library Manager can insert common `#include` lines into the sketch.

During compilation, the workflow scans all project files for includes:

```bash
#include <SomeLibrary.h>
```

Known libraries are installed by name through `arduino-cli lib install`.

Custom ZIP libraries can be uploaded through `/api/upload-library`; they are stored under:

```text
libraries/
```

The workflow installs ZIP libraries from this folder before compiling.

## Firmware Artifacts

For AVR boards, the workflow publishes:

```text
firmware.hex
```

For ESP32 boards, the workflow publishes:

```text
firmware.bin
bootloader.bin
partitions.bin
boot_app0.bin
manifest.json
```

If Arduino CLI produces a merged binary, the workflow also publishes:

```text
merged-firmware.bin
```

The ESP32 flash button loads:

```text
https://raw.githubusercontent.com/<user>/<repo>/builds/manifest.json
```

## Browser Requirements

Flashing and Serial Monitor require a browser with Web Serial support.

Recommended:

- Google Chrome
- Microsoft Edge

The site must be served over HTTPS. Vercel provides HTTPS automatically.

## Common Problems

### GitHub API error: 422

Usually means the `repository_dispatch` payload was invalid or too large. This project avoids that by storing the project in `.compile-requests/request-*.json` and sending only the path in `repository_dispatch`.

### GitHub upload error: 403

The Vercel token cannot write to the repository. Check `MY_GITHUB_TOKEN` permissions.

### GitHub upload error: 409

The target branch may be protected or there may be a conflicting update. If `main` is protected, use a separate branch for compile requests or relax branch protection for this automated path.

### ESP32 Flash Button Cannot Find Manifest

Make sure an ESP32 build completed successfully and the `builds` branch contains `manifest.json`.

### `Arduino.h` Not Found

Usually this means the selected core was not installed or the FQBN is wrong. The workflow installs `arduino:avr` and `esp32:esp32`, and uses the `fqbn` selected in the browser.

## License

See `LICENSE`.
