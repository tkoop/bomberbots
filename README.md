# Bomber Bots

Bomber Bots is a small **3D browser prototype** built with [Three.js](https://threejs.org/). You move a simple block-style robot around a square **game board** with perimeter walls. The idea is to grow this into a networked game later; for now it is a local movement demo.

**Controls:** arrow keys move the robot on the board (the page prevents default scrolling on those keys).

## Requirements

- [Node.js](https://nodejs.org/) (v18 or newer is fine for this project) and npm.

## Setup

From the project directory:

```bash
npm ci
```

## How to run

### Development (recommended)

Starts the Vite dev server with hot reload and resolves dependencies (including `three`) for you:

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

### Plain static server on the repo (optional)

If you use something like `npx serve` from the **repository root** (not `dist`), the `index.html` **import map** points `three` at `node_modules`, so you still need `npm install` and must serve files over HTTP. For day-to-day work, prefer `npm run dev`.

## Project layout

| Path | Purpose |
|------|--------|
| `index.html` | Page shell and Vite entry |
| `src/main.js` | Scene, board, walls, robot, input, render loop |
| `vite.config.js` | Vite configuration (`dist` output, source maps) |

## License

ISC (see `package.json`).
