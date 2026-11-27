// Cloud Courier v2 — the renderer: a hand-rolled 3D chase view in plain
// canvas 2D. Sky with sun and glitter, a dressed island (palms, houses,
// boats, birds), glowing rings, a built-looking Dart-9, and a lit HUD with
// a minimap. No images, no libraries: every pixel comes from the world state.
import { ISLAND, LIGHTING, MISSIONS } from './settings.js';
import { clamp } from './rng.js';
import {
  groundColor, groundHeight, isSea, roadPaths,
} from './island.js';
import { SCREEN } from './flight.js';

const GRIDS = [
  { cell: 90, extent: 990, skip: false },
  { cell: 220, extent: 2420, skip: true },
  { cell: 520, extent: 5200, skip: true },
];

export function createView(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  function draw(state, screen, best) {
    const p = state.plane;
    const light = LIGHTING[state.mission.light] || LIGHTING.day;
    const f = H * 1.05;

    // ---- Camera: chase, behind and above the plane, looking ahead of it.
    // It follows only half the plane's pitch so climbs never swing the view.
    const camPitch = p.pitch * 0.45;
    const camDist = screen === SCREEN.title ? 36 : 26;
    const camHeight = screen === SCREEN.title ? 9.5 : 7.5;
    const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
    const fwd = { x: Math.sin(p.heading) * cp, y: sp, z: -Math.cos(p.heading) * cp };
    const eye = {
      x: p.x - fwd.x * camDist,
      y: p.y - fwd.y * camDist + camHeight,
      z: p.z - fwd.z * camDist,
    };
    const look = { x: p.x + fwd.x * 60, y: p.y + fwd.y * 60 + 1.5, z: p.z + fwd.z * 60 };
    const lf = norm3(look.x - eye.x, look.y - eye.y, look.z - eye.z);
    const r0 = { x: -lf.z, y: 0, z: lf.x };
    const rl = Math.hypot(r0.x, r0.z) || 1;
    const r = { x: r0.x / rl, y: 0, z: r0.z / rl };
    const up = {
      x: r.y * lf.z - r.z * lf.y,
      y: r.z * lf.x - r.x * lf.z,
      z: r.x * lf.y - r.y * lf.x,
    };
    function project(x, y, z) {
      const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z;
      const cz = dx * lf.x + dy * lf.y + dz * lf.z;
      if (cz < 2) return null;
      const cx = dx * r.x + dy * r.y + dz * r.z;
      const cy = dx * up.x + dy * up.y + dz * up.z;
      return { x: W / 2 + (cx * f) / cz, y: H / 2 - (cy * f) / cz, s: f / cz, d: cz };
    }
    const hor = project(eye.x + lf.x * 9000, eye.y, eye.z + lf.z * 9000);
    const horizonY = hor ? hor.y : H * 0.42;

    // ---- Sky: three-stop gradient, sun disc with halo.
    const skyG = ctx.createLinearGradient(0, 0, 0, H);
    skyG.addColorStop(0, light.top);
    skyG.addColorStop(Math.max(0.1, horizonY / H - 0.12), light.mid);
    skyG.addColorStop(Math.min(1, horizonY / H + 0.12), light.low);
    skyG.addColorStop(1, light.low);
    ctx.fillStyle = skyG;
    ctx.fillRect(0, 0, W, H);
    const sunX = W * light.sunX, sunY = H * light.sunY;
    const sunG = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 150);
    sunG.addColorStop(0, light.sun);
    sunG.addColorStop(0.22, 'rgba(255,244,200,0.55)');
    sunG.addColorStop(1, 'rgba(255,244,200,0)');
    ctx.fillStyle = sunG;
    ctx.fillRect(sunX - 160, sunY - 160, 320, 320);
    ctx.fillStyle = light.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
    ctx.fill();

    // ---- Terrain: three grids of quads, far to near, painter-sorted.
    ctx.fillStyle = groundColor(eye.x, eye.z, GRIDS[0].cell);
    ctx.fillRect(0, horizonY, W, H - horizonY);
    const quads = [];
    const foam = [];
    const nearExtent = GRIDS[0].extent;
    const gx = Math.round(eye.x / GRIDS[0].cell) * GRIDS[0].cell;
    const gz = Math.round(eye.z / GRIDS[0].cell) * GRIDS[0].cell;
    for (const grid of GRIDS) {
      const { cell, extent } = grid;
      const n = Math.round(extent / cell);
      const ox = Math.round(eye.x / cell) * cell;
      const oz = Math.round(eye.z / cell) * cell;
      // Heights on the grid points, so shared corners are computed once.
      const pts = [];
      for (let iz = -n; iz <= n; iz += 1) {
        pts[iz + n] = [];
        for (let ix = -n; ix <= n; ix += 1) {
          const x = ox + ix * cell, z = oz + iz * cell;
          pts[iz + n][ix + n] = { x, z, h: groundHeight(x, z) };
        }
      }
      for (let iz = 0; iz < n * 2; iz += 1) {
        for (let ix = 0; ix < n * 2; ix += 1) {
          const cx0 = ox + (ix - n) * cell, cz0 = oz + (iz - n) * cell;
          if (grid.skip && Math.abs(cx0 - gx) < nearExtent && Math.abs(cz0 - gz) < nearExtent) continue;
          const a = pts[iz][ix], b = pts[iz][ix + 1], c = pts[iz + 1][ix + 1], d = pts[iz + 1][ix];
          const pa = project(a.x, a.h, a.z), pb = project(b.x, b.h, b.z);
          const pc = project(c.x, c.h, c.z), pd = project(d.x, d.h, d.z);
          if (!pa || !pb || !pc || !pd) continue;
          const depth = (pa.d + pb.d + pc.d + pd.d) / 4;
          const midH = (a.h + b.h + c.h + d.h) / 4;
          quads.push({
            a: pa, b: pb, c: pc, d: pd, depth,
            color: groundColor(cx0 + cell / 2, cz0 + cell / 2, cell),
          });
          if (midH > -1 && midH < 2.2) {
            foam.push({ x: (pa.x + pc.x) / 2, y: (pa.y + pc.y) / 2, s: (pa.s + pc.s) / 2, cell });
          }
        }
      }
    }
    quads.sort((q1, q2) => q2.depth - q1.depth);
    for (const q of quads) {
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.moveTo(q.a.x, q.a.y);
      ctx.lineTo(q.b.x, q.b.y);
      ctx.lineTo(q.c.x, q.c.y);
      ctx.lineTo(q.d.x, q.d.y);
      ctx.closePath();
      ctx.fill();
    }
    // Shore foam: soft white flecks where the land meets the sea.
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (const fl of foam) {
      const w = Math.max(2, fl.cell * fl.s * 0.5);
      ctx.beginPath();
      ctx.ellipse(fl.x, fl.y, w, Math.max(1, w * 0.16), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- Runway and roads at their true width.
    drawStrip(project);
    drawRoads(project);

    // ---- Sun glitter on the water: bright dashes along the sun's bearing.
    drawGlitter(project, light, state);

    // ---- Haze band at the horizon.
    const fogG = ctx.createLinearGradient(0, horizonY - H * 0.22, 0, horizonY + H * 0.1);
    fogG.addColorStop(0, 'rgba(255,255,255,0)');
    fogG.addColorStop(0.75, rgbaOf(light.haze, 0.5));
    fogG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fogG;
    ctx.fillRect(0, Math.max(0, horizonY - H * 0.22), W, H * 0.32);

    // ---- Clouds: thin wisps near the horizon, then big puffs far to near.
    drawClouds(project, light, state, true);
    drawClouds(project, light, state, false);

    // ---- Dressing: boats, houses, palms, birds.
    drawBoats(project, state);
    drawHouses(project, state);
    drawPalms(project, state);
    drawBirds(project, state);

    // ---- Rings, glowing, with a beacon over the next one.
    if (screen !== SCREEN.title) drawRings(project, state);

    // ---- The plane and its shadow.
    const planePr = project(p.x, p.y, p.z);
    const groundY = groundHeight(p.x, p.z);
    const shadowPr = project(p.x, groundY + 0.5, p.z);
    if (shadowPr && !p.onGround) {
      const alt = Math.max(0, p.y - groundY);
      const shScale = clamp(1 - alt / 900, 0.25, 1);
      ctx.fillStyle = `rgba(20,30,20,${0.3 * shScale})`;
      ctx.beginPath();
      ctx.ellipse(shadowPr.x, shadowPr.y, 26 * shadowPr.s * shScale, 7 * shadowPr.s * shScale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (planePr) drawPlane(planePr, p, state);

    // ---- HUD and screens.
    if (screen !== SCREEN.title) drawHud(state, screen, best);
    if (screen === SCREEN.title) drawTitle(state, best);
    else if (screen === SCREEN.paused) drawPanel('PAUSED', 'Press P or click to keep flying', 'rgba(10,18,28,0.66)');
    else if (screen === SCREEN.landed) drawLanded(state, best);
    else if (screen === SCREEN.crashed) drawPanel('CRASHED', `${state.crashReason || ''} — score ${state.score}. Press R to fly again.`, 'rgba(60,12,10,0.72)');
    else if (screen === SCREEN.timeout) drawPanel('OUT OF TIME', `Score ${state.score}. Press R to fly again.`, 'rgba(40,30,8,0.72)');
  }

  function norm3(x, y, z) {
    const l = Math.hypot(x, y, z) || 1;
    return { x: x / l, y: y / l, z: z / l };
  }

  function rgbaOf(rgba, alpha) {
    const m = rgba.match(/rgba?\(([^)]+)\)/);
    if (!m) return rgba;
    const parts = m[1].split(',').map((s) => s.trim());
    return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
  }

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panelBox(x, y, w, h, alpha = 0.55) {
    ctx.fillStyle = `rgba(8,14,22,${alpha})`;
    roundRectPath(x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,220,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function glowText(text, x, y, size, color, align = 'center', weight = 700) {
    ctx.font = `${weight} ${size}px system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  }

  /** The runway: asphalt, dashed centreline, threshold bars, side lights. */
  function drawStrip(project) {
    const rw = ISLAND.strip;
    const hw = rw.width / 2;
    const z0 = rw.z - rw.length / 2, z1 = rw.z + rw.length / 2;
    const SEG = 60;
    for (let z = z0; z < z1; z += SEG) {
      const za = z, zb = Math.min(z + SEG, z1);
      const a = project(rw.x - hw, 2.6, za), b = project(rw.x + hw, 2.6, za);
      const c = project(rw.x + hw, 2.6, zb), d = project(rw.x - hw, 2.6, zb);
      if (!a || !b || !c || !d) continue;
      ctx.fillStyle = '#3b4048';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#e8e8e2';
    for (let z = z0 + 12; z < z1 - 12; z += 46) {
      const a = project(rw.x - 2, 2.8, z), b = project(rw.x + 2, 2.8, z);
      const c = project(rw.x + 2, 2.8, z + 23), d = project(rw.x - 2, 2.8, z + 23);
      if (!a || !b || !c || !d) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#d8d8d0';
    for (const zt of [z0 + 18, z1 - 18]) {
      for (let k = -2; k <= 2; k += 1) {
        const a = project(rw.x + k * 6 - 2, 2.8, zt), b = project(rw.x + k * 6 + 2, 2.8, zt);
        const c = project(rw.x + k * 6 + 2, 2.8, zt + 26), d = project(rw.x + k * 6 - 2, 2.8, zt + 26);
        if (!a || !b || !c || !d) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
        ctx.closePath(); ctx.fill();
      }
    }
    // Edge lights, small glowing dots along both sides.
    ctx.fillStyle = '#ffe9a8';
    for (let z = z0 + 30; z < z1; z += 120) {
      for (const side of [-1, 1]) {
        const pr = project(rw.x + side * (hw + 3), 3, z);
        if (!pr) continue;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, Math.min(5, Math.max(1.5, 2.2 * pr.s)), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawRoads(project) {
    ctx.strokeStyle = '#6d7178';
    ctx.lineCap = 'round';
    for (const path of roadPaths()) {
      for (let i = 0; i < path.length - 1; i += 1) {
        const [x1, z1] = path[i];
        const [x2, z2] = path[i + 1];
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
        const a = project(x1, groundHeight(x1, z1) + 0.4, z1);
        const b = project(x2, groundHeight(x2, z2) + 0.4, z2);
        const m = project(mx, groundHeight(mx, mz) + 0.4, mz);
        if (!a || !b || !m) continue;
        ctx.lineWidth = Math.max(1, 13 * m.s);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  /** Bright dashes on the water along the sun's bearing. */
  function drawGlitter(project, light, state) {
    const p = state.plane;
    const bearing = p.heading + (light.sunX - 0.5) * 1.4;
    const dx = Math.sin(bearing), dz = -Math.cos(bearing);
    for (let i = 0; i < 46; i += 1) {
      const dist = 260 + i * 95;
      const jitter = ((i * 2654435761) % 100) / 100 - 0.5;
      const x = p.x + dx * dist + -dz * jitter * 260;
      const z = p.z + dz * dist + dx * jitter * 260;
      if (!isSea(x, z)) continue;
      const pr = project(x, 0.4, z);
      if (!pr) continue;
      const alpha = clamp(0.5 - dist / 5200, 0.06, 0.5);
      const w = clamp(26 * pr.s, 3, 60);
      ctx.fillStyle = rgbaOf(light.glitter, alpha);
      ctx.beginPath();
      ctx.ellipse(pr.x, pr.y, w, Math.max(1, w * 0.12), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawClouds(project, light, state, wisps) {
    const list = wisps ? state.clouds.wisps : state.clouds.puffs;
    const items = [];
    for (const cl of list) {
      const pr = project(cl.x, cl.y, cl.z);
      if (pr) items.push({ cl, pr });
    }
    items.sort((a, b) => b.pr.d - a.pr.d);
    for (const { cl, pr } of items) {
      const s = pr.s * cl.size;
      if (s < 4) continue;
      const alpha = wisps
        ? clamp(0.5 - pr.d / 14000, 0.1, 0.42)
        : clamp(1.15 - pr.d / 9000, 0.25, 0.9);
      if (wisps) {
        ctx.fillStyle = rgbaOf(light.puff, alpha);
        ctx.beginPath();
        ctx.ellipse(pr.x, pr.y, s, s * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = rgbaOf(light.puff, alpha);
      for (let i = 0; i < cl.puffs; i += 1) {
        const px = pr.x + Math.sin(cl.seed + i * 2.3) * s * 0.42;
        const py = pr.y + Math.cos(cl.seed + i * 1.7) * s * 0.1;
        const rpx = s * (0.3 + ((cl.seed + i * 7) % 10) / 55);
        ctx.beginPath();
        ctx.ellipse(px, py, rpx, rpx * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = rgbaOf(light.puffShade, alpha * 0.8);
      ctx.beginPath();
      ctx.ellipse(pr.x, pr.y + s * 0.12, s * 0.5, s * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBoats(project, state) {
    const t = state.time;
    for (const boat of state.boats) {
      const pr = project(boat.x, 0.5 + Math.sin(t * 0.7 + boat.x) * 0.4, boat.z);
      if (!pr || pr.s * 10 < 3) continue;
      const s = pr.s * boat.scale;
      const bob = Math.sin(t * 0.9 + boat.z) * 0.06;
      ctx.save();
      ctx.translate(pr.x, pr.y);
      ctx.rotate(bob);
      // Hull.
      ctx.fillStyle = '#5a3d28';
      ctx.beginPath();
      ctx.moveTo(-7 * s, 0);
      ctx.lineTo(7 * s, 0);
      ctx.lineTo(4 * s, 3.4 * s);
      ctx.lineTo(-4 * s, 3.4 * s);
      ctx.closePath();
      ctx.fill();
      // Mast and sail.
      ctx.strokeStyle = '#3d2c1c';
      ctx.lineWidth = Math.max(1, 0.8 * s);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -11 * s);
      ctx.stroke();
      ctx.fillStyle = boat.sail;
      ctx.beginPath();
      ctx.moveTo(0, -11 * s);
      ctx.lineTo(0, -1 * s);
      ctx.lineTo(6.5 * s, -1 * s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawHouses(project, state) {
    for (const house of state.houses) {
      const base = project(house.x, groundHeight(house.x, house.z) + 0.5, house.z);
      if (!base || base.s * house.w < 4) continue;
      const w = house.w * base.s, h = house.h * base.s, d = house.d * base.s;
      const top = project(house.x, groundHeight(house.x, house.z) + house.h + 0.5, house.z);
      if (!top) continue;
      // Walls (front face) and a pitched roof, shaded by height.
      ctx.fillStyle = house.walls;
      ctx.fillRect(base.x - w / 2, top.y, w, base.y - top.y);
      ctx.fillStyle = house.roofs;
      ctx.beginPath();
      ctx.moveTo(base.x - w / 2 - d * 0.12, top.y);
      ctx.lineTo(base.x, top.y - h * 0.55);
      ctx.lineTo(base.x + w / 2 + d * 0.12, top.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPalms(project, state) {
    const t = state.time;
    for (const palm of state.palms) {
      const base = project(palm.x, groundHeight(palm.x, palm.z), palm.z);
      if (!base || base.s * palm.size < 2) continue;
      const h = palm.size * base.s * 1.6;
      const sway = Math.sin(t * 0.8 + palm.sway) * h * 0.08;
      const topX = base.x + palm.lean * h + sway;
      const topY = base.y - h;
      // Trunk.
      ctx.strokeStyle = '#6b4a2c';
      ctx.lineWidth = Math.max(1, h * 0.06);
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.quadraticCurveTo(base.x + palm.lean * h * 0.5, base.y - h * 0.6, topX, topY);
      ctx.stroke();
      // Fronds.
      ctx.strokeStyle = '#3f7a34';
      ctx.lineWidth = Math.max(1, h * 0.045);
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + palm.sway;
        const fx = topX + Math.cos(a) * h * 0.42;
        const fy = topY + Math.sin(a) * h * 0.2 + h * 0.1;
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.quadraticCurveTo(topX + Math.cos(a) * h * 0.25, topY - h * 0.06, fx, fy);
        ctx.stroke();
      }
      // Coconuts.
      ctx.fillStyle = '#5a3d22';
      ctx.beginPath();
      ctx.arc(topX - h * 0.03, topY + h * 0.04, Math.max(1, h * 0.035), 0, Math.PI * 2);
      ctx.arc(topX + h * 0.03, topY + h * 0.05, Math.max(1, h * 0.035), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBirds(project, state) {
    const t = state.time;
    ctx.strokeStyle = 'rgba(40,40,50,0.85)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const bird of state.birds) {
      const a = bird.phase + t * bird.speed;
      const x = bird.cx + Math.cos(a) * bird.r;
      const z = bird.cz + Math.sin(a) * bird.r;
      const y = bird.y + Math.sin(t * 0.5 + bird.phase) * 8;
      const pr = project(x, y, z);
      if (!pr || pr.s * 8 < 2) continue;
      const s = Math.max(2, pr.s * 7);
      const flap = Math.sin(t * 6 + bird.phase) * 0.5;
      ctx.beginPath();
      ctx.moveTo(pr.x - s, pr.y - s * flap);
      ctx.quadraticCurveTo(pr.x, pr.y + s * 0.3, pr.x + s, pr.y - s * flap);
      ctx.stroke();
    }
  }

  function drawRings(project, state) {
    state.rings.forEach((ring, idx) => {
      if (ring.passed) return;
      const isNext = idx === state.ringIndex;
      const ux = ring.nz, uz = -ring.nx;
      const pts = [];
      let ok = true;
      for (let i = 0; i <= 20; i += 1) {
        const t = (i / 20) * Math.PI * 2;
        const pr = project(
          ring.x + Math.cos(t) * ux * ring.radius,
          ring.y + Math.sin(t) * ring.radius,
          ring.z + Math.cos(t) * uz * ring.radius,
        );
        if (!pr) { ok = false; break; }
        pts.push(pr);
      }
      if (!ok) return;
      const centre = project(ring.x, ring.y, ring.z);
      const width = centre ? Math.max(2, ring.radius * centre.s * 0.16) : 3;
      ctx.lineJoin = 'round';
      // Outer glow, then a bright core: the ring reads as a lit torus.
      ctx.strokeStyle = isNext ? 'rgba(255,180,40,0.35)' : 'rgba(255,207,61,0.18)';
      ctx.lineWidth = width * 2.1;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.stroke();
      ctx.strokeStyle = isNext ? '#ffcf3d' : 'rgba(255,207,61,0.5)';
      ctx.lineWidth = width;
      if (isNext) { ctx.shadowColor = '#ffbf00'; ctx.shadowBlur = 18; }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (isNext) {
        // Beacon beam above the next ring, and its distance on the ring.
        const top = project(ring.x, ring.y + 170, ring.z);
        const bot = project(ring.x, ring.y, ring.z);
        if (top && bot) {
          ctx.strokeStyle = 'rgba(255,207,61,0.35)';
          ctx.lineWidth = Math.max(2, width * 0.5);
          ctx.beginPath();
          ctx.moveTo(bot.x, bot.y);
          ctx.lineTo(top.x, top.y);
          ctx.stroke();
        }
        if (centre) {
          const dist = Math.round(Math.hypot(
            ring.x - state.plane.x, ring.y - state.plane.y, ring.z - state.plane.z,
          ));
          glowText(`RING ${idx + 1} · ${dist}m`, centre.x, centre.y - ring.radius * centre.s - 14, 14, '#ffcf3d');
        }
      }
    });
  }

  /** The Dart-9 from behind, banked with the roll, prop spinning, lights lit. */
  function drawPlane(pr, p, state) {
    const s = pr.s;
    const span = 11 * s;
    const body = 2.1 * s;
    ctx.save();
    ctx.translate(pr.x, pr.y);
    ctx.rotate(-p.roll * 0.9);
    // Propeller blur disc and spinner, ahead of the nose.
    const propR = 1.15 * body;
    ctx.fillStyle = 'rgba(220,225,230,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, -0.62 * body, propR, propR * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f7f7a';
    ctx.beginPath();
    ctx.arc(0, -0.62 * body, Math.max(1.5, 0.14 * body), 0, Math.PI * 2);
    ctx.fill();
    // Wings: pale top with a coral stripe, teal underside edge, struts.
    ctx.fillStyle = '#e9e4d6';
    ctx.beginPath();
    ctx.moveTo(-span / 2, 0.1 * body);
    ctx.lineTo(-span * 0.08, -0.12 * body);
    ctx.lineTo(span * 0.08, -0.12 * body);
    ctx.lineTo(span / 2, 0.1 * body);
    ctx.lineTo(span * 0.3, 0.42 * body);
    ctx.lineTo(-span * 0.3, 0.42 * body);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e0654a';
    ctx.fillRect(-span * 0.32, 0.08 * body, span * 0.64, 0.09 * body);
    ctx.fillStyle = '#2f7f7a';
    ctx.beginPath();
    ctx.moveTo(-span / 2, 0.1 * body);
    ctx.lineTo(-span * 0.3, 0.42 * body);
    ctx.lineTo(span * 0.3, 0.42 * body);
    ctx.lineTo(span / 2, 0.1 * body);
    ctx.lineTo(span * 0.08, 0.3 * body);
    ctx.lineTo(-span * 0.08, 0.3 * body);
    ctx.closePath();
    ctx.fill();
    // Wing struts.
    ctx.strokeStyle = '#8a8474';
    ctx.lineWidth = Math.max(1, 0.05 * body);
    ctx.beginPath();
    ctx.moveTo(-0.3 * body, 0.35 * body);
    ctx.lineTo(-span * 0.32, 0.28 * body);
    ctx.moveTo(0.3 * body, 0.35 * body);
    ctx.lineTo(span * 0.32, 0.28 * body);
    ctx.stroke();
    // Horizontal stabiliser.
    ctx.fillStyle = '#d8d2c2';
    ctx.beginPath();
    ctx.moveTo(-0.24 * span, -0.5 * body);
    ctx.lineTo(-0.06 * span, -0.62 * body);
    ctx.lineTo(0.06 * span, -0.62 * body);
    ctx.lineTo(0.24 * span, -0.5 * body);
    ctx.lineTo(0.1 * span, -0.32 * body);
    ctx.lineTo(-0.1 * span, -0.32 * body);
    ctx.closePath();
    ctx.fill();
    // Fuselage: rounded rear, cream with a coral cheatline and cabin windows.
    ctx.fillStyle = '#f4efe2';
    roundRectPath(-0.42 * body, -0.55 * body, 0.84 * body, 1.5 * body, 0.3 * body);
    ctx.fill();
    ctx.fillStyle = '#e0654a';
    ctx.fillRect(-0.42 * body, 0.28 * body, 0.84 * body, 0.16 * body);
    ctx.fillStyle = '#274060';
    roundRectPath(-0.3 * body, -0.28 * body, 0.24 * body, 0.3 * body, 0.06 * body);
    ctx.fill();
    roundRectPath(0.06 * body, -0.28 * body, 0.24 * body, 0.3 * body, 0.06 * body);
    ctx.fill();
    // Vertical fin with the tail mark.
    ctx.fillStyle = '#2f7f7a';
    ctx.beginPath();
    ctx.moveTo(-0.16 * body, -0.5 * body);
    ctx.lineTo(-0.2 * body, -1.5 * body);
    ctx.lineTo(0.2 * body, -1.5 * body);
    ctx.lineTo(0.16 * body, -0.5 * body);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4efe2';
    ctx.font = `bold ${Math.max(7, 0.16 * body)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('PK-DRT', 0, -1.05 * body);
    // Landing gear, tucked under the belly.
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = Math.max(1, 0.06 * body);
    ctx.beginPath();
    ctx.moveTo(-0.3 * body, 0.95 * body);
    ctx.lineTo(-0.34 * body, 1.25 * body);
    ctx.moveTo(0.3 * body, 0.95 * body);
    ctx.lineTo(0.34 * body, 1.25 * body);
    ctx.stroke();
    ctx.fillStyle = '#222222';
    ctx.beginPath();
    ctx.arc(-0.34 * body, 1.28 * body, Math.max(1.5, 0.09 * body), 0, Math.PI * 2);
    ctx.arc(0.34 * body, 1.28 * body, Math.max(1.5, 0.09 * body), 0, Math.PI * 2);
    ctx.fill();
    // Tail light and wingtip nav lights, glowing.
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -1.5 * body, Math.max(1.5, 0.05 * body), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = '#ff3b30';
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath();
    ctx.arc(-span / 2, 0.1 * body, Math.max(2, 0.07 * body), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = '#30e05a';
    ctx.fillStyle = '#30e05a';
    ctx.beginPath();
    ctx.arc(span / 2, 0.1 * body, Math.max(2, 0.07 * body), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawHud(state, screen, best) {
    const p = state.plane;
    const kts = Math.round(p.speed * 1.94384);
    const feet = Math.round(p.y * 3.28084);
    const headingDeg = Math.round((((p.heading * 180) / Math.PI) % 360 + 360) % 360);
    const agl = Math.max(0, Math.round((p.y - groundHeight(p.x, p.z)) * 3.28084));
    const vsi = Math.round(p.vy * 3.28084 * 60); // feet per minute
    const timeLeft = Math.max(0, state.mission.limit - state.time);
    const target = state.rings[state.ringIndex];
    const targetDist = target
      ? Math.round(Math.hypot(target.x - p.x, target.y - p.y, target.z - p.z))
      : Math.round(Math.hypot(ISLAND.strip.x - p.x, ISLAND.strip.z - p.z));

    // Top-left: mission, score, rings, time.
    panelBox(14, 14, 250, 96, 0.5);
    ctx.textAlign = 'left';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillStyle = '#9fd8ff';
    ctx.fillText(state.mission.tag, 28, 36);
    glowText(`${state.score}`, 28, 66, 30, '#ffffff', 'left');
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = '#ffd27a';
    ctx.fillText(`RINGS ${state.ringIndex}/${state.rings.length}`, 28, 90);
    ctx.fillStyle = '#cfe8f7';
    ctx.fillText(`TIME ${fmtTime(timeLeft)}`, 150, 90);
    ctx.fillStyle = '#8fb8d8';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(`BEST ${best}`, 150, 36);

    // Compass tape, top centre, with the next target underneath it.
    const cx = W / 2;
    panelBox(cx - 210, 14, 420, 44, 0.5);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 210, 14, 420, 44);
    ctx.clip();
    for (let d = -45; d <= 45; d += 5) {
      const hd = (headingDeg + d + 360) % 360;
      const x = cx + d * 4.6;
      const major = hd % 45 === 0;
      ctx.strokeStyle = major ? '#ffffff' : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 50);
      ctx.lineTo(x, major ? 34 : 42);
      ctx.stroke();
      if (major) {
        const label = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[hd];
        ctx.font = '700 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, x, 28);
      }
    }
    ctx.restore();
    glowText(`${String(headingDeg).padStart(3, '0')}°`, cx, 52, 15, '#ffd27a');
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath();
    ctx.moveTo(cx - 6, 14);
    ctx.lineTo(cx + 6, 14);
    ctx.lineTo(cx, 22);
    ctx.closePath();
    ctx.fill();
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcf3d';
    ctx.fillText(target ? `NEXT: RING ${state.ringIndex + 1} · ${targetDist}m` : `NEXT: RUNWAY · ${targetDist}m`, cx, 76);

    // Airspeed, left.
    panelBox(14, H / 2 - 70, 92, 140, 0.5);
    glowText(`${kts}`, 60, H / 2 - 18, 30, '#7dffb0', 'center');
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fd8ff';
    ctx.fillText('KNOTS', 60, H / 2 + 2);
    ctx.fillText('AIRSPEED', 60, H / 2 + 52);

    // Altitude, right, with a vertical-speed needle beside it.
    panelBox(W - 106, H / 2 - 70, 92, 140, 0.5);
    glowText(`${feet}`, W - 60, H / 2 - 18, 30, '#7dc4ff', 'center');
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fd8ff';
    ctx.fillText('FEET', W - 60, H / 2 + 2);
    ctx.fillText(`AGL ${agl} FT`, W - 60, H / 2 + 52);
    const vsiY = H / 2 - 70 + 70 - clamp(vsi / 1000, -1, 1) * 55;
    ctx.strokeStyle = vsi >= 0 ? '#7dffb0' : '#ffb03d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W - 126, H / 2);
    ctx.lineTo(W - 126, vsiY);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${vsi >= 0 ? '+' : ''}${vsi}`, W - 130, vsiY + 3);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8fb8d8';
    ctx.fillText('VSI', W - 126, H / 2 + 68);

    // Attitude indicator, bottom centre.
    const ax = W / 2, ay = H - 78, ar = 52;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(ax, ay);
    ctx.rotate(-p.roll);
    ctx.translate(0, p.pitch * 90);
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-ar - 10, -ar * 2 - 10, ar * 2 + 20, ar * 2 + 10);
    ctx.fillStyle = '#8a6a42';
    ctx.fillRect(-ar - 10, 0, ar * 2 + 20, ar * 2 + 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-ar, 0);
    ctx.lineTo(ar, 0);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (const off of [-24, 24]) {
      ctx.beginPath();
      ctx.moveTo(-16, off);
      ctx.lineTo(16, off);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(160,225,255,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = '#ffd27a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ax - 26, ay);
    ctx.lineTo(ax - 8, ay);
    ctx.moveTo(ax + 8, ay);
    ctx.lineTo(ax + 26, ay);
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax, ay + 6);
    ctx.stroke();

    // Throttle and fuel, bottom left and right.
    panelBox(14, H - 96, 150, 82, 0.5);
    ctx.textAlign = 'left';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillStyle = '#9fd8ff';
    ctx.fillText('THROTTLE', 26, H - 74);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(26, H - 64, 126, 12);
    ctx.fillStyle = p.throttle > 0.85 ? '#ffb03d' : '#4fc3f7';
    ctx.fillRect(26, H - 64, 126 * p.throttle, 12);
    glowText(`${Math.round(p.throttle * 100)}%`, 26, H - 34, 15, '#ffffff', 'left');
    ctx.fillStyle = p.flaps ? '#ffd27a' : 'rgba(160,200,220,0.6)';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(p.flaps ? 'FLAPS DOWN' : 'FLAPS UP', 82, H - 34);

    panelBox(W - 164, H - 96, 150, 82, 0.5);
    ctx.textAlign = 'left';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillStyle = state.fuel < 20 ? '#ff8a7a' : '#9fd8ff';
    ctx.fillText('FUEL', W - 152, H - 74);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(W - 152, H - 64, 126, 12);
    ctx.fillStyle = state.fuel < 20 ? '#ff5a45' : state.fuel < 45 ? '#ffb03d' : '#7dffb0';
    ctx.fillRect(W - 152, H - 64, 126 * (state.fuel / state.mission.fuel), 12);
    glowText(`${Math.round(state.fuel)}`, W - 152, H - 34, 15, '#ffffff', 'left');
    ctx.fillStyle = '#8fb8d8';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText('LITRES', W - 116, H - 34);

    // Minimap, top right: the island, the strip, the rings, the plane.
    drawMinimap(state, headingDeg);

    // Centre reticle.
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2 - 40, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2 - 53);
    ctx.lineTo(W / 2, H / 2 - 49);
    ctx.moveTo(W / 2, H / 2 - 27);
    ctx.lineTo(W / 2, H / 2 - 31);
    ctx.stroke();

    // Banner messages while flying.
    if (screen === SCREEN.play && state.banner && state.time < state.bannerUntil) {
      glowText(state.banner, W / 2, 96, 24, '#ffd27a');
    }
    drawRingPointer(state);
    if (state.screen === 'play' && p.speed < (p.flaps ? 22 : 27) && !p.onGround) {
      glowText('STALL', W / 2, H - 150, 22, '#ff6a5a');
    }
  }

  function drawMinimap(state, headingDeg) {
    const mx = W - 164, my = 122, mw = 150, mh = 150;
    panelBox(mx, my, mw, mh, 0.55);
    const cx = mx + mw / 2, cy = my + mh / 2;
    const scale = (mw / 2 - 8) / (ISLAND.radius * 1.15);
    const toMap = (x, z) => [cx + x * scale, cy + (z - ISLAND.centreZ) * scale];
    // Sea and island.
    ctx.fillStyle = '#1e6ea6';
    ctx.beginPath();
    ctx.arc(cx, cy, mw / 2 - 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5d8a48';
    ctx.beginPath();
    ctx.arc(cx, cy, ISLAND.radius * scale, 0, Math.PI * 2);
    ctx.fill();
    // Runway strip.
    const [rx, ry] = toMap(ISLAND.strip.x, ISLAND.strip.z);
    ctx.strokeStyle = '#e8e8e2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rx, ry - (ISLAND.strip.length / 2) * scale);
    ctx.lineTo(rx, ry + (ISLAND.strip.length / 2) * scale);
    ctx.stroke();
    // Rings: gold for the next one, dim for the rest, grey once passed.
    state.rings.forEach((ring, idx) => {
      const [x, y] = toMap(ring.x, ring.z);
      ctx.fillStyle = ring.passed ? 'rgba(200,200,200,0.5)' : idx === state.ringIndex ? '#ffcf3d' : 'rgba(255,207,61,0.55)';
      ctx.beginPath();
      ctx.arc(x, y, idx === state.ringIndex ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
    });
    // The plane, pointing by heading.
    const [px, py] = toMap(state.plane.x, state.plane.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.plane.heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // North marker.
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, my + 14);
    void headingDeg;
  }

  function drawRingPointer(state) {
    const target = state.rings[state.ringIndex];
    if (!target || state.screen !== 'play') return;
    const p = state.plane;
    const dist = Math.round(Math.hypot(target.x - p.x, target.y - p.y, target.z - p.z));
    const dx = target.x - p.x, dz = target.z - p.z;
    const bearing = Math.atan2(dx, -dz);
    const rel = ((bearing - p.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(rel) < Math.PI / 2.4) return; // the ring is in view already
    const side = rel > 0 ? 1 : -1;
    const ax = W / 2 + side * (W / 2 - 70);
    const ay = H / 2 - 60;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(side * Math.PI / 2);
    ctx.fillStyle = '#ffcf3d';
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(12, 10);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    glowText(`RING ${state.ringIndex + 1} · ${dist}m`, ax, ay + 34, 13, '#ffcf3d');
  }

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(6,12,20,0.42)';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2;
    glowText('CLOUD COURIER', cx, 108, 64, '#ffffff');
    glowText('CORAL ISLAND RUN', cx, 146, 22, '#ffd27a');
    ctx.font = '500 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8f4ff';
    ctx.fillText('Fly the Dart-9 bush plane through the sky rings, then bring her home to the strip.', cx, 180);
    const cardW = 250, gap = 22, total = cardW * 3 + gap * 2;
    MISSIONS.forEach((m, i) => {
      const x = cx - total / 2 + i * (cardW + gap);
      const y = 218;
      panelBox(x, y, cardW, 132, 0.62);
      ctx.textAlign = 'left';
      glowText(`${i + 1} · ${m.name.toUpperCase()}`, x + 16, y + 30, 16, i === state.missionId ? '#ffd27a' : '#ffffff', 'left');
      ctx.font = '500 13px system-ui, sans-serif';
      ctx.fillStyle = '#d6e9f7';
      wrapLines(m.blurb, x + 16, y + 56, cardW - 32, 18);
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillStyle = '#9fd8ff';
      ctx.fillText(`${m.rings} rings · ${m.fuel} fuel · ${Math.floor(m.limit / 60)}:${String(m.limit % 60).padStart(2, '0')}`, x + 16, y + 116);
    });
    ctx.textAlign = 'center';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Arrows steer · W / S throttle · F flaps · B brake · Mouse steers too · P pause', cx, 396);
    glowText('Press ENTER or click to fly', cx, 436, 22, '#7dffb0');
    if (best > 0) {
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillStyle = '#ffd27a';
      ctx.fillText(`Best score: ${best}`, cx, 468);
    }
  }

  function wrapLines(text, x, y, maxW, lh) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, yy);
        line = word;
        yy += lh;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
  }

  function drawPanel(title, sub, bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    glowText(title, W / 2, H / 2 - 12, 52, '#ffffff');
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8f4ff';
    ctx.fillText(sub, W / 2, H / 2 + 28);
  }

  function drawLanded(state, best) {
    ctx.fillStyle = 'rgba(8,26,16,0.5)';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2;
    glowText('LANDED!', cx, H / 2 - 96, 52, '#7dffb0');
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8f4ff';
    ctx.fillText(`Rings flown: ${state.ringIndex}/${state.rings.length}   ·   Fuel left ${Math.round(state.fuel)}   ·   Time ${fmtTime(state.time)}`, cx, H / 2 - 48);
    ctx.fillText(`Fuel bonus +${Math.round(state.fuel * (state.mission.fuelBonus ?? 1) * 5)}   ·   Ring bonus +${state.ringIndex * 25}`, cx, H / 2 - 20);
    glowText(`SCORE ${state.score}`, cx, H / 2 + 32, 34, '#ffd27a');
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Best ${Math.max(best, state.score)}  ·  Press R to fly again, or Enter for the next mission`, cx, H / 2 + 72);
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return `${m}:${String(ss).padStart(2, '0')}`;
  }

  return { draw, resize };
}
