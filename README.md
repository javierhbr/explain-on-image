# ExplainOnImage

Offline desktop tool for capturing screenshots and annotating them for tutorials (numbers, arrows, rectangles, text, redaction). Built with Electron. No accounts, external services or network connection are needed once installed.

## Requirements

- **Node.js 22.12 or later** (`node -v` to check — older versions are rejected by `engines` in `app/package.json`)
- npm (ships with Node.js)
- Git
- A graphical desktop session (macOS or Windows)

## Install and run from source

```bash
git clone https://github.com/javierhbr/explain-on-image.git
cd explain-on-image/app
npm ci
npm start
```

`npm ci` installs the pinned versions from `app/package-lock.json`, including Electron 45.0.0. If you install with scripts disabled (`--ignore-scripts`), download the Electron binary manually:

```bash
node node_modules/electron/install.js
```

## Build the desktop app

From `app/`:

```bash
npm run package
```

This writes two builds to `dist/` at the repository root:

- `dist/ExplainOnImage-darwin-arm64/ExplainOnImage.app` — macOS (Apple Silicon)
- `dist/ExplainOnImage-win32-x64/ExplainOnImage.exe` — Windows 10/11 x64 (keep the whole folder next to the `.exe`)

After building, you can also open the app with the launchers in the repository root:

- macOS: double-click `Iniciar ExplainOnImage.command`
- Windows: double-click `Iniciar ExplainOnImage Windows.cmd`

The builds are not code-signed or notarized. On macOS, if Gatekeeper blocks the first launch, right-click the app and choose **Open**. On Windows, SmartScreen may show its usual warning for unsigned apps.

## macOS screen recording permission

Capturing a screen region requires the Screen Recording permission. Enable it in **System Settings > Privacy & Security > Screen Recording** for ExplainOnImage (or for Electron when running with `npm start`), then restart the app. The in-app **Check permissions** dialog shows the current status and links to the settings pane.

Opening or pasting existing PNG/JPG images works without this permission.

## Tests

From `app/`:

```bash
npm test                  # unit tests
npm run test:regressions  # rendering regression tests
npm run test:desktop      # end-to-end desktop tests (uses real mouse, keyboard, disk and clipboard)
```

Desktop tests need a graphical session and should be run while you are not using the machine.

## More documentation

- `LEEME.md` — user guide (Spanish)
- `app/DESIGN.md` — design notes
- `verification/VERIFICACION.md` — verification results and known limits
