# Arduino Web Compiler

Browser-based Arduino IDE with remote compilation through Vercel Serverless Functions and GitHub Actions.

The app lets you write Arduino / ESP32 sketches in the browser, attach extra project files, compile them in GitHub Actions, and flash the generated firmware from the web UI.

https://arduino-web-compiler.vercel.app/

## Features

- Monaco code editor with Arduino snippets and autocomplete.
- Lightweight pre-compile diagnostics for common syntax mistakes.
- Board selector for Arduino Uno, Nano, Mega, ESP32, ESP32-S3, and ESP32-C3.
- Remote compile using `arduino-cli` inside GitHub Actions.
- Extra project files like `.h`, `.hpp`, `.cpp`, `.c`, `.ino`, `.txt`, and `.json`.
- Library manager with common Arduino libraries.
- ZIP library upload through the Vercel API.
- Live GitHub Actions build progress in the web UI.
- AVR flashing through `arduino-web-uploader`.
- ESP32 flashing through `esp-web-tools`.
- Serial Monitor using Web Serial API.
- Build artifacts are published to the `builds` branch.

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
  v
Vercel Serverless Function
  |
  | reads GitHub Actions run + job steps
  v
Build Progress panel
```

## Repository Layout

```text
.
├── index.html                  # Main web app
├── api/
│   ├── compile.js              # Vercel API for triggering compile
│   ├── status.js               # Vercel API for reading Actions progress
│   └── upload-library.js       # Vercel API for uploading ZIP libraries
├── .github/workflows/
│   └── compile.yml             # Arduino / ESP32 compile workflow
├── libraries/                  # Custom ZIP libraries used by GitHub Actions
└── site.webmanifest
```

## Deployment

This project should be deployed on Vercel, not only GitHub Pages.

GitHub Pages can serve `index.html`, but it cannot run the Node.js files in `api/`. The compile and ZIP upload features require Vercel Serverless Functions.

## Required Setup

### 1. GitHub Token

Create a GitHub token and add it to Vercel as:

```text
MY_GITHUB_TOKEN
```

The token must be able to:

- create files in the repository contents;
- trigger `repository_dispatch`;
- update files in `libraries/` if ZIP upload is used.

For a classic token, `repo` permission is usually enough for a private repository.

For a fine-grained token, allow access to this repository with read/write Contents access.

### 2. GitHub Actions Permissions

In GitHub:

```text
Settings -> Actions -> General -> Workflow permissions
```

Enable:

```text
Read and write permissions
```

The workflow also declares:

```yaml
permissions:
  contents: write
```

### 3. Repository Name

The current code points to:

```text
Narek-D8v/arduino-web-compiler
```

If you fork or rename the project, update the repository name in:

- `index.html`
- `api/compile.js`
- `api/upload-library.js`

In `index.html`, update:

```js
const BUILDS = 'https://raw.githubusercontent.com/Narek-D8v/arduino-web-compiler/builds';
```

In the API files, update:

```js
const username = 'Narek-D8v';
const repo = 'arduino-web-compiler';
```

## How Compile Works

When the user clicks `Compile`:

1. The browser sends the main sketch and attached files to `/api/compile`.
2. `api/compile.js` sanitizes file names.
3. The API writes a temporary `.compile-requests/request-*.json` file to the repository.
4. The API triggers GitHub Actions with `repository_dispatch` and returns `request_id`.
5. `.github/workflows/compile.yml` reads the temporary project file.
6. The workflow writes:

```text
build_sketch/build_sketch.ino
build_sketch/*.h
build_sketch/*.cpp
...
```

7. `arduino-cli compile` builds the project.
8. The output firmware is pushed to the `builds` branch.
9. The workflow removes the temporary compile request file.

The browser polls:

```text
/api/status?request_id=<request_id>
```

and displays the GitHub Actions run status, job steps, result, and an `Open Actions` link.

## Attached Project Files

The web app supports extra files, similar to Wokwi-style projects.

Supported file extensions in the workflow:

```text
.h .hpp .hh .c .cpp .cc .ino .txt .json
```

Use `+ File` to create a new file in the browser, or `Attach` to add files from your computer.

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

## Editor Diagnostics

The editor uses Monaco markers to show lightweight diagnostics before compilation.

Diagnostics run while you type and can also be triggered manually with the `Check` button in the toolbar.

It can catch common issues such as:

- unclosed brackets, braces, and parentheses;
- unexpected closing brackets;
- unclosed string or character literals;
- malformed `#include` lines;
- `#include` lines ending with `;`;
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

Usually means the `repository_dispatch` payload was invalid or too large.

This project avoids that by storing the project in `.compile-requests/request-*.json` and sending only the path in `repository_dispatch`.

### GitHub upload error: 403

The Vercel token cannot write to the repository.

Check `MY_GITHUB_TOKEN` permissions.

### GitHub upload error: 409

The target branch may be protected or there may be a conflicting update.

If `main` is protected, use a separate branch for compile requests or relax branch protection for this automated path.

### ESP32 Flash Button Cannot Find Manifest

Make sure an ESP32 build completed successfully and the `builds` branch contains:

```text
manifest.json
```

### `Arduino.h` Not Found

Usually this means the selected core was not installed or the FQBN is wrong.

The workflow installs:

```text
arduino:avr
esp32:esp32
```

and uses the `fqbn` selected in the browser.

## License

See `LICENSE`.
