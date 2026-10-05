# Timer App

A single-screen web timer built with Vite, React and TypeScript.

**Live:** https://timer-app.kopanasiuk.workers.dev

## Features

- Counts up from 00:00 in mm:ss and stops by itself at 59:59.
- Only the available actions are shown: Start, then Stop and Reset. Stop keeps the time, Start resumes, Reset clears it.
- The time comes from the system clock, so it stays correct after a background tab or sleep.
- Double clicks and a held Enter key start the timer only once.
- Buttons have a label and an icon: dimmed by default, white on hover, keyboard focus and press; always white on touch screens.
- Background: a soft smoke trail that follows the pointer (blue, violet, emerald). Plain black when the pointer rests, with reduced motion, or without WebGL.
- Responsive from 320 px: the whole layout scales proportionally.
- Accessibility: keyboard operation with stable focus, screen-reader announcements on state changes, forced-colors support.

## States

| State   | Display       | Buttons      |
| ------- | ------------- | ------------ |
| Idle    | 00:00         | Start        |
| Running | Time counting | Stop, Reset  |
| Paused  | Time frozen   | Start, Reset |
| Limit   | 59:59         | Reset        |

## Tech

- Vite, React, TypeScript
- IBM Plex Sans (self-hosted via `@fontsource/ibm-plex-sans`), no other runtime dependencies
- Background shader in plain WebGL, no libraries

## Getting started

Requires Node.js 22 (see `.node-version`).

```bash
npm install
npm run dev    # start the dev server
npm run build  # type-check and build to dist/
npm run lint   # lint with oxlint
```

## Project structure

```
SPEC.md                     specification and acceptance criteria
wrangler.jsonc              Cloudflare Workers config: static assets from dist/
src/
├── main.tsx                entry point: fonts, global styles, React root
├── index.css               global styles: dark color scheme, base font
├── App.tsx                 page: background layer and the timer
├── App.css                 centers the timer on the screen
└── components/
    ├── Timer/
    │   ├── Timer.tsx       display, buttons, focus handling, button animation
    │   ├── useTimer.ts     timer state: clock-based time, 59:59 limit, announcements
    │   ├── formatTime.ts   milliseconds to mm:ss
    │   ├── icons.tsx       icons for Start, Stop and Reset
    │   └── Timer.css       layout, button styles, animation, forced colors
    └── Background/
        ├── Background.tsx  starts the shader, falls back to plain black
        ├── Background.css  fixed black layer under the page
        └── flowShader.ts   WebGL shader that draws the smoke trail
```

## Deployment

Cloudflare Workers (static assets), configured in `wrangler.jsonc`.

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Non-production branch deploy command (preview builds): `npx wrangler versions upload`
