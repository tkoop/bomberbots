<template>
  <div ref="containerEl" class="game-board" />
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import * as THREE from 'three';

defineProps({
  playerName: {
    type: String,
    required: true,
  },
  roomName: {
    type: String,
    required: true,
  },
});

const containerEl = ref(null);

const FLOOR_SIZE = 40;
const BOARD_INNER_HALF = 8;

const ROBOT_BODY_W = 0.75;
const ROBOT_BODY_H = 1.1;
const ROBOT_BODY_D = 0.5;
const ROBOT_HEAD_S = 0.42;

const ROBOT_HEIGHT = ROBOT_BODY_H + ROBOT_HEAD_S;
const WALL_HEIGHT = ROBOT_HEIGHT;
const WALL_THICKNESS = ROBOT_BODY_D;
const ROBOT_MARGIN = 0.5 * Math.max(ROBOT_BODY_W, ROBOT_BODY_D) + 0.02;

const MOVE_SPEED = 6;

let renderer;
let scene;
let camera;
let robot;
let clock;
let rafId = 0;

const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
};

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

function getInputVector() {
  let x = 0;
  let z = 0;
  if (keys.ArrowRight) x += 1;
  if (keys.ArrowLeft) x -= 1;
  if (keys.ArrowUp) z -= 1;
  if (keys.ArrowDown) z += 1;
  if (x !== 0 || z !== 0) {
    const len = Math.hypot(x, z);
    x /= len;
    z /= len;
  }
  return { x, z };
}

function updateRobot(dt) {
  const v = getInputVector();
  robot.position.x += v.x * MOVE_SPEED * dt;
  robot.position.z += v.z * MOVE_SPEED * dt;

  const lim = BOARD_INNER_HALF - ROBOT_MARGIN;
  robot.position.x = THREE.MathUtils.clamp(robot.position.x, -lim, lim);
  robot.position.z = THREE.MathUtils.clamp(robot.position.z, -lim, lim);

  if (v.x !== 0 || v.z !== 0) {
    robot.rotation.y = Math.atan2(v.x, v.z);
  }
}

function onKeyDown(e) {
  if (keys[e.key] !== undefined) {
    e.preventDefault();
    keys[e.key] = true;
  }
}

function onKeyUp(e) {
  if (keys[e.key] !== undefined) {
    e.preventDefault();
    keys[e.key] = false;
  }
}

function onBlur() {
  ARROWS.forEach((k) => {
    keys[k] = false;
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

function tick() {
  const dt = clock.getDelta();
  updateRobot(dt);
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
  camera.position.set(0, 10, 14);
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

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x5c4d3d,
    roughness: 0.92,
    metalness: 0.04,
  });
  const wallSpan = 2 * BOARD_INNER_HALF + 2 * WALL_THICKNESS;
  const wallY = WALL_HEIGHT / 2;
  const walls = new THREE.Group();

  function addWall(ww, hh, dd, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, dd), wallMaterial);
    mesh.position.set(x, y, z);
    walls.add(mesh);
  }

  const wallZ = BOARD_INNER_HALF + WALL_THICKNESS / 2;
  addWall(wallSpan, WALL_HEIGHT, WALL_THICKNESS, 0, wallY, wallZ);
  addWall(wallSpan, WALL_HEIGHT, WALL_THICKNESS, 0, wallY, -wallZ);
  const wallX = BOARD_INNER_HALF + WALL_THICKNESS / 2;
  addWall(WALL_THICKNESS, WALL_HEIGHT, wallSpan, wallX, wallY, 0);
  addWall(WALL_THICKNESS, WALL_HEIGHT, wallSpan, -wallX, wallY, 0);
  scene.add(walls);

  robot = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6a7a8a, roughness: 0.6 });
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

  robot.position.set(0, 0, 0);
  scene.add(robot);

  clock = new THREE.Clock();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onResize);

  rafId = requestAnimationFrame(tick);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onBlur);
  window.removeEventListener('resize', onResize);

  if (renderer) {
    renderer.dispose();
    renderer.domElement?.parentNode?.removeChild(renderer.domElement);
  }
  renderer = null;
  scene = null;
  camera = null;
  robot = null;
  clock = null;
});
</script>

<style scoped>
.game-board {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
