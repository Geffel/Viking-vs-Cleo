import { TICK_MS } from './constants.js';

export const SNAP_DIST = 220;
export const LOCAL_EXTRAP_MS = 50;

// Used by both the renderer and server hit testing. Never interpolate a respawn.
export function samplePlayer(a, b, alpha) {
  if (!b) return a;
  if (a.life !== b.life || Math.hypot(b.x - a.x, b.y - a.y) > SNAP_DIST) return b;
  return { ...a, x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha };
}

export function extrapolatePlayer(p, ageMs) {
  if (!p || p.d) return p;
  const ticks = Math.max(0, Math.min(LOCAL_EXTRAP_MS, ageMs)) / TICK_MS;
  return { ...p, x: p.x + (p.vx || 0) * ticks, y: p.y + (p.vy || 0) * ticks };
}

export function validView(view) {
  return view !== null && typeof view === 'object' && !Array.isArray(view)
    && ['game', 'a', 'b', 'self'].every((key) => Number.isSafeInteger(view[key]) && view[key] > 0)
    && view.a <= view.b && view.b <= view.self
    && Number.isFinite(view.alpha) && view.alpha >= 0 && view.alpha <= 1
    && Number.isFinite(view.extrapMs) && view.extrapMs >= 0 && view.extrapMs <= LOCAL_EXTRAP_MS;
}
