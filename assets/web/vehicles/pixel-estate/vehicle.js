// SPDX-License-Identifier: GPL-3.0-or-later
// Vehicle "Pixel estate" (family pixel-16bit): the boxy estate seen from behind, drawn with rectangles.
// draw() gets the 2D context and a parameter object from the theme (see THEMES.md) and returns its box.

export function draw(g, p) {
  const { cx, by, scale: sc, colour, lit, doors, horizon: HZ, shade, rect, poly } = p;
  const w = 70 * sc, h = 42 * sc, x = cx - w / 2, y = by - h;
  const body = colour, dark = shade(body, -0.35), light = shade(body, 0.25), glass = '#141b28';

  if (lit) {   // headlight beams thrown ahead of the car
    poly([[cx - w * 0.30, y + 6 * sc], [cx - w * 0.62, HZ + 4], [cx - w * 0.05, HZ + 4], [cx - w * 0.12, y + 6 * sc]], '#fff3b0', 0.22);
    poly([[cx + w * 0.12, y + 6 * sc], [cx + w * 0.05, HZ + 4], [cx + w * 0.62, HZ + 4], [cx + w * 0.30, y + 6 * sc]], '#fff3b0', 0.22);
  }
  rect(x - 5 * sc, by - 2, w + 10 * sc, 5, 'rgba(0,0,0,0.38)');                 // shadow
  rect(x + 2 * sc, by - 6 * sc, 12 * sc, 7 * sc, '#101016');                    // wheels
  rect(x + w - 14 * sc, by - 6 * sc, 12 * sc, 7 * sc, '#101016');
  if (doors.frontLeft || doors.rearLeft) {      // a left door swung open
    poly([[x + 1, y + 14 * sc], [x - 16 * sc, y + 10 * sc], [x - 16 * sc, y + 33 * sc], [x + 1, y + 37 * sc]], dark);
    poly([[x - 2 * sc, y + 15 * sc], [x - 14 * sc, y + 12 * sc], [x - 14 * sc, y + 21 * sc], [x - 2 * sc, y + 23 * sc]], glass);
  }
  if (doors.frontRight || doors.rearRight) {    // a right door swung open
    poly([[x + w - 1, y + 14 * sc], [x + w + 16 * sc, y + 10 * sc], [x + w + 16 * sc, y + 33 * sc], [x + w - 1, y + 37 * sc]], dark);
    poly([[x + w + 2 * sc, y + 15 * sc], [x + w + 14 * sc, y + 12 * sc], [x + w + 14 * sc, y + 21 * sc], [x + w + 2 * sc, y + 23 * sc]], glass);
  }
  rect(x, y + 12 * sc, w, h - 18 * sc, body);                                     // body
  rect(x, y + 12 * sc, w, 2 * sc, light);                                         // shoulder highlight
  rect(x + 7 * sc, y, w - 14 * sc, 13 * sc, body);                                // roof / cabin (estate)
  rect(x + 7 * sc, y, w - 14 * sc, 2 * sc, light);
  if (doors.tailgate) {                         // tailgate swung up: dark luggage space, lid above the roof
    rect(x + 6 * sc, y + 3 * sc, w - 12 * sc, 22 * sc, '#0d0f14');
    rect(x + 8 * sc, y - 12 * sc, w - 16 * sc, 12 * sc, body);
    rect(x + 11 * sc, y - 10 * sc, w - 22 * sc, 7 * sc, glass);
  } else {
    rect(x + 10 * sc, y + 3 * sc, w - 20 * sc, 9 * sc, glass);                    // rear window
    rect(x + 12 * sc, y + 4 * sc, 8 * sc, 2 * sc, 'rgba(255,255,255,0.18)');
  }
  rect(x, by - 12 * sc, w, 6 * sc, dark);                                          // bumper
  const tl = lit ? '#ff3b3b' : '#8a2430';
  rect(x + 1 * sc, y + 16 * sc, 13 * sc, 6 * sc, tl);                             // tail lights
  rect(x + w - 14 * sc, y + 16 * sc, 13 * sc, 6 * sc, tl);
  if (lit) { rect(x + 1 * sc, y + 16 * sc, 13 * sc, 1, '#ffb0b0'); rect(x + w - 14 * sc, y + 16 * sc, 13 * sc, 1, '#ffb0b0'); }
  rect(cx - 11 * sc, y + 24 * sc, 22 * sc, 6 * sc, '#f2ecd8');                    // number plate
  rect(cx - 11 * sc, y + 24 * sc, 3 * sc, 6 * sc, '#2a50b0');
  return { x: x - 16 * sc, y: y - 12 * sc, w: w + 32 * sc, h: h + 14 * sc };
}

export default { draw };
