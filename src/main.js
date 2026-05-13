import * as THREE from 'three';

const FLOOR_SIZE = 40;
const FLOOR_HALF = FLOOR_SIZE / 2;
const EDGE_MARGIN = 0.6;
const MOVE_SPEED = 6;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b8e8);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
camera.position.set(0, 10, 14);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

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

const robot = new THREE.Group();

const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6a7a8a, roughness: 0.6 });
const accentMat = new THREE.MeshStandardMaterial({ color: 0xc45c2a, roughness: 0.5 });

const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.1, 0.5), bodyMat);
body.position.y = 0.55;
robot.add(body);

const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), bodyMat);
head.position.y = 1.1 + 0.21;
robot.add(head);

const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.02), accentMat);
eye.position.set(0.1, head.position.y, 0.22);
robot.add(eye);
const eye2 = eye.clone();
eye2.position.x = -0.1;
robot.add(eye2);

scene.add(robot);

const keys = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
};

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

window.addEventListener('keydown', (e) => {
  if (keys[e.key] !== undefined) {
    e.preventDefault();
    keys[e.key] = true;
  }
});

window.addEventListener('keyup', (e) => {
  if (keys[e.key] !== undefined) {
    e.preventDefault();
    keys[e.key] = false;
  }
});

window.addEventListener('blur', () => {
  ARROWS.forEach((k) => {
    keys[k] = false;
  });
});

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

  const lim = FLOOR_HALF - EDGE_MARGIN;
  robot.position.x = THREE.MathUtils.clamp(robot.position.x, -lim, lim);
  robot.position.z = THREE.MathUtils.clamp(robot.position.z, -lim, lim);

  if (v.x !== 0 || v.z !== 0) {
    robot.rotation.y = Math.atan2(v.x, v.z);
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

const clock = new THREE.Clock();

function tick() {
  const dt = clock.getDelta();
  updateRobot(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
