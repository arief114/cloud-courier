// The renderer: a hand-rolled 3D chase view in plain canvas 2D — sky, island terrain,
// clouds, sky rings, the Dart-9 plane, a lit instrument HUD, and the title/end screens.
// No images, no libraries: every pixel is drawn from the world state.
import { MISSIONS, SKIES, WORLD } from './config.js';
import { clamp, lerp } from './random.js';
import { isWater, roadPaths, runwayFactor, terrainColor, terrainHeight } from './terrain.js';
import { SCREEN_CRASHED, SCREEN_LANDED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TIMEOUT, SCREEN_TITLE } from './world.js';

const NEAR_CELL = 110, NEAR_EXTENT = 1210;
const FAR_CELL = 330, FAR_EXTENT = 3630;

export function createRenderer(canvas) {
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

  function skyGradient(sky, horizonY) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.top);
    g.addColorStop(Math.max(0.1, horizonY / H - 0.12), sky.mid);
    g.addColorStop(Math.min(1, horizonY / H + 0.12), sky.horizon);
    g.addColorStop(1, sky.horizon);
    return g;
  }

  function draw(state, screen, best) {
    const p = state.plane;
    const sky = SKIES[state.mission.sky] || SKIES.day;
    const f = H * 1.05;

    // ---- Camera: chase, behind and above the plane, looking ahead of it. The camera
    // follows only half the plane's pitch so climbs and dives never swing the view.
    // On the title screen it pulls back for a wider look at the strip.
    const camPitch = p.pitch * 0.45;
    const camDist = screen === SCREEN_TITLE ? 36 : 26;
    const camHeight = screen === SCREEN_TITLE ? 9.5 : 7.5;
    const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
    const fwd = { x: Math.sin(p.heading) * cp, y: sp, z: -Math.cos(p.heading) * cp };
    const eye = {
      x: p.x - fwd.x * camDist,
      y: p.y - fwd.y * camDist + camHeight,
      z: p.z - fwd.z * camDist,
    };
    const look = { x: p.x + fwd.x * 60, y: p.y + fwd.y * 60 + 1.5, z: p.z + fwd.z * 60 };
    const lf = norm3(look.x - eye.x, look.y - eye.y, look.z - eye.z);
    // right = normalize(cross(lf, worldUp)): (-lf.z, 0, lf.x), normalised.
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
    // Horizon line on screen, for the sky gradient and fog band.
    const hor = project(eye.x + lf.x * 9000, eye.y, eye.z + lf.z * 9000);
    const horizonY = hor ? hor.y : H * 0.42;

    // ---- Sky.
    ctx.fillStyle = skyGradient(sky, horizonY);
    ctx.fillRect(0, 0, W, H);
    // Sun.
    const sunX = W * sky.sunX, sunY = H * sky.sunY;
    const sunG = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 130);
    sunG.addColorStop(0, sky.sun);
    sunG.addColorStop(0.25, 'rgba(255,244,200,0.55)');
    sunG.addColorStop(1, 'rgba(255,244,200,0)');
    ctx.fillStyle = sunG;
    ctx.fillRect(sunX - 140, sunY - 140, 280, 280);

    // ---- Terrain: two grids of quads, far to near. Quads with a corner behind the
    // camera are skipped; the ground colour painted under them (below) covers the gap
    // so the near ground never shows sky.
    ctx.fillStyle = terrainColor(eye.x, eye.z, NEAR_CELL);
    ctx.fillRect(0, horizonY, W, H - horizonY);
    const gx = Math.round(eye.x / NEAR_CELL) * NEAR_CELL;
    const gz = Math.round(eye.z / NEAR_CELL) * NEAR_CELL;
    const quads = [];
    function addGrid(cell, extent, skipInner) {
      const n = Math.round(extent / cell);
      const ox = Math.round(eye.x / cell) * cell;
      const oz = Math.round(eye.z / cell) * cell;
      for (let iz = -n; iz < n; iz += 1) {
        for (let ix = -n; ix < n; ix += 1) {
          const cx0 = ox + ix * cell, cz0 = oz + iz * cell;
          if (skipInner && Math.abs(cx0 - gx) < NEAR_EXTENT && Math.abs(cz0 - gz) < NEAR_EXTENT) continue;
          const x0 = cx0, x1 = cx0 + cell, z0 = cz0, z1 = cz0 + cell;
          const a = project(x0, terrainHeight(x0, z0), z0);
          const b = project(x1, terrainHeight(x1, z0), z0);
          const c = project(x1, terrainHeight(x1, z1), z1);
          const d = project(x0, terrainHeight(x0, z1), z1);
          if (!a || !b || !c || !d) continue;
          const depth = (a.d + b.d + c.d + d.d) / 4;
          quads.push({ a, b, c, d, depth, color: terrainColor(cx0 + cell / 2, cz0 + cell / 2, cell) });
        }
      }
    }
    addGrid(FAR_CELL, FAR_EXTENT, true);
    addGrid(NEAR_CELL, NEAR_EXTENT, false);
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

    // ---- Runway and roads, drawn at their true width over the terrain.
    drawRunway(project);
    drawRoads(project);

    // ---- Fog band at the horizon.
    const fogG = ctx.createLinearGradient(0, horizonY - H * 0.22, 0, horizonY + H * 0.1);
    fogG.addColorStop(0, 'rgba(255,255,255,0)');
    fogG.addColorStop(0.75, hexA(sky.fog, 0.5));
    fogG.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fogG;
    ctx.fillRect(0, Math.max(0, horizonY - H * 0.22), W, H * 0.32);

    // ---- Clouds, far to near.
    const cloudList = [];
    for (const cl of state.clouds) {
      const pr = project(cl.x, cl.y, cl.z);
      if (pr) cloudList.push({ cl, pr });
    }
    cloudList.sort((a, b) => b.pr.d - a.pr.d);
    for (const { cl, pr } of cloudList) {
      const s = pr.s * cl.size;
      if (s < 4) continue;
      const alpha = clamp(1.15 - pr.d / 9000, 0.25, 0.9);
      ctx.fillStyle = shadeAlpha(sky.cloud, alpha);
      for (let i = 0; i < cl.puffs; i += 1) {
        const px = pr.x + Math.sin(cl.seed + i * 2.3) * s * 0.42;
        const py = pr.y + Math.cos(cl.seed + i * 1.7) * s * 0.1;
        const rpx = s * (0.3 + ((cl.seed + i * 7) % 10) / 55);
        ctx.beginPath();
        ctx.ellipse(px, py, rpx, rpx * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = shadeAlpha(sky.cloudShade, alpha * 0.8);
      ctx.beginPath();
      ctx.ellipse(pr.x, pr.y + s * 0.12, s * 0.5, s * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- Rings.
    if (screen !== SCREEN_TITLE) {
      state.rings.forEach((ring, idx) => {
        if (ring.passed) return;
        const isNext = idx === state.ringIndex;
        const ux = ring.nz, uz = -ring.nx; // horizontal basis across the ring
        const pts = [];
        let ok = true;
        for (let i = 0; i <= 20; i += 1) {
          const t = (i / 20) * Math.PI * 2;
          const px = ring.x + Math.cos(t) * ux * ring.radius;
          const py = ring.y + Math.sin(t) * ring.radius;
          const pz = ring.z + Math.cos(t) * uz * ring.radius;
          const pr = project(px, py, pz);
          if (!pr) { ok = false; break; }
          pts.push(pr);
        }
        if (!ok) return;
        const centre = project(ring.x, ring.y, ring.z);
        const width = centre ? Math.max(2, ring.radius * centre.s * 0.16) : 3;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = isNext ? '#ffcf3d' : 'rgba(255,207,61,0.45)';
        ctx.lineWidth = width;
        if (isNext) { ctx.shadowColor = '#ffbf00'; ctx.shadowBlur = 18; }
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0;
        if (isNext) {
          // A light beam above the next ring so the pilot can find it.
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
        }
      });
    }

    // ---- The plane (chase view) with its shadow on the ground.
    const planePr = project(p.x, p.y, p.z);
    const groundY = terrainHeight(p.x, p.z);
    const shadowPr = project(p.x, groundY + 0.5, p.z);
    if (shadowPr && !p.onGround) {
      const alt = Math.max(0, p.y - groundY);
      const shScale = clamp(1 - alt / 900, 0.25, 1);
      ctx.fillStyle = `rgba(20,30,20,${0.3 * shScale})`;
      ctx.beginPath();
      ctx.ellipse(shadowPr.x, shadowPr.y, 26 * shadowPr.s * shScale, 7 * shadowPr.s * shScale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (planePr) drawPlane(planePr, p);

    // ---- HUD and screens.
    if (screen !== SCREEN_TITLE) drawHud(state, screen, best);
    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else if (screen === SCREEN_PAUSED) drawCenterPanel('PAUSED', 'Press P or click to keep flying', 'rgba(10,18,28,0.66)');
    else if (screen === SCREEN_LANDED) drawLanded(state, best);
    else if (screen === SCREEN_CRASHED) drawCenterPanel('CRASHED', `${state.crashed || ''} — score ${state.score}. Press R to fly again.`, 'rgba(60,12,10,0.72)');
    else if (screen === SCREEN_TIMEOUT) drawCenterPanel('OUT OF TIME', `Score ${state.score}. Press R to fly again.`, 'rgba(40,30,8,0.72)');
  }

  function norm3(x, y, z) {
    const l = Math.hypot(x, y, z) || 1;
    return { x: x / l, y: y / l, z: z / l };
  }

  function hexA(hex, alpha) {
    const m = hex.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(',').map((s) => s.trim());
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
    }
    return hex;
  }

  function shadeAlpha(rgba, alpha) {
    return hexA(rgba, alpha);
  }

  /** The runway strip, asphalt with a dashed centreline and threshold bars. */
  /** The runway, drawn in short segments so the part ahead of the camera still shows
   *  when the near end is behind it (the title camera sits low over the strip). */
  function drawRunway(project) {
    const rw = WORLD.runway;
    const hw = rw.width / 2;
    const z0 = rw.cz - rw.length / 2, z1 = rw.cz + rw.length / 2;
    const SEG = 60;
    for (let z = z0; z < z1; z += SEG) {
      const za = z, zb = Math.min(z + SEG, z1);
      const a = project(rw.cx - hw, 2.6, za), b = project(rw.cx + hw, 2.6, za);
      const c = project(rw.cx + hw, 2.6, zb), d = project(rw.cx - hw, 2.6, zb);
      if (!a || !b || !c || !d) continue;
      ctx.fillStyle = '#3b4048';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
    // Dashed centreline, one dash per 46 m.
    ctx.fillStyle = '#e8e8e2';
    for (let z = z0 + 12; z < z1 - 12; z += 46) {
      const a = project(rw.cx - 2, 2.8, z), b = project(rw.cx + 2, 2.8, z);
      const c = project(rw.cx + 2, 2.8, z + 23), d = project(rw.cx - 2, 2.8, z + 23);
      if (!a || !b || !c || !d) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
    // Threshold bars at both ends.
    ctx.fillStyle = '#d8d8d0';
    for (const zt of [z0 + 18, z1 - 18]) {
      for (let k = -2; k <= 2; k += 1) {
        const a = project(rw.cx + k * 6 - 2, 2.8, zt), b = project(rw.cx + k * 6 + 2, 2.8, zt);
        const c = project(rw.cx + k * 6 + 2, 2.8, zt + 26), d = project(rw.cx + k * 6 - 2, 2.8, zt + 26);
        if (!a || !b || !c || !d) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(d.x, d.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  /** The roads, stroked segment by segment so their width follows perspective. */
  function drawRoads(project) {
    ctx.strokeStyle = '#6d7178';
    ctx.lineCap = 'round';
    for (const path of roadPaths()) {
      for (let i = 0; i < path.length - 1; i += 1) {
        const [x1, z1] = path[i];
        const [x2, z2] = path[i + 1];
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
        const a = project(x1, terrainHeight(x1, z1) + 0.4, z1);
        const b = project(x2, terrainHeight(x2, z2) + 0.4, z2);
        const m = project(mx, terrainHeight(mx, mz) + 0.4, mz);
        if (!a || !b || !m) continue;
        ctx.lineWidth = Math.max(1, 13 * m.s);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  /** The Dart-9 bush plane from behind, banked with the roll, lit nav lights on the tips. */
  function drawPlane(pr, p) {
    const s = pr.s; // pixels per metre at the plane
    const span = 11 * s;
    const body = 2.1 * s;
    ctx.save();
    ctx.translate(pr.x, pr.y);
    ctx.rotate(-p.roll * 0.9);
    // Wings: swept trapezoids, pale top, teal underside edge.
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
    // Fuselage: rounded rear, cream with a coral cheatline.
    ctx.fillStyle = '#f4efe2';
    roundRect(-0.42 * body, -0.55 * body, 0.84 * body, 1.5 * body, 0.3 * body);
    ctx.fill();
    ctx.fillStyle = '#e0654a';
    ctx.fillRect(-0.42 * body, 0.28 * body, 0.84 * body, 0.16 * body);
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

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(x, y, w, h, alpha = 0.55) {
    ctx.fillStyle = `rgba(8,14,22,${alpha})`;
    roundRect(x, y, w, h, 10);
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

  function drawHud(state, screen, best) {
    const p = state.plane;
    const kts = Math.round(p.speed * 1.94384);
    const feet = Math.round(p.y * 3.28084);
    const headingDeg = Math.round((((p.heading * 180) / Math.PI) % 360 + 360) % 360);
    const agl = Math.max(0, Math.round((p.y - terrainHeight(p.x, p.z)) * 3.28084));
    const timeLeft = Math.max(0, state.mission.timeLimit - state.time);

    // Top-left: mission, score, rings, time.
    panel(14, 14, 250, 96, 0.5);
    ctx.textAlign = 'left';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillStyle = '#9fd8ff';
    ctx.fillText(state.mission.short, 28, 36);
    glowText(`${state.score}`, 28, 66, 30, '#ffffff', 'left');
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = '#ffd27a';
    ctx.fillText(`RINGS ${state.ringIndex}/${state.rings.length}`, 28, 90);
    ctx.fillStyle = '#cfe8f7';
    ctx.fillText(`TIME ${fmtTime(timeLeft)}`, 150, 90);
    ctx.fillStyle = '#8fb8d8';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText(`BEST ${best}`, 150, 36);

    // Compass tape, top centre.
    const cx = W / 2;
    panel(cx - 210, 14, 420, 44, 0.5);
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

    // Airspeed, left.
    panel(14, H / 2 - 70, 92, 140, 0.5);
    glowText(`${kts}`, 60, H / 2 - 18, 30, '#7dffb0', 'center');
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fd8ff';
    ctx.fillText('KNOTS', 60, H / 2 + 2);
    ctx.fillText('AIRSPEED', 60, H / 2 + 52);

    // Altitude, right.
    panel(W - 106, H / 2 - 70, 92, 140, 0.5);
    glowText(`${feet}`, W - 60, H / 2 - 18, 30, '#7dc4ff', 'center');
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9fd8ff';
    ctx.fillText('FEET', W - 60, H / 2 + 2);
    ctx.fillText(`AGL ${agl} FT`, W - 60, H / 2 + 52);

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
    panel(14, H - 96, 150, 82, 0.5);
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

    panel(W - 164, H - 96, 150, 82, 0.5);
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

    // Banner messages (while flying only — never over an end screen).
    if (screen === SCREEN_PLAY && state.banner && state.time < state.bannerUntil) {
      glowText(state.banner, W / 2, 96, 24, '#ffd27a');
    }
    // Next-ring pointer: an arrow at the screen edge when the ring is out of view.
    drawNextRingPointer(state);
    // Stall warning.
    if (state.screen === 'play' && p.speed < (p.flaps ? 22 : 27) && !p.onGround) {
      glowText('STALL', W / 2, H - 150, 22, '#ff6a5a');
    }
  }

  function drawNextRingPointer(state) {
    const target = state.rings[state.ringIndex];
    if (!target || state.screen !== 'play') return;
    const p = state.plane;
    const dist = Math.round(Math.hypot(target.x - p.x, target.y - p.y, target.z - p.z));
    // Project the ring; if it is behind the camera, use the heading difference instead.
    const dx = target.x - p.x, dz = target.z - p.z;
    const bearing = Math.atan2(dx, -dz);
    const rel = ((bearing - p.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const ahead = Math.abs(rel) < Math.PI / 2.4;
    if (ahead) return; // The ring (or its beam) is in view already.
    const angle = rel > 0 ? 1 : -1;
    const ax = W / 2 + angle * (W / 2 - 70);
    const ay = H / 2 - 60;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle * Math.PI / 2);
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
    // Mission cards.
    const cardW = 250, gap = 22, total = cardW * 3 + gap * 2;
    MISSIONS.forEach((m, i) => {
      const x = cx - total / 2 + i * (cardW + gap);
      const y = 218;
      panel(x, y, cardW, 132, 0.62);
      ctx.textAlign = 'left';
      glowText(`${i + 1} · ${m.name.toUpperCase()}`, x + 16, y + 30, 16, i === state.missionId ? '#ffd27a' : '#ffffff', 'left');
      ctx.font = '500 13px system-ui, sans-serif';
      ctx.fillStyle = '#d6e9f7';
      wrapText(m.blurb, x + 16, y + 56, cardW - 32, 18);
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillStyle = '#9fd8ff';
      ctx.fillText(`${m.rings} rings · ${m.fuel} fuel · ${Math.floor(m.timeLimit / 60)}:${String(m.timeLimit % 60).padStart(2, '0')}`, x + 16, y + 116);
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

  function wrapText(text, x, y, maxW, lh) {
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

  function drawCenterPanel(title, sub, bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    glowText(title, W / 2, H / 2 - 12, 52, '#ffffff');
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8f4ff';
    ctx.fillText(sub, W / 2, H / 2 + 28);
  }

  function drawLanded(state, best) {
    ctx.fillStyle = 'rgba(8,26,16,0.6)';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2;
    glowText('LANDED!', cx, H / 2 - 84, 52, '#7dffb0');
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8f4ff';
    ctx.fillText(`Rings flown: ${state.ringIndex}/${state.rings.length}   ·   Fuel bonus +${Math.round(state.fuel * (state.mission.fuelBonus ?? 1) * 5)}   ·   Ring bonus +${state.ringIndex * 25}`, cx, H / 2 - 34);
    glowText(`SCORE ${state.score}`, cx, H / 2 + 18, 34, '#ffd27a');
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Best ${Math.max(best, state.score)}  ·  Press R to fly again, or Enter for the next mission`, cx, H / 2 + 58);
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return `${m}:${String(ss).padStart(2, '0')}`;
  }

  return { draw, resize };
}
