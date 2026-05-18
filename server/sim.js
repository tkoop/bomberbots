/** Keep in sync with `src/components/GameBoard.vue` movement math. */

export const BOARD_INNER_HALF = 8;
export const ROBOT_BODY_W = 0.75;
export const ROBOT_BODY_D = 0.5;

/** Matches `THREE.BoxGeometry(ROBOT_BODY_W, …, ROBOT_BODY_D)` footprint on the floor plane. */
export const ROBOT_HALF_W = ROBOT_BODY_W * 0.5;
export const ROBOT_HALF_D = ROBOT_BODY_D * 0.5;

const BOARD_SURFACE_EPS = 0.02;
export const MOVE_SPEED = 6;

export const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/**
 * Max |Δx| / |Δz| from body center with feet at origin (`rotation.y`, Three.js/Y-up).
 * @param {number} ry
 */
export function hullHalfExtentsXZ(ry) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  /** Local +X projected to world XZ (same as THREE.Matrix4.makeRotationY). */
  const uxx = c;
  const uxz = -s;
  /** Local +Z projected to world XZ. */
  const uzx = s;
  const uzz = c;
  const hx = ROBOT_HALF_W * Math.abs(uxx) + ROBOT_HALF_D * Math.abs(uzx);
  const hz = ROBOT_HALF_W * Math.abs(uxz) + ROBOT_HALF_D * Math.abs(uzz);
  return { hx, hz };
}

/**
 * @param {number} ry
 * @returns {{ limX: number, limZ: number }}
 */
function arenaHalfLimitsFromRy(ry) {
  const { hx, hz } = hullHalfExtentsXZ(ry);
  return {
    limX: BOARD_INNER_HALF - hx - BOARD_SURFACE_EPS,
    limZ: BOARD_INNER_HALF - hz - BOARD_SURFACE_EPS,
  };
}

/** @param {{ x: number, z: number }} p @param {number} ry */
export function clampPlayerToBoard(p, ry) {
  const { limX, limZ } = arenaHalfLimitsFromRy(ry);
  p.x = Math.min(limX, Math.max(-limX, p.x));
  p.z = Math.min(limZ, Math.max(-limZ, p.z));
}

/** @param {number} x @param {number} z @param {number} ry */
export function clampXZ(x, z, ry) {
  const { limX, limZ } = arenaHalfLimitsFromRy(ry);
  return {
    x: Math.min(limX, Math.max(-limX, x)),
    z: Math.min(limZ, Math.max(-limZ, z)),
  };
}

const COLLIDE_EPS = 1e-4;

/**
 * @param {number} ry
 * @returns {[number, number][]} unit-ish edge normals for SAT (local X and Z axes in world XZ)
 */
function robotSatAxesXZ(ry) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return [
    [c, -s],
    [s, c],
  ];
}

/** Projection radius of robot OBB onto axis (nx, nz). */
function obbProjRadiusOnAxis(nx, nz, ry) {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const d0 = c * nx - s * nz;
  const d1 = s * nx + c * nz;
  return ROBOT_HALF_W * Math.abs(d0) + ROBOT_HALF_D * Math.abs(d1);
}

/**
 * @param {number} ax @param {number} az @param {number} ary
 * @param {number} bx @param {number} bz @param {number} bry
 */
function robotObbOverlapSAT(ax, az, ary, bx, bz, bry) {
  const aa = robotSatAxesXZ(ary);
  const ba = robotSatAxesXZ(bry);
  /** @type {[number, number][]} */
  const axes = [...aa, ...ba];
  for (const [ux, uz] of axes) {
    const len = Math.hypot(ux, uz);
    if (len < 1e-9) continue;
    const nx = ux / len;
    const nz = uz / len;
    const ra = obbProjRadiusOnAxis(nx, nz, ary);
    const rb = obbProjRadiusOnAxis(nx, nz, bry);
    const ac = ax * nx + az * nz;
    const bc = bx * nx + bz * nz;
    const aMin = ac - ra;
    const aMax = ac + ra;
    const bMin = bc - rb;
    const bMax = bc + rb;
    const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
    if (overlap <= COLLIDE_EPS) {
      return false;
    }
  }
  return true;
}

/** Smallest MTV to separate B from A (push A opposite to MTV by depth/2, B toward by depth/2). */
function robotObbIntersectionMTV(ax, az, ary, bx, bz, bry) {
  const aa = robotSatAxesXZ(ary);
  const ba = robotSatAxesXZ(bry);
  /** @type {[number, number][]} */
  const axes = [...aa, ...ba];
  let bestDepth = Infinity;
  /** @type {number} */
  let bestNx = 0;
  /** @type {number} */
  let bestNz = 0;
  for (const [ux, uz] of axes) {
    const len = Math.hypot(ux, uz);
    if (len < 1e-9) continue;
    let nx = ux / len;
    let nz = uz / len;
    const ra = obbProjRadiusOnAxis(nx, nz, ary);
    const rb = obbProjRadiusOnAxis(nx, nz, bry);
    const ac = ax * nx + az * nz;
    const bc = bx * nx + bz * nz;
    const aMin = ac - ra;
    const aMax = ac + ra;
    const bMin = bc - rb;
    const bMax = bc + rb;
    const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
    if (overlap <= COLLIDE_EPS) {
      return null;
    }
    const dx = bx - ax;
    const dz = bz - az;
    if (nx * dx + nz * dz < 0) {
      nx *= -1;
      nz *= -1;
    }
    if (overlap < bestDepth) {
      bestDepth = overlap;
      bestNx = nx;
      bestNz = nz;
    }
  }
  return { depth: bestDepth, nx: bestNx, nz: bestNz };
}

/**
 * Body–body collision: oriented rectangles (Three.js footprint), not discs.
 *
 * @param {number} px
 * @param {number} pz
 * @param {number} selfRy rotation.y for self (movement facing when moving).
 * @param {string} selfId
 * @param {Map<string, { x: number, z: number, ry: number }>} snap
 */
export function collidesOthersAt(px, pz, selfRy, selfId, snap) {
  for (const [oid, pos] of snap) {
    if (oid === selfId) continue;
    if (robotObbOverlapSAT(px, pz, selfRy, pos.x, pos.z, pos.ry)) {
      return true;
    }
  }
  return false;
}

/**
 * Push overlapping robots apart on XZ; then clamp to arena.
 * @param {Map<string, { x: number, z: number, ry: number }>} room
 */
export function resolveCollisionsInRoom(room) {
  const list = [...room.values()];
  if (list.length < 2) return;
  const iterations = 8;
  for (let it = 0; it < iterations; it += 1) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const mtv = robotObbIntersectionMTV(a.x, a.z, a.ry, b.x, b.z, b.ry);
        if (!mtv) continue;
        const { depth, nx, nz } = mtv;
        if (depth <= COLLIDE_EPS) continue;
        if (nx * nx + nz * nz < 1e-12) continue;
        const half = depth * 0.5;
        a.x -= nx * half;
        a.z -= nz * half;
        b.x += nx * half;
        b.z += nz * half;
      }
    }
  }
  for (const p of list) {
    clampPlayerToBoard(p, p.ry);
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
 * @param {Map<string, { x: number, z: number, ry: number }>} snap
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

  const bodyRyForTick = ix !== 0 || iz !== 0 ? Math.atan2(ix, iz) : p.ry;

  const step = MOVE_SPEED * dt;
  const rawX = ox + ix * step;
  const rawZ = oz + iz * step;
  const clamped = clampXZ(rawX, rawZ, bodyRyForTick);
  let tx = clamped.x;
  let tz = clamped.z;

  if (ix === 0 && iz === 0) {
    p.x = ox;
    p.z = oz;
    return;
  }

  if (!collidesOthersAt(tx, tz, bodyRyForTick, id, snap)) {
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
      if (collidesOthersAt(mx, mz, bodyRyForTick, id, snap)) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    p.x = ox + (tx - ox) * lo;
    p.z = oz + (tz - oz) * lo;
    clampPlayerToBoard(p, bodyRyForTick);
  }

  p.ry = Math.atan2(ix, iz);
}
