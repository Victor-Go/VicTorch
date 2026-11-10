# VicTorch

English | [简体中文](README.zh-CN.md)

Optical file transfer from a screen to a camera. The sender encodes a file into a stream of changing grid codes shown on screen; the receiver films it with a camera, decodes every frame and rebuilds the original file.

Pure front-end: no backend, no network requests. Your data never leaves the device, and the page stores nothing (no cookies, no local storage).

## Usage

1. **Speed test (optional)**: open "Speed test" on the sender and press Start. Point the receiver at the screen and open its camera; it switches to test mode by itself. After about 30 seconds the receiver shows the recommended frame rate, density, colors and error-correction ratio.
2. **Send**: choose a file, enter the recommended settings by hand and press Start. Fullscreen display is an option under the Start button and is fixed once sending starts.
3. **Receive**: open the camera and aim it at the sender's screen. When everything has arrived the whole-file CRC32 is verified, and only then is the download offered.

Notes:

- The camera needs HTTPS or localhost; GitHub Pages satisfies this.
- With a low error-correction ratio the finite mode may not finish. If unsure, choose "Send continuously" and stop it manually once the receiver is done.
- Transfer is one-way: the sender cannot know the receiver's result.
- The interface follows the browser language (English or Simplified Chinese, English as fallback) and can be switched at the top right.

## How it works

- Custom grid code: density 32–128, 2/4/8/16 colors per cell, corner finder patterns, color calibration strips and a CRC32 on every frame.
- LT fountain code (robust soliton distribution) with peeling decoding, tolerant of lost, reordered and duplicated frames.
- The speed test ramps up from conservative settings and recommends a configuration using an 85% success-rate threshold.

Contracts are in [docs/](docs/); modules and conventions are in [AGENTS.md](AGENTS.md).

## Development

```bash
npm install
npm run dev        # dev server (the camera works on localhost)
npm test
npm run build      # static output in dist/
```

Pushing to `main` runs the tests, builds, and deploys to GitHub Pages through GitHub Actions (repository Settings → Pages → Source: "GitHub Actions").

## Licenses

Dependencies and their licenses are listed in [docs/06-third-party.md](docs/06-third-party.md).
