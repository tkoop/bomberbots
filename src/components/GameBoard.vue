<template>
  <div ref="containerEl" class="game-board" />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { io } from 'socket.io-client';
import * as THREE from 'three';

const props = defineProps({
  playerName: {
    type: String,
    required: true,
  },
  roomName: {
    type: String,
    required: true,
  },
  robotSkinColor: {
    type: String,
    default: '#6a7a8a',
  },
});

const containerEl = ref(null);

const GRID_SIZE = 11;
const CELL_SIZE = 1.5;
const FLOOR_SIZE = GRID_SIZE * CELL_SIZE;
const BOARD_INNER_HALF = (GRID_SIZE * CELL_SIZE) / 2;

const ROBOT_BODY_W = 0.75;
const ROBOT_BODY_H = 1.1;
const ROBOT_BODY_D = 0.5;
const ROBOT_HEAD_S = 0.42;

const ROBOT_HEIGHT = ROBOT_BODY_H + ROBOT_HEAD_S;
const WALL_HEIGHT = ROBOT_HEIGHT;
const WALL_THICKNESS = CELL_SIZE;

/** Y position for name label anchor (bottom of sprite, above head). */
const NAME_LABEL_ANCHOR_Y = ROBOT_BODY_H + ROBOT_HEAD_S + 0.04;

function disposeNameLabel(group) {
  if (!group) return;
  const s = group.userData?.nameSprite;
  if (!(s instanceof THREE.Sprite)) return;
  const m = s.material;
  if (m.map) {
    m.map.dispose();
    m.map = null;
  }
  m.dispose();
  group.remove(s);
  delete group.userData.nameSprite;
  delete group.userData.nameLabelKey;
}

/**
 * @param {string} text
 * @returns {THREE.Sprite}
 */
function createNameSprite(text) {
  const name = text.length > 28 ? `${text.slice(0, 27)}…` : text;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D unavailable');
  }
  const pr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const fs = Math.round(26 * pr);
  ctx.font = `700 ${fs}px system-ui, sans-serif`;
  const pad = Math.round(16 * pr);
  const tw = Math.ceil(ctx.measureText(name).width) + pad * 2;
  const th = Math.ceil(fs + pad * 1.35);
  canvas.width = Math.min(1024, Math.max(8, tw));
  canvas.height = Math.max(8, th);
  ctx.font = `700 ${fs}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.strokeStyle = 'rgba(8, 12, 18, 0.92)';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, 4 * pr);
  ctx.strokeText(name, cx, cy);
  ctx.fillStyle = '#f4f8fc';
  ctx.fillText(name, cx, cy);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 2;
  const worldW = Math.min(2.2, 0.38 + name.length * 0.1);
  const worldH = worldW * (canvas.height / canvas.width);
  sprite.scale.set(worldW, worldH, 1);
  sprite.center.set(0.5, 0);
  return sprite;
}

/**
 * @param {THREE.Group} group
 * @param {unknown} rawName
 */
function syncNameLabel(group, rawName) {
  const display =
    typeof rawName === 'string' && rawName.trim().length > 0
      ? rawName.trim().slice(0, 32)
      : 'Player';
  if (group.userData.nameLabelKey === display) return;
  disposeNameLabel(group);
  const sprite = createNameSprite(display);
  sprite.position.set(0, NAME_LABEL_ANCHOR_Y, 0);
  group.add(sprite);
  group.userData.nameSprite = sprite;
  group.userData.nameLabelKey = display;
}

let renderer;
let scene;
let camera;
let robot;
let rafId = 0;

/** @type {import('socket.io-client').Socket | null} */
let socket = null;
/** @type {string | null} */
let selfId = null;
/** @type {Map<string, THREE.Group>} */
const remoteMeshes = new Map();
/** @type {{x: number, z: number}[]} */
let wallPositions = [];
/** @type {THREE.Group | null} */
let wallGroup = null;

function colorFromId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  const hue = (h % 360) / 360;
  return new THREE.Color().setHSL(hue, 0.55, 0.45);
}

function remoteBodyColor(p) {
  const hex = p?.skinColor;
  if (typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/i.test(hex.trim())) {
    return new THREE.Color(hex.trim());
  }
  return colorFromId(p.id);
}

function createRemoteRobot(p) {
  const g = new THREE.Group();
  const color = remoteBodyColor(p);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
  g.userData.skinMat = mat;
  const body = new THREE.Mesh(new THREE.BoxGeometry(ROBOT_BODY_W, ROBOT_BODY_H, ROBOT_BODY_D), mat);
  body.position.y = ROBOT_BODY_H / 2;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(ROBOT_HEAD_S, ROBOT_HEAD_S, ROBOT_HEAD_S), mat);
  head.position.y = ROBOT_BODY_H + ROBOT_HEAD_S / 2;
  g.add(head);
  syncNameLabel(g, p.name);
  return g;
}

function updateRemoteRobotSkin(group, p) {
  const mat = group.userData.skinMat;
  if (mat?.color) {
    mat.color.copy(remoteBodyColor(p));
  }
}

function removeRemotePlayer(id) {
  const mesh = remoteMeshes.get(id);
  if (!mesh || !scene) return;
  disposeNameLabel(mesh);
  scene.remove(mesh);
  mesh.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry?.dispose();
    }
  });
  mesh.userData.skinMat?.dispose?.();
  remoteMeshes.delete(id);
}

function connectSocket() {
  const socketOptions = { path: '/socket.io', transports: ['websocket', 'polling'] };
  const explicitUrl = import.meta.env.VITE_SOCKET_URL;
  socket = explicitUrl ? io(explicitUrl, socketOptions) : io(socketOptions);

  socket.on('connect', () => {
    selfId = null;
    ARROWS.forEach((k) => {
      keys[k] = false;
    });
    for (const id of [...remoteMeshes.keys()]) {
      removeRemotePlayer(id);
    }
    socket.emit(
      'join',
      {
        roomName: props.roomName,
        playerName: props.playerName,
        skinColor: props.robotSkinColor,
      },
      (res) => {
        if (res && res.ok === false) {
          console.warn('Join rejected:', res.error);
        }
      }
    );
  });

  socket.on('welcome', ({ selfId: sid, players, walls }) => {
    selfId = sid;
    wallPositions = walls || [];
    if (!scene) return;
    createWalls();
    for (const p of players) {
      if (p.id === selfId || remoteMeshes.has(p.id)) continue;
      const mesh = createRemoteRobot(p);
      mesh.position.set(p.x, 0, p.z);
      mesh.rotation.y = p.ry;
      scene.add(mesh);
      remoteMeshes.set(p.id, mesh);
    }
  });

  socket.on('state:update', ({ players }) => {
    if (!scene || !robot || !selfId || !Array.isArray(players)) return;
    const ids = new Set();
    for (const p of players) {
      ids.add(p.id);
      if (p.id === selfId) {
        robot.position.set(p.x, 0, p.z);
        robot.rotation.y = p.ry;
        continue;
      }
      let mesh = remoteMeshes.get(p.id);
      if (!mesh) {
        mesh = createRemoteRobot(p);
        scene.add(mesh);
        remoteMeshes.set(p.id, mesh);
      } else {
        updateRemoteRobotSkin(mesh, p);
        syncNameLabel(mesh, p.name);
      }
      mesh.position.set(p.x, 0, p.z);
      mesh.rotation.y = p.ry;
    }
    for (const id of [...remoteMeshes.keys()]) {
      if (!ids.has(id)) {
        removeRemotePlayer(id);
      }
    }
  });

  socket.on('disconnect', () => {
    ARROWS.forEach((k) => {
      keys[k] = false;
    });
    for (const id of [...remoteMeshes.keys()]) {
      removeRemotePlayer(id);
    }
  });
}

const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
};

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

function onKeyDown(e) {
  if (keys[e.key] !== undefined) {
    e.preventDefault();
    if (!keys[e.key]) {
      keys[e.key] = true;
      socket?.emit('input:keydown', { key: e.key });
    }
  }
}

function onKeyUp(e) {
  if (keys[e.key] !== undefined) {
    e.preventDefault();
    if (keys[e.key]) {
      keys[e.key] = false;
      socket?.emit('input:keyup', { key: e.key });
    }
  }
}

function onBlur() {
  ARROWS.forEach((k) => {
    if (keys[k]) {
      keys[k] = false;
      socket?.emit('input:keyup', { key: k });
    }
  });
}

function onResize() {
  const el = containerEl.value;
  if (!el || !renderer || !camera) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function createWalls() {
  if (!scene) return;
  
  // Remove existing walls if they exist
  if (wallGroup) {
    scene.remove(wallGroup);
    wallGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
    wallGroup = null;
  }

  if (wallPositions.length === 0) return;

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x5c4d3d,
    roughness: 0.92,
    metalness: 0.04,
  });
  wallGroup = new THREE.Group();
  for (const wall of wallPositions) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS),
      wallMaterial
    );
    mesh.position.set(wall.x, WALL_HEIGHT / 2, wall.z);
    wallGroup.add(mesh);
  }
  scene.add(wallGroup);
}

function tick() {
  renderer.render(scene, camera);
  rafId = requestAnimationFrame(tick);
}

onMounted(() => {
  const container = containerEl.value;
  if (!container) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b8e8);

  const w = container.clientWidth;
  const h = container.clientHeight;

  camera = new THREE.PerspectiveCamera(55, w / h || 1, 0.1, 200);
  camera.position.set(0, 12, 12);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(8, 16, 10);
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
    new THREE.MeshStandardMaterial({ color: 0x3d5c3d, roughness: 0.85, metalness: 0.05 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  robot = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: props.robotSkinColor, roughness: 0.6 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xc45c2a, roughness: 0.5 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(ROBOT_BODY_W, ROBOT_BODY_H, ROBOT_BODY_D), bodyMat);
  body.position.y = ROBOT_BODY_H / 2;
  robot.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(ROBOT_HEAD_S, ROBOT_HEAD_S, ROBOT_HEAD_S), bodyMat);
  head.position.y = ROBOT_BODY_H + ROBOT_HEAD_S / 2;
  robot.add(head);

  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), accentMat);
  eye.position.set(0.1, head.position.y, 0.22);
  robot.add(eye);
  const eye2 = eye.clone();
  eye2.position.x = -0.1;
  robot.add(eye2);

  syncNameLabel(robot, props.playerName);

  robot.position.set(0, 0, 0);
  scene.add(robot);

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onResize);

  connectSocket();

  rafId = requestAnimationFrame(tick);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onBlur);
  window.removeEventListener('resize', onResize);

  if (socket) {
    socket.removeAllListeners();
    socket.close();
    socket = null;
  }
  for (const id of [...remoteMeshes.keys()]) {
    removeRemotePlayer(id);
  }

  if (robot) {
    disposeNameLabel(robot);
  }

  if (wallGroup) {
    wallGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
    wallGroup = null;
  }

  if (renderer) {
    renderer.dispose();
    renderer.domElement?.parentNode?.removeChild(renderer.domElement);
  }
  renderer = null;
  scene = null;
  camera = null;
  robot = null;
  selfId = null;
});
</script>

<style scoped>
.game-board {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
