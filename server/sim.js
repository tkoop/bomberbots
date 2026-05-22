/** Keep in sync with `src/components/GameBoard.vue` movement math. */

export const GRID_SIZE = 11;
export const CELL_SIZE = 1.5;
export const BOARD_INNER_HALF = (GRID_SIZE * CELL_SIZE) / 2;
export const ROBOT_BODY_W = 0.75;
export const ROBOT_BODY_D = 0.5;

/** Matches `THREE.BoxGeometry(ROBOT_BODY_W, …, ROBOT_BODY_D)` footprint on the floor plane. */
export const ROBOT_HALF_W = ROBOT_BODY_W * 0.5;
export const ROBOT_HALF_D = ROBOT_BODY_D * 0.5;

const BOARD_SURFACE_EPS = 0.02;
export const MOVE_SPEED = 6;

export const ARROW_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/**
 * Get wall positions for the grid (walls at even grid intersections).
 * @returns {{x: number, z: number}[]} Array of wall center positions
 */
export function getWallPositions() {
  const walls = [];
  const halfGrid = GRID_SIZE / 2;
  for (let gx = 0; gx < GRID_SIZE; gx++) {
    for (let gz = 0; gz < GRID_SIZE; gz++) {
      // Walls at even grid intersections (classic bomberman pattern)
      if (gx % 2 === 0 && gz % 2 === 0) {
        const x = (gx - halfGrid + 0.5) * CELL_SIZE;
        const z = (gz - halfGrid + 0.5) * CELL_SIZE;
        walls.push({ x, z });
      }
    }
  }
  return walls;
}

/**
 * Get valid spawn positions (corners of the grid).
 * @returns {{x: number, z: number}[]} Array of spawn positions
 */
export function getValidSpawnPositions() {
  const halfGrid = GRID_SIZE / 2;
  // Spawn in corners (odd grid cells)
  return [
    { x: (1 - halfGrid + 0.5) * CELL_SIZE, z: (1 - halfGrid + 0.5) * CELL_SIZE },
    { x: (GRID_SIZE - 2 - halfGrid + 0.5) * CELL_SIZE, z: (GRID_SIZE - 2 - halfGrid + 0.5) * CELL_SIZE },
  ];
}

const WALL_HALF_SIZE = CELL_SIZE / 2;
const WALL_EPS = 0.05;

/**
 * Check if a position collides with any wall.
 * @param {number} x
 * @param {number} z
 * @param {number} ry
 * @returns {boolean}
 */
export function collidesWallAt(x, z, ry) {
  const { hx, hz } = hullHalfExtentsXZ(ry);
  const walls = getWallPositions();
  for (const wall of walls) {
    // AABB collision between robot and wall
    const robotMinX = x - hx - WALL_EPS;
    const robotMaxX = x + hx + WALL_EPS;
    const robotMinZ = z - hz - WALL_EPS;
    const robotMaxZ = z + hz + WALL_EPS;

    const wallMinX = wall.x - WALL_HALF_SIZE;
    const wallMaxX = wall.x + WALL_HALF_SIZE;
    const wallMinZ = wall.z - WALL_HALF_SIZE;
    const wallMaxZ = wall.z + WALL_HALF_SIZE;

    if (robotMaxX > wallMinX && robotMinX < wallMaxX && robotMaxZ > wallMinZ && robotMinZ < wallMaxZ) {
      return true;
    }
  }
  return false;
}

/**
 * Get minimum translation vector to push robot out of wall.
 * @param {number} x
 * @param {number} z
 * @param {number} ry
 * @returns {{depth: number, nx: number, nz: number} | null}
 */
export function getWallMTV(x, z, ry) {
  const { hx, hz } = hullHalfExtentsXZ(ry);
  const walls = getWallPositions();
  let bestDepth = Infinity;
  let bestNx = 0;
  let bestNz = 0;

  for (const wall of walls) {
    const robotMinX = x - hx - WALL_EPS;
    const robotMaxX = x + hx + WALL_EPS;
    const robotMinZ = z - hz - WALL_EPS;
    const robotMaxZ = z + hz + WALL_EPS;

    const wallMinX = wall.x - WALL_HALF_SIZE;
    const wallMaxX = wall.x + WALL_HALF_SIZE;
    const wallMinZ = wall.z - WALL_HALF_SIZE;
    const wallMaxZ = wall.z + WALL_HALF_SIZE;

    // Check overlap
    const overlapX = Math.min(robotMaxX, wallMaxX) - Math.max(robotMinX, wallMinX);
    const overlapZ = Math.min(robotMaxZ, wallMaxZ) - Math.max(robotMinZ, wallMinZ);

    if (overlapX <= 0 || overlapZ <= 0) continue;

    // Find minimum push direction
    const overlap = Math.min(overlapX, overlapZ);
    if (overlap < bestDepth) {
      bestDepth = overlap;
      if (overlapX < overlapZ) {
        // Push along X axis
        const centerX = (robotMinX + robotMaxX) / 2;
        const wallCenterX = (wallMinX + wallMaxX) / 2;
        bestNx = centerX < wallCenterX ? -1 : 1;
        bestNz = 0;
      } else {
        // Push along Z axis
        const centerZ = (robotMinZ + robotMaxZ) / 2;
        const wallCenterZ = (wallMinZ + wallMaxZ) / 2;
        bestNx = 0;
        bestNz = centerZ < wallCenterZ ? -1 : 1;
      }
    }
  }

  return bestDepth < Infinity ? { depth: bestDepth, nx: bestNx, nz: bestNz } : null;
}

/**
 * Push robot out of walls if it's colliding.
 * @param {{ x: number, z: number, ry: number }} p
 */
export function resolveWallCollision(p) {
  const iterations = 4;
  for (let i = 0; i < iterations; i++) {
    const mtv = getWallMTV(p.x, p.z, p.ry);
    if (!mtv) break;
    const { depth, nx, nz } = mtv;
    if (depth <= COLLIDE_EPS) break;
    p.x += nx * depth;
    p.z += nz * depth;
    clampPlayerToBoard(p, p.ry);
  }
}

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

  if (!collidesOthersAt(tx, tz, bodyRyForTick, id, snap) && !collidesWallAt(tx, tz, bodyRyForTick)) {
    p.x = tx;
    p.z = tz;
  } else if (Math.abs(tx - ox) < 1e-12 && Math.abs(tz - oz) < 1e-12) {
    p.x = ox;
    p.z = oz;
  } else {
    // Check if we can slide along the wall
    const wallMTV = getWallMTV(tx, tz, bodyRyForTick);
    if (wallMTV && !collidesOthersAt(tx, tz, bodyRyForTick, id, snap)) {
      // Wall collision detected, try sliding
      const { nx, nz } = wallMTV;
      const dx = tx - ox;
      const dz = tz - oz;
      
      // Project movement onto wall surface (perpendicular to normal)
      // If normal is along X, slide along Z; if normal is along Z, slide along X
      let slideX = 0;
      let slideZ = 0;
      
      if (Math.abs(nx) > 0.5) {
        // Normal is along X axis, slide along Z
        slideZ = dz;
      } else if (Math.abs(nz) > 0.5) {
        // Normal is along Z axis, slide along X
        slideX = dx;
      }
      
      // Apply slide at half speed
      if (Math.abs(slideX) > 1e-6 || Math.abs(slideZ) > 1e-6) {
        const slideStep = MOVE_SPEED * dt * 0.5;
        const slideLen = Math.hypot(slideX, slideZ);
        if (slideLen > 1e-6) {
          slideX = (slideX / slideLen) * slideStep;
          slideZ = (slideZ / slideLen) * slideStep;
          
          const slideTx = ox + slideX;
          const slideTz = oz + slideZ;
          
          // Check if slide position is valid
          if (!collidesWallAt(slideTx, slideTz, bodyRyForTick) && !collidesOthersAt(slideTx, slideTz, bodyRyForTick, id, snap)) {
            p.x = slideTx;
            p.z = slideTz;
            clampPlayerToBoard(p, bodyRyForTick);
            p.ry = Math.atan2(ix, iz);
            resolveWallCollision(p);
            return;
          }
        }
      }
    }
    
    // Fall back to binary search for direct collision
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 16; k += 1) {
      const mid = (lo + hi) * 0.5;
      const mx = ox + (tx - ox) * mid;
      const mz = oz + (tz - oz) * mid;
      if (collidesOthersAt(mx, mz, bodyRyForTick, id, snap) || collidesWallAt(mx, mz, bodyRyForTick)) {
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

  // Resolve wall collision after rotation
  resolveWallCollision(p);
}
