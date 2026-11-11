# Making CarView themes and vehicles

This guide is written so that a person **or an AI agent** can build a new theme or vehicle for CarView without
reading the rest of the code. Follow it literally; every file and field it mentions is required unless it says
"optional".

CarView is free software under **GPL-3.0-or-later**. Packages you publish for it should use a compatible licence
(GPL-3.0-or-later is simplest) and must only contain artwork, fonts and code you are allowed to share.

---

## 1. The idea in one minute

* The **dashboard** (panels with speed, destinations, music, phone, compass) is part of CarView itself.
* A **theme** draws the *scene* behind the panels (road, sky, weather, light effects) and restyles the panels with CSS.
* A **vehicle** is the car drawn in the scene. Vehicles are separate packages, so one theme can offer many vehicles,
  and several themes can share them.
* Every theme and vehicle declares a **family**. A theme only shows vehicles of its own family:

  | family        | what a vehicle is                                  | used by           |
  |---------------|----------------------------------------------------|-------------------|
  | `three-pbr`   | a three.js 3D model built in code                  | Modern 3D         |
  | `pixel-16bit` | a function that paints the car on a 320×180 canvas | Retro 16-bit      |

  You may invent a new family for a new style (for example `vector-flat`). Then you must ship at least one vehicle
  for it, and you write down its vehicle contract in your theme's README.
* The user picks the theme in **Settings → Theme**, and switches vehicles by **tapping the car** (or in
  Settings → Vehicle). The car colour is remembered per vehicle. The vehicle selector also searches the
  catalogue's `make`, `model`, `body`, `years`, `tags`, name, and id.

## 2. What a package looks like

A package is a `.zip` file. `theme.json` or `vehicle.json` must be at the root of the zip (or inside one top-level
folder). The user installs it in **Settings → Themes and vehicles → Add theme or vehicle (.zip)**.

```
my-theme.zip                    my-vehicle.zip
├── theme.json   (manifest)     ├── vehicle.json  (manifest)
├── theme.js     (scene code)   ├── vehicle.js    (vehicle code)
├── theme.css    (panel style)  └── …textures, models (optional)
├── preview.png  (optional, 640×360)
└── …fonts, images, sounds (optional)
```

Limits: 60 MB unpacked, 800 files. Installing a package with an `id` that already exists replaces it. An installed
package with the same id as a built-in one overrides the built-in.

### theme.json

```json
{
  "type": "theme",
  "id": "neon-night",
  "name": "Neon Night",
  "version": "1.0.0",
  "author": "Your name",
  "license": "GPL-3.0-or-later",
  "family": "three-pbr",
  "entry": "theme.js",
  "style": "theme.css",
  "defaultVehicle": "logan-mcv",
  "hud": { "speedPad": 0, "warnIcon": true }
}
```

| field | meaning |
|---|---|
| `id` | lowercase letters, digits, dashes; max 40 characters; unique |
| `family` | which vehicles fit this theme (see table above) |
| `entry` | the scene module, relative to the package folder |
| `style` | CSS for the dashboard panels (optional; without it the panels are unstyled) |
| `defaultVehicle` | vehicle id used until the user taps the car (optional) |
| `hud.speedPad` | pad the speed with zeros to this many digits (`3` → `048`); `0` = no padding |
| `hud.warnIcon` | prefix the door warning with ⚠ |

### vehicle.json

```json
{
  "type": "vehicle",
  "id": "my-hatchback",
  "name": "My Hatchback",
  "version": "1.0.0",
  "author": "Your name",
  "license": "GPL-3.0-or-later",
  "family": "three-pbr",
  "entry": "vehicle.js",
  "options": { "wheelRadius": 0.32 },
  "defaultColour": "#b3262f"
}
```

`options` (optional) is passed to the vehicle code unchanged, so one vehicle file can make several cars.
The built-in *Logan Crossover* is just the *Logan MCV* file with different options.
For the additional six 3D body styles, built-in vehicle manifests reuse
`../model-builder/vehicle.js` and specify these `options` in **metres**:
`length`, `width`, `height`, `rearOverhang`, `wheelbase`, `wheelRadius`,
`groundClearance`, `beltHeight`, `cabinRear`, `cabinFront`,
`roofFlatStart`, `roofFlatEnd`, `doors` (2 or 4), and `bodyStyle`
(`hatchback`, `coupe`, `saloon`, `suv`, `pickup`, `van`).
The rear bumper is at x=0. A detailed example and validation checklist are in
[CONTRIBUTING.md](CONTRIBUTING.md).

For Retro, built-in model manifests can use `../pixel-builder/vehicle.js`
with `options: { "bodyStyle": "..." }`; the Retro renderer forwards those
options to `draw()`. **Both shared module entry paths are for the built-in
catalogue only.** A standalone ZIP must include its own renderer file and use
an entry relative to its own directory, without `../`.
`defaultColour` (optional) is used until the user picks a colour for this vehicle.

## 3. How a theme runs (and what it can't do)

The theme runs inside a **sandboxed frame** that covers the whole screen behind the panels:

* It **can**: draw on its canvas (2D or WebGL), load files from its own package and from `/lib/`
  (three.js is available there), and use timers and `requestAnimationFrame`.
* It **cannot**: reach the internet, call the phone/Spotify/Maps, read contacts or settings, or use `localStorage`.
  It never sees personal data; it only receives the car state below.
* CarView keeps the frame rate at about 30 fps. Head units have slow GPUs: keep draw calls, lights and texture sizes
  modest, and test on a real unit.

### The theme module (`entry`)

An ES module whose default export has a `create` function:

```js
// theme.js
export default {
  /**
   * canvas: full-screen <canvas> to draw on.
   * api: { manifest, base }  (base = this package's URL folder, for loading your own files)
   * Return (or resolve to) an instance object.
   */
  async create(canvas, api) {
    return {
      frame(dt, state) { /* draw one frame; dt in seconds (≤ 0.1) */ },
      setVehicle(vehicleModule, vehicleManifest, vehicleBase) { /* swap the car */ },
      vehicleRect() { return { x, y, w, h }; },   // car's box on screen in CSS pixels, or null
    };
  },
};
```

* `frame` is called about 30 times a second. Resize your canvas yourself if `window.innerWidth/innerHeight`
  change (the dashboard can run in split screen).
* `setVehicle` is called once at start and again whenever the user switches vehicle. Build the new car there.
* `vehicleRect` tells CarView where the car is, so a tap on it switches vehicles. Return a generous box.
* Throwing in `create` makes CarView fall back to the Retro theme; throwing in `frame` is logged and skipped.

### `state` (what you receive every frame)

| key | type | meaning |
|---|---|---|
| `speed` | number | km/h from GPS (0 when parked) |
| `lights` | `true` / `false` / `null` | headlights on/off, `null` = not known yet |
| `doors` | object | `{ frontLeft, rearLeft, frontRight, rearRight, tailgate }` booleans |
| `openView` | boolean | parked with something open: show the car so the open parts are visible |
| `nav` | boolean | Google Maps is navigating (make room: the car may shrink/move) |
| `sky` | `'day'` / `'dusk'` / `'night'` | time of day (already darker when the lights are on) |
| `wx.kind` | `null` / `'rain'` / `'snow'` | precipitation to draw |
| `wx.amount` | 0…1 | how heavy |
| `wx.wind` | km/h | wind speed |
| `wx.cross` | km/h | wind across the road (relative to the driving direction) |
| `wx.sway` | 0…1 | how much the car should rock from side wind |
| `wx.fog`, `wx.thunder` | boolean | fog; thunderstorm (flash now and then) |
| `colour` | `"#rrggbb"` | the vehicle colour the user picked |
| `bearing` | degrees or `null` | driving direction (0 = north) |

The same fields may grow over time; ignore keys you don't know.

## 4. Vehicle contracts

### Family `three-pbr` (3D, three.js)

```js
// vehicle.js — no imports needed: three.js is handed in by the theme
export function build({ THREE, colour, options }) {
  const group = new THREE.Group();   // +x = forward, +y = up, +z = right; rear bumper at x = 0
  // …build meshes into group…
  return {
    group, length: 4.2, width: 1.75,                 // metres
    doorNames: ['frontLeft', 'rearLeft', 'frontRight', 'rearRight', 'tailgate'],  // the ones you animate
    setColour(hex) {},                               // repaint the body
    setLights(on) {},                                // head/tail lights glow
    setDoor(name, open) {},                          // start opening/closing a door
    update(dt, speedKmh) {},                         // animate doors, spin wheels
    snapDoors() {},                                  // optional: jump doors to their target position
  };
}
export default { build };
```

Use real-world sizes in metres; the theme positions, scales and lights the car. See
`assets/web/vehicles/logan-mcv/vehicle.js` for a complete example (lofted body, opening doors, spinning wheels).

### Family `pixel-16bit` (Retro)

```js
// vehicle.js
export function draw(g, p) {
  // g: CanvasRenderingContext2D of the 320×180 scene (no smoothing)
  // p: { cx, by, scale, horizon, colour, lit, doors, speed, time, options, shade(hex, f), rect(x,y,w,h,c), poly(points, c, alpha) }
  //   cx = horizontal centre, by = bottom of the car, scale ≈ 1 (0.72 while navigating), horizon = y of the horizon
  //   shade(hex, -0.3) darkens, shade(hex, 0.3) lightens; rect/poly draw pixel-snapped shapes
  return { x, y, w, h };   // the box you drew, in scene pixels (used for tapping)
}
export default { draw };
```

Draw the car seen from behind, about 70 px wide at `scale` 1, using only `rect`/`poly` for a crisp pixel look.
Show open doors and the tailgate, and glowing tail lights and beams when `lit`. See
`assets/web/vehicles/pixel-estate/vehicle.js`.

## 5. Styling the dashboard (`theme.css`)

Your stylesheet replaces the panel styling completely. Style these elements (all exist on every theme):

| element | what it is |
|---|---|
| `#status` (`#dir`, `#wx`, `#temp`, `#lights.on/.off`) | top status pill |
| `#speedBox`, `#speed`, `.unit` | big speed number |
| `#left`, `#dests`, `.tile`, `.ico`, `.nm`, `.sub` | destination tiles |
| `#turn`, `.turnBox`, `#turnIcon`, `#turnArrow`, `#turnDist`, `#turnStreet`, `#turnSub`, `#navClose`, `#navStop` | next-turn card while navigating |
| `#right`, `#art`, `#title`, `#artist`, `#bar`, `#barFill`, `.ctl`, `#play.hot` | music card |
| `#mic` | Hey Google button |
| `#corner` (`#appsBtn`, `#setBtn`) | apps and settings buttons |
| `#phoneBox`, `#phoneBtn.green`, `#hangBtn.red`, `#callInfo` | phone (top left) |
| `#compass`, `#rose`, `#hdg`, `#sat` | compass and satellites (top right) |
| `#warn` | door warning |
| `#toast` | short messages |
| `.sheet`, `#apps`, `#settings`, `#callPick` | full-screen sheets |
| `.btn`, `.btn.on`, `.btn.wide`, `.row`, `.cap`, `.s`, `.t` | shared building blocks |

Body classes you can use: `theme-<your id>`, `family-<family>`, `nav` (navigating), `open` (parked with doors open:
move the side panels away), `ringing`, `hasArt`. Use `vh` units so it works on any screen size, and keep tap
targets at least `7vh` high: this is used while driving.

Copy `assets/web/themes/modern/theme.css` as a starting point.

## 6. Testing on a computer

Open `assets/web/index.html` from disk in Chrome or Edge started with `--allow-file-access-from-files`, and add
these to the URL:

* `?theme=<id>&vehicle=<id>`: choose them (a package must be listed in `assets/web/packages.js` to be found this
  way, so for testing, copy your folder into `assets/web/themes/` or `assets/web/vehicles/` and add a line there).
* `&scene=cruise|nav|night|open|day|rain|snow|wind|call|oncall`: fake car states.

Check: day, dusk and night; rain, snow and side wind; driving, navigating, parked with all doors open; lights on.
Tap the car to make sure your `vehicleRect` is right.

## 7. Checklist for a new theme (what to produce)

1. `theme.json`: unique `id`, `family`, `entry`, `style`, `defaultVehicle`.
2. `theme.js`: `create` → `{ frame, setVehicle, vehicleRect }`, drawing:
   * the road moving with `speed`, the sky for `day`/`dusk`/`night`,
   * headlight beams/pools when `lights` is on,
   * `rain`/`snow` scaled by `wx.amount`, fog, thunder flashes, the car rocking with `wx.sway`,
   * a clear view of open doors when `openView` is true, and a smaller/offset car while `nav` is true.
3. `theme.css`: every element in section 5.
4. At least one vehicle of the theme's family (reuse an existing one, or ship your own).
5. A `README.md` with credits and licences for every asset, and `preview.png` (optional).
6. Zip it, install it on the head unit, and test the states from section 6.

## 8. Checklist for a new vehicle

1. `vehicle.json` with the right `family` and an `entry`.
2. `vehicle.js` implementing that family's contract from section 4: doors and tailgate that open, lights that
   glow, a colour that can be changed. A built-in catalogue variant may instead point to a shared builder
   with a complete `options` geometry; standalone ZIPs must contain their own code.
3. Real proportions (for 3D: metres), drawn from behind as the main view.
4. Zip, install, then tap the car in a theme of that family until yours appears.
