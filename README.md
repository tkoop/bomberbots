# Bomber Bots

Bomber Bots is a small **3D browser game** built with [Vue 3](https://vuejs.org/) and [Three.js](https://threejs.org/). You control a block-style robot on a walled board. **Multiplayer** uses a **Socket.IO** game server in `server/`: players in the same session see each other, and movement is simulated on the server.

**Controls:** arrow keys (default browser scrolling is suppressed for those keys).

## Requirements

- [Node.js](https://nodejs.org/) (v18 or newer is fine for this project) and npm.

## Setup

From the project directory:

```bash
npm install
```

Install the game server’s dependencies once (separate `package.json` under `server/`):

```bash
npm --prefix server install
```

## Game server

**You need the game server running** for multiplayer. The client does not show other players without it.

- Listens on **port 3001** by default (override with `PORT`, e.g. `PORT=4000 npm run server`).
- In **development**, Vite proxies `/socket.io` to the server, so start the server and the Vite dev app as **two processes** (two terminals).

Start the server from the repo root:

```bash
npm run server
```

You should see a log line that the game server is listening on `http://localhost:3001`.

For a **production** build or if the client is not served by Vite’s dev proxy, set **`VITE_SOCKET_URL`** when building or in env so the browser knows where to connect (e.g. `https://your-api.example.com`).

## How to run

### Development (recommended)

1. Start the game server (see [Game server](#game-server) above).
2. Start the Vite dev server with hot reload:

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

Then open the URL shown (often `http://localhost:4173/`). You can also serve `dist` with any static file server, with the **server root** set to the `dist` folder so asset paths resolve correctly. Remember to run the **game server** and configure **`VITE_SOCKET_URL`** if the Socket.IO API is not on the same origin as the static site.

The app uses `.vue` files and must be run through **Vite** (`npm run dev` / `npm run build`). Serving the repo root with a plain static server and opening `index.html` directly will not work.

## Project layout

| Path | Purpose |
|------|--------|
| `index.html` | Page shell (`#app` mount) and Vite entry |
| `src/main.js` | Vue app bootstrap (`createApp`) |
| `src/App.vue` | Shell before the game view |
| `src/components/GameBoard.vue` | Three.js scene, board, robots, networking, render loop |
| `server/` | Node **Socket.IO** game server (`npm run server` from root) |
| `vite.config.js` | Vite + `@vitejs/plugin-vue` (`dist` output, dev proxy to game server) |
| `package.json` | Root app dependencies and scripts |

## License

MIT — see [`LICENSE`](LICENSE).
