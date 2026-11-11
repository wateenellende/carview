// SPDX-License-Identifier: GPL-3.0-or-later
// One configurable rear-view sprite renderer for the six body styles in the built-in catalogue.
// Compatible with the pixel-16bit theme contract in THEMES.md.
export function draw(g, p) {
  const { cx, by, scale: sc, colour, lit, doors, shade, rect, poly, horizon: hz } = p;
  const o = p.options || {};
  const bodyStyle = o.bodyStyle || 'hatchback';
  const styles = {
    hatchback: { w: 62, h: 44, cab: 12, window: 12 },
    coupe: { w: 78, h: 28, cab: 4, window: 7 },
    saloon: { w: 72, h: 35, cab: 9, window: 9 },
    suv: { w: 76, h: 55, cab: 19, window: 15 },
    pickup: { w: 75, h: 42, cab: 16, window: 11 },
    van: { w: 76, h: 65, cab: 31, window: 19 },
  };
  const s = styles[bodyStyle] || styles.hatchback;
  const w = s.w * sc, h = s.h * sc;
  const x = cx - w / 2, y = by - h;
  const dark = shade(colour, -0.36), light = shade(colour, 0.25);
  const glass = '#1a293b', tyre = '#101117';
  const cab = s.cab * sc, win = s.window * sc;
  const leftOpen = doors.frontLeft || doors.rearLeft;
  const rightOpen = doors.frontRight || doors.rearRight;

  if (lit) {
    for (const sign of [-1, 1]) {
      poly([[cx + sign * w * 0.22, y + 5 * sc], [cx + sign * w * 0.60, hz + 3],
        [cx + sign * w * 0.02, hz + 3], [cx + sign * w * 0.12, y + 5 * sc]], '#fff3b0', 0.17);
    }
  }
  rect(x - 6 * sc, by - 3, w + 12 * sc, 6 * sc, 'rgba(0,0,0,0.45)');
  rect(x - 1 * sc, by - 9 * sc, 12 * sc, 10 * sc, tyre);
  rect(x + w - 11 * sc, by - 9 * sc, 12 * sc, 10 * sc, tyre);
  if (leftOpen) {
    poly([[x + 2, y + cab], [x - 17 * sc, y + cab + 3 * sc],
      [x - 17 * sc, by - 8 * sc], [x + 2, by - 7 * sc]], dark);
    rect(x - 12 * sc, y + cab + 5 * sc, 10 * sc, win * 0.65, glass);
  }
  if (rightOpen) {
    poly([[x + w - 2, y + cab], [x + w + 17 * sc, y + cab + 3 * sc],
      [x + w + 17 * sc, by - 8 * sc], [x + w - 2, by - 7 * sc]], dark);
    rect(x + w + 2 * sc, y + cab + 5 * sc, 10 * sc, win * 0.65, glass);
  }

  // Lower body + asymmetric lighting detail give each silhouette some depth.
  rect(x, y + cab, w, h - cab - 4 * sc, colour);
  rect(x + 3 * sc, y + cab + 2 * sc, w - 6 * sc, 2 * sc, light);
  const roofMargin = bodyStyle === 'coupe' ? 16 : bodyStyle === 'saloon' ? 12 : 7;
  const cw = w - 2 * roofMargin * sc;
  const rx = cx - cw / 2;
  rect(rx, y, cw, cab + 3 * sc, colour);
  rect(rx + 2 * sc, y, cw - 4 * sc, 2 * sc, light);

  // Rear glass or open cargo bed.
  if (bodyStyle === 'pickup') {
    // Tailgate down exposes the bed, otherwise a tall rear panel.
    if (doors.tailgate) {
      rect(x + 8 * sc, y + 9 * sc, w - 16 * sc, 20 * sc, '#171d23');
      for (let n = 0; n < 4; n++) rect(x + (15 + n * 13) * sc, y + 11 * sc, 2 * sc, 16 * sc, '#38424d');
    } else rect(x + 5 * sc, y + cab + 2 * sc, w - 10 * sc, 12 * sc, dark);
    rect(rx + 3 * sc, y + 3 * sc, cw - 6 * sc, win * 0.7, glass);
  } else if (doors.tailgate) {
    rect(rx + 3 * sc, y + 3 * sc, cw - 6 * sc, cab + 13 * sc, '#0f1218');
    rect(rx + 2 * sc, y - 11 * sc, cw - 4 * sc, 12 * sc, colour);
    rect(rx + 5 * sc, y - 9 * sc, cw - 10 * sc, 7 * sc, glass);
  } else {
    rect(rx + 3 * sc, y + 3 * sc, cw - 6 * sc, Math.max(5 * sc, win), glass);
    rect(rx + 5 * sc, y + 4 * sc, 7 * sc, 2 * sc, '#536879');
    if (bodyStyle === 'van') rect(cx - 1 * sc, y + 3 * sc, 2 * sc, cab + 21 * sc, dark);
  }

  if (bodyStyle === 'coupe') {
    rect(x + 3 * sc, y + cab - 1 * sc, w - 6 * sc, 4 * sc, dark);
    rect(x + 6 * sc, y + cab - 3 * sc, w - 12 * sc, 2 * sc, light);
  }
  if (bodyStyle === 'suv') {
    rect(x, by - 13 * sc, w, 7 * sc, '#242830');
    rect(x + 4 * sc, y + cab + 1 * sc, w - 8 * sc, 2 * sc, light);
  }
  if (bodyStyle === 'van') {
    rect(x + 4 * sc, by - 19 * sc, w - 8 * sc, 2 * sc, dark);
    rect(x + 4 * sc, by - 16 * sc, w - 8 * sc, 2 * sc, dark);
  }
  const lamp = lit ? '#ff4357' : '#7e202a';
  rect(x + 2 * sc, y + cab + 7 * sc, 9 * sc, 7 * sc, lamp);
  rect(x + w - 11 * sc, y + cab + 7 * sc, 9 * sc, 7 * sc, lamp);
  if (lit) {
    rect(x + 3 * sc, y + cab + 7 * sc, 8 * sc, 2 * sc, '#ffbbc0');
    rect(x + w - 11 * sc, y + cab + 7 * sc, 8 * sc, 2 * sc, '#ffbbc0');
  }
  rect(x, by - 9 * sc, w, 5 * sc, dark);
  rect(cx - 11 * sc, by - 15 * sc, 22 * sc, 6 * sc, '#f2ead9');
  rect(cx - 11 * sc, by - 15 * sc, 3 * sc, 6 * sc, '#2759ab');
  return { x: x - 18 * sc, y: y - 13 * sc, w: w + 36 * sc, h: h + 16 * sc };
}
export default { draw };
