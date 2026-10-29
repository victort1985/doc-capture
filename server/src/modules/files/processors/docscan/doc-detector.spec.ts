import { estimateAspect, rectifiedSize, orderQuad, Quad } from './doc-detector';

/** Projects a flat w×h (mm) page through a pinhole camera: f px, rotation about x then y. */
function project(w: number, h: number, tilt: number, yaw: number, Z: number, imgW = 1200, imgH = 1600, f = 1100): Quad {
  const cx = Math.cos(tilt), sx = Math.sin(tilt), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => {
    // Rx(tilt) * Ry(yaw) * [x, y, 0]
    const x1 = x * cy, y1 = y, z1 = -x * sy;
    const y2 = y1 * cx - z1 * sx, z2 = y1 * sx + z1 * cx;
    const z = z2 + Z;
    return { x: imgW / 2 + (f * x1) / z, y: imgH / 2 + (f * y2) / z };
  });
  return pts as Quad;
}

describe('docscan geometry', () => {
  it('recovers the true A4 proportions from a tilted perspective view', () => {
    for (const [tilt, yaw] of [[0.4, 0.3], [0.2, -0.5], [0.7, 0.1], [0.1, 0.1]]) {
      const q = project(210, 297, tilt, yaw, 520);
      const r = estimateAspect(q, 1200, 1600)!;
      expect(r).not.toBeNull();
      expect(Math.max(r, 1 / r)).toBeCloseTo(297 / 210, 1);
    }
  });

  it('snaps to A4 only when the measurement agrees', () => {
    const a4 = rectifiedSize(project(210, 297, 0.4, 0.3, 520), 1200, 1600, Math.SQRT2, 1000);
    expect(a4.height / a4.width).toBeCloseTo(Math.SQRT2, 3);
    const square = rectifiedSize(project(200, 200, 0.4, 0.3, 520), 1200, 1600, Math.SQRT2, 1000);
    expect(square.height / square.width).toBeLessThan(1.1); // not forced to A4
  });

  it('orders corners TL, TR, BR, BL', () => {
    const q = orderQuad([{ x: 90, y: 100 }, { x: 10, y: 10 }, { x: 95, y: 5 }, { x: 5, y: 90 }]);
    expect(q.map((p) => [p.x, p.y])).toEqual([[10, 10], [95, 5], [90, 100], [5, 90]]);
  });
});
