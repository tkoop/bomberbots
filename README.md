# Bomber Bots

Bomber Bots is a small **3D browser prototype** built with [Vue 3](https://vuejs.org/) and [Three.js](https://threejs.org/). You move a simple block-style robot around a square **game board** with perimeter walls. The first screen asks for your **name** and a **room name**; after you click **Play**, the 3D game loads (no URL routing). Your **player name** and **room name** are saved in `localStorage` and filled in the next time you open the lobby. If nothing is saved yet, the room defaults to the weekday and time of day (e.g. `tuesday-afternoon`), and the name defaults to the **surname** word from a random [`docker-names`](https://www.npmjs.com/package/docker-names) pair, in **title case** without digits (e.g. `Bohr`). The plan is to use those fields for multiplayer later; for now they are only stored on the client.

**Controls:** arrow keys move the robot on the board (the page prevents default scrolling on those keys).

## Requirements

- [Node.js](https://nodejs.org/) (v18 or newer is fine for this project) and npm.

## Setup

From the project directory:

```bash
npm install
```

## How to run

### Development (recommended)

Starts the Vite dev server with hot reload. Vue single-file components and `three` are compiled and bundled for you:

```bash
npm run dev
```

Open the URL Vite prints in the terminal (usually `http://localhost:5173/`).

### Production build

Create an optimized bundle in `dist/`:

```bash
npm run build
```

Preview that build locally:

```bash
npm run preview
```

Then open the URL shown (often `http://localhost:4173/`). You can also serve `dist` with any static file server, with the **server root** set to the `dist` folder so asset paths resolve correctly.

The app uses `.vue` files and must be run through **Vite** (`npm run dev` / `npm run build`). Serving the repo root with a plain static server and opening `index.html` directly will not work.

## Project layout

| Path | Purpose |
|------|--------|
| `index.html` | Page shell (`#app` mount) and Vite entry |
| `src/main.js` | Vue app bootstrap (`createApp`) |
| `src/App.vue` | Lobby form (name + room) then mounts the game |
| `src/components/GameBoard.vue` | Three.js scene, board, walls, robot, input, render loop |
| `vite.config.js` | Vite + `@vitejs/plugin-vue` (`dist` output, source maps) |
| `package.json` | Dependencies include Vue, Three.js, **`docker-names`** (default screen name) |

## License

ISC (see `package.json`).
