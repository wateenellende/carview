// SPDX-License-Identifier: GPL-3.0-or-later
// Vehicle "Pixel roadster" (family pixel-16bit): a low, wide two-seater with a ducktail spoiler, seen from behind.

export function draw(g, p) {
  const { cx, by, scale: sc, colour, lit, doors, horizon: HZ, shade, rect, poly } = p;
  const w = 78 * sc, h = 30 * sc, x = cx - w / 2, y = by - h;
  const body = colour, dark = shade(body, -0.4), light = shade(body, 0.3), glass = '#141b28';

  if (lit) {
    poly([[cx - w * 0.30, y + 8 * sc], [cx - w * 0.6, HZ + 4], [cx - w * 0.05, HZ + 4], [cx - w * 0.12, y + 8 * sc]], '#fff3b0', 0.22);
    poly([[cx + w * 0.12, y + 8 * sc], [cx + w * 0.05, HZ + 4], [cx + w * 0.6, HZ + 4], [cx + w * 0.30, y + 8 * sc]], '#fff3b0', 0.22);
  }
  rect(x - 6 * sc, by - 2, w + 12 * sc, 5, 'rgba(0,0,0,0.4)');                   // shadow
  rect(x - 2 * sc, by - 7 * sc, 15 * sc, 8 * sc, '#101016');                    // fat rear tyres
  rect(x + w - 13 * sc, by - 7 * sc, 15 * sc, 8 * sc, '#101016');
  if (doors.frontLeft || doors.rearLeft) poly([[x + 2, y + 9 * sc], [x - 18 * sc, y + 6 * sc], [x - 18 * sc, y + 22 * sc], [x + 2, y + 25 * sc]], dark);
  if (doors.frontRight || doors.rearRight) poly([[x + w - 2, y + 9 * sc], [x + w + 18 * sc, y + 6 * sc], [x + w + 18 * sc, y + 22 * sc], [x + w - 2, y + 25 * sc]], dark);
  rect(x, y + 8 * sc, w, h - 12 * sc, body);                                      // low body
  rect(x, y + 8 * sc, w, 2 * sc, light);
  rect(x + 16 * sc, y - 2 * sc, w - 32 * sc, 11 * sc, body);                      // small cabin
  rect(x + 19 * sc, y, w - 38 * sc, 7 * sc, glass);                               // rear screen
  rect(x + 21 * sc, y + 1 * sc, 7 * sc, 2 * sc, 'rgba(255,255,255,0.2)');
  if (doors.tailgate) rect(x + 6 * sc, y - 6 * sc, w - 12 * sc, 5 * sc, dark);    // boot lid up
  else rect(x + 4 * sc, y + 6 * sc, w - 8 * sc, 3 * sc, dark);                   // ducktail spoiler
  const tl = lit ? '#ff3b3b' : '#8a2430';
  rect(x + 3 * sc, y + 12 * sc, w - 6 * sc, 3 * sc, tl);                          // full-width light bar
  if (lit) rect(x + 3 * sc, y + 12 * sc, w - 6 * sc, 1, '#ffb0b0');
  rect(x, by - 9 * sc, w, 4 * sc, dark);                                          // diffuser
  rect(cx - 10 * sc, y + 17 * sc, 20 * sc, 5 * sc, '#f2ecd8');                    // plate
  rect(cx - 10 * sc, y + 17 * sc, 3 * sc, 5 * sc, '#2a50b0');
  rect(cx - 20 * sc, by - 6 * sc, 4 * sc, 3 * sc, '#3b3d44');                     // twin exhausts
  rect(cx + 16 * sc, by - 6 * sc, 4 * sc, 3 * sc, '#3b3d44');
  return { x: x - 18 * sc, y: y - 6 * sc, w: w + 36 * sc, h: h + 8 * sc };
}

export default { draw };
