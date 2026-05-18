import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createKeyState, stepPlayer, ARROW_KEYS, resolveCollisionsInRoom } from './sim.js';

const PORT = Number(process.env.PORT) || 3001;
const TICK_HZ = 30;
const TICK_MS = 1000 / TICK_HZ;
const SIM_DT = 1 / TICK_HZ;

const ARROW_SET = new Set(ARROW_KEYS);

function ts() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(`[${ts()}]`, ...args);
}

/** @type {Map<string, Map<string, { name: string, skinColor: string, x: number, z: number, ry: number, keys: Record<string, boolean> }>>} */
const rooms = new Map();

function getRoom(roomName) {
  let m = rooms.get(roomName);
  if (!m) {
    m = new Map();
    rooms.set(roomName, m);
  }
  return m;
}

function removeFromRoom(roomName, socketId) {
  const m = rooms.get(roomName);
  if (!m) return;
  m.delete(socketId);
  if (m.size === 0) {
    rooms.delete(roomName);
  }
}

function sanitizeRoomName(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, 48);
}

function sanitizePlayerName(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, 32);
}

const DEFAULT_SKIN = '#6a7a8a';

function sanitizeSkinColor(raw) {
  if (typeof raw !== 'string') return DEFAULT_SKIN;
  const s = raw.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(s) ? s.toLowerCase() : DEFAULT_SKIN;
}

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173',
      'http://127.0.0.1:4173',
    ],
    methods: ['GET', 'POST'],
  },
});

function runSimTick() {
  for (const [roomName, room] of rooms) {
    if (room.size === 0) continue;
    const snap = new Map();
    for (const [id, p] of room) {
      snap.set(id, { x: p.x, z: p.z, ry: p.ry });
    }
    for (const [id, p] of room) {
      stepPlayer(p, id, snap, SIM_DT);
    }
    resolveCollisionsInRoom(room);
    const players = [];
    for (const [id, p] of room) {
      players.push({ id, name: p.name, skinColor: p.skinColor, x: p.x, z: p.z, ry: p.ry });
    }
    io.to(roomName).emit('state:update', { players });
  }
}

const simInterval = setInterval(runSimTick, TICK_MS);

io.on('connection', (socket) => {
  /** @type {string | null} */
  let joinedRoom = null;

  const transport = socket.conn?.transport?.name ?? '?';
  log('connect', socket.id, `transport=${transport}`, `remote=${socket.handshake.address}`);

  socket.onAny((event, ...args) => {
    if (event === 'join' || event === 'input:keydown' || event === 'input:keyup') {
      return;
    }
    const preview =
      args.length === 0
        ? ''
        : typeof args[0] === 'object'
          ? JSON.stringify(args[0])
          : String(args[0]);
    log('→ event', socket.id, event, preview || '(no payload)');
  });

  socket.on('join', (payload, ack) => {
    const roomName = sanitizeRoomName(payload?.roomName);
    const playerName = sanitizePlayerName(payload?.playerName);
    const skinColor = sanitizeSkinColor(payload?.skinColor);
    if (!roomName || !playerName) {
      log('join rejected', socket.id, { roomName: payload?.roomName, playerName: payload?.playerName });
      if (typeof ack === 'function') {
        ack({ ok: false, error: 'Missing room or player name.' });
      }
      return;
    }

    if (joinedRoom) {
      log('leave room (rejoin)', socket.id, `room=${joinedRoom}`);
      socket.leave(joinedRoom);
      removeFromRoom(joinedRoom, socket.id);
    }

    socket.join(roomName);
    joinedRoom = roomName;

    const room = getRoom(roomName);
    const others = [];
    for (const [id, p] of room) {
      others.push({ id, name: p.name, skinColor: p.skinColor, x: p.x, z: p.z, ry: p.ry });
    }

    room.set(socket.id, {
      name: playerName,
      skinColor,
      x: 0,
      z: 0,
      ry: 0,
      keys: createKeyState(),
    });

    log(
      'join ok',
      socket.id,
      `player="${playerName}"`,
      `room="${roomName}"`,
      `others=${others.length}`,
      `roomSize=${room.size}`
    );

    socket.emit('welcome', { selfId: socket.id, players: others });
    log('emit →', socket.id, 'welcome', { players: others.length });

    if (typeof ack === 'function') {
      ack({ ok: true });
      log('ack join', socket.id, { ok: true });
    }
  });

  function setArrowKey(key, down) {
    if (!joinedRoom || !ARROW_SET.has(key)) return;
    const room = rooms.get(joinedRoom);
    const p = room?.get(socket.id);
    if (!p) return;
    p.keys[key] = down;
  }

  socket.on('input:keydown', (data) => {
    const key = typeof data?.key === 'string' ? data.key : '';
    setArrowKey(key, true);
  });

  socket.on('input:keyup', (data) => {
    const key = typeof data?.key === 'string' ? data.key : '';
    setArrowKey(key, false);
  });

  socket.on('disconnect', (reason) => {
    if (!joinedRoom) {
      log('disconnect', socket.id, `reason=${reason}`, '(was not in a room)');
      return;
    }
    log('disconnect', socket.id, `reason=${reason}`, `room="${joinedRoom}"`);
    removeFromRoom(joinedRoom, socket.id);
    joinedRoom = null;
  });
});

httpServer.listen(PORT, () => {
  log(`Bomber Bots game server listening on http://localhost:${PORT}`);
  log('Socket.IO path:', '/socket.io');
  log(`Simulation tick: ${TICK_HZ} Hz (authoritative movement; clients send input only)`);
});

httpServer.on('close', () => {
  clearInterval(simInterval);
});
