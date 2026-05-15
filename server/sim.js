/** Keep in sync with `src/components/GameBoard.vue` movement math. */

export const BOARD_INNER_HALF = 8;
export const ROBOT_BODY_W = 0.75;
export const ROBOT_BODY_D = 0.5;
export const ROBOT_MARGIN = 0.5 * Math.max(ROBOT_BODY_W, ROBOT_BODY_D) + 0.02;
export const MOVE_SPEED = 6;

/** XZ disc for robot–robot collision (matches body footprint at floor origin). */
export const ROBOT_COLLISION_RADIUS = 0.5 * Math.hypot(ROBOT_BODY_W, ROBOT_BODY_D) + 0.02;

export const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/** @param {{ x: number, z: number }} p */
export function clampPlayerToBoard(p) {
  const lim = BOARD_INNER_HALF - ROBOT_MARGIN;
  p.x = Math.min(lim, Math.max(-lim, p.x));
  p.z = Math.min(lim, Math.max(-lim, p.z));
}

/** @param {number} x @param {number} z */
export function clampXZ(x, z) {
  const lim = BOARD_INNER_HALF - ROBOT_MARGIN;
  return {
    x: Math.min(lim, Math.max(-lim, x)),
    z: Math.min(lim, Math.max(-lim, z)),
  };
}

const COLLIDE_EPS = 1e-4;
const MIN_CENTER = 2 * ROBOT_COLLISION_RADIUS - COLLIDE_EPS;

/**
 * @param {number} px
 * @param {number} pz
 * @param {string} selfId
 * @param {Map<string, { x: number, z: number }>} snap
 */
export function collidesOthersAt(px, pz, selfId, snap) {
  for (const [oid, pos] of snap) {
    if (oid === selfId) continue;
    if (Math.hypot(px - pos.x, pz - pos.z) < MIN_CENTER) {
      return true;
    }
  }
  return false;
}

/**
 * Push overlapping robots apart on XZ; then clamp to arena.
 * @param {Map<string, { x: number, z: number }>} room
 */
export function resolveCollisionsInRoom(room) {
  const list = [...room.values()];
  if (list.length < 2) return;
  const minSep = 2 * ROBOT_COLLISION_RADIUS;
  const iterations = 5;
  for (let it = 0; it < iterations; it += 1) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        let dist = Math.hypot(dx, dz);
        if (dist < 1e-8) {
          const angle = (i * 0.7 + j * 1.1 + it * 0.13) % (2 * Math.PI);
          dx = Math.cos(angle) * 1e-3;
          dz = Math.sin(angle) * 1e-3;
          dist = Math.hypot(dx, dz);
        }
        if (dist >= minSep) continue;
        const overlap = minSep - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        const half = overlap * 0.5;
        a.x -= nx * half;
        a.z -= nz * half;
        b.x += nx * half;
        b.z += nz * half;
      }
    }
  }
  for (const p of list) {
    clampPlayerToBoard(p);
  }
}

/** @type {Record<string, boolean>} */
export function createKeyState() {
  return { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
}

/**
 * Authoritative move for one tick: arena clamp + cannot cross into other robots
 * (others fixed at `snap` positions from start of this tick).
 *
 * @param {{ x: number, z: number, ry: number, keys: Record<string, boolean> }} p
 * @param {string} id
 * @param {Map<string, { x: number, z: number }>} snap
 * @param {number} dt
 */
export function stepPlayer(p, id, snap, dt) {
  const ox = snap.get(id).x;
  const oz = snap.get(id).z;

  const { keys } = p;
  let ix = 0;
  let iz = 0;
  if (keys.ArrowRight) ix += 1;
  if (keys.ArrowLeft) ix -= 1;
  if (keys.ArrowUp) iz -= 1;
  if (keys.ArrowDown) iz += 1;
  if (ix !== 0 || iz !== 0) {
    const len = Math.hypot(ix, iz);
    ix /= len;
    iz /= len;
  }

  const step = MOVE_SPEED * dt;
  const rawX = ox + ix * step;
  const rawZ = oz + iz * step;
  const clamped = clampXZ(rawX, rawZ);
  let tx = clamped.x;
  let tz = clamped.z;

  if (ix === 0 && iz === 0) {
    p.x = ox;
    p.z = oz;
    return;
  }

  if (!collidesOthersAt(tx, tz, id, snap)) {
    p.x = tx;
    p.z = tz;
  } else if (Math.abs(tx - ox) < 1e-12 && Math.abs(tz - oz) < 1e-12) {
    p.x = ox;
    p.z = oz;
  } else {
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 16; k += 1) {
      const mid = (lo + hi) * 0.5;
      const mx = ox + (tx - ox) * mid;
      const mz = oz + (tz - oz) * mid;
      if (collidesOthersAt(mx, mz, id, snap)) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    p.x = ox + (tx - ox) * lo;
    p.z = oz + (tz - oz) * lo;
    clampPlayerToBoard(p);
  }

  p.ry = Math.atan2(ix, iz);
}
