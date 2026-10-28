<p align="center">
  <img src="public/brand/brick-game-online-logo.svg" alt="Brick Game Online" width="580">
</p>

<h1 align="center">Pocket childhood — right in your browser</h1>

<p align="center">
  The familiar click of the lid, the flicker of the LCD and the sound of a tiny buzzer.<br>
  <b>A collection of pocket game toys. Dozens of games. One collection.</b>
</p>

<p align="center">
  <a href="https://brick-game.online/"><b>Open the collection →</b></a>
</p>

![Universal Brick Game](docs/screenshots/brickgame-readme.png)

![Prince 皇太子 118 in 1](docs/screenshots/prince118-desktop.png)

![TAKSUN TS-995 in the collection](docs/screenshots/toys-taksun.png)

## Open the lid. Remember your favourite game.

**Crocodile Mario, Clock+99, Sea Battle and 168 in 1 Tank** are four Apollo clamshells with their own housings, stickers and LCD screens. Jump through nine Mario levels, clear rows, drive a tank, hunt ships, build a staircase for Romeo. The shared library holds more than 50 games and variants: racing, arkanoid, snake, shooters and puzzles.

- **The toy in your hand.** An animated lid, hinges, coloured housings, LEDs and a large-screen mode. The Apollo clamshells share one moulded lower half (round buttons in dimples, arrow keys, speaker holes); labels, colours and stickers are each model's own.
- **Your way to play.** Keyboard, gamepad or touch; remappable buttons, key cheat sheets and help in Russian and English. Toys with printed Chinese labels (Prince) come with a button reference — characters, reading, meaning and keys — in the left panel.
- **Game encyclopedia.** Rules, large demonstrations and the sources of each reconstruction live in a separate searchable reference; games are ordered by rarity (Common → Ultra Rare, after the [Retro Consoles Wiki](https://retroconsoles.fandom.com/wiki/Brick_Game#Games)) and every game carries a rarity badge.
- **Familiar sound.** Synthesised effects and tunes; Mario also has a musical remaster. Several toys play public-domain melodies in a single square-wave voice.
- **Room for creativity.** A Mario level editor and a collection studio: the set of games, their order and the colours of every Apollo.

### The device catalogue

The drop-down **device catalogue** above the console (search and the categories All | Apollo | TAKSUN | Brick Game, a readiness badge on every model; see [docs/toys.md](docs/toys.md#каталог-устройств)) holds 14 devices:

| Device | What it is |
| --- | --- |
| **Brick Game** (universal) | Our own universal console in grey and black housings with a big matrix screen, every game button and its own tune. Hosts the games not assigned to other models. |
| **Crocodile Mario** | The original engine, nine levels, a level editor, a music remaster. |
| **Clock+99**, **Sea Battle**, **168 in 1 Tank** | Apollo clamshells with a game menu on the shared Brick Game engine. |
| **Apollo B0202 · 126 in 1**, **Apollo B0302 · 18 in 1** | Monoblocks with restored housings and menus; some game profiles are still being researched ([status](docs/devices/e88-b0202.md), [B0302 study](docs/devices/e23-b0302.md)). |
| **Brick Game E‑88**, **Super Brick Game E‑23 Plus Mark II** | Monoblocks; the E‑23 has the 99 menu items taken from its ROM ([notes](docs/devices/e23-b0302.md)). |
| **Mini Brick Game B‑S96** | Plays: a smiley intro, menu numbers 00–96 (00 and 01 are racing, 02–96 are Tetris variations), “Korobeiniki” once per game — see [docs/minibrick.md](docs/minibrick.md). |
| **FM‑38 · 2 in 1** | A monoblock with a Tetris demo and A/B selection ([description](docs/devices/fm38.md)). |
| **Prince 皇太子 · 118 in 1** | A brick-shaped monoblock built from the owner's front-panel photo: the William Tell finale and a rising “9 9 9 9 in 1” at power-on, then an auto-play of Tetris, racing, tanks, Frogger and Arkanoid; pick the speed and the mode and press START to play yourself ([description](docs/devices/prince118.md)). |
| **TAKSUN TS-995 · 9999 in 1**, **Alibaba Dance 99 in 1** | Exhibits: the housing is ready, the games will follow once the originals are studied ([docs/taksun.md](docs/taksun.md), [docs/alibaba.md](docs/alibaba.md)). |

The brand and the readiness of every model are set in the admin panel (a model without another brand counts as Brick Game). The LCD **“Screen segments”** switch (the faint ghost of unlit segments) is available on every toy with a live LCD. Unverified details are marked in the documentation.

The collection keeps growing: some game rules are still reconstructed approximately, and the status and sources are available in the in-app help. The in-app texts are in Russian and English; the documentation under `docs/` is in Russian.

## Run and develop

You need **Node.js 22.13+ (the 22 line) or Node.js 24+**.

```bash
npm ci
npm run dev
```

Local play needs no server storage and no secrets. Stack: **TypeScript, Vite, Canvas 2D, Web Audio**. The game cores live in `src/core`, `src/tetris` and `src/brick`; the interface is in `src/app`, sound in `src/audio`. Assets are in `public`, tests in `tests`.

```bash
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:smoke
```

**Deploy to Cloudflare Workers:** set the Worker name in `wrangler.jsonc`, sign in and run:

```bash
npx wrangler login
npx wrangler deploy
npx wrangler secret put ADMIN_TOKEN
```

The build runs automatically. The secret is a random string of at least 32 characters; it is needed to publish settings from `/admin`. The configuration is stored in Durable Objects, the initial set is in `src/config/default.json`. The level editor is available from the Mario card in `/admin`.

**Static hosting:** `npm run build`, then publish the contents of `dist`. For a subdirectory: `npm run build -- --base=/your-path/`. Without the Worker, the collection settings are published through `src/config/default.json` and a rebuild.

[Architecture](docs/architecture.md) · [Repository review and CI](docs/repository-review.md) · [Collection setup](docs/admin.md) · [Mario editor](docs/editor.md) · [Encyclopedia](docs/encyclopedia.md) · [Game catalogue and status](docs/brick/library.md) · [Sources](docs/reference-status.md) · [Third-party materials](docs/THIRD_PARTY.md)

Shared TOP-20 high scores without registration: [Cloudflare setup, categories and API](docs/leaderboards.md).
