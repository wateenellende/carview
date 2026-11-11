# Contributing a vehicle to CarView

CarView vehicles are small GPL-3.0-or-later packages. Read [THEMES.md](THEMES.md) for the two rendering contracts. All contributions must use code, shapes, fonts and imagery you have permission to redistribute. Please don't submit copied proprietary meshes, logos, textures, or photos.

## Built-in catalogue

Create a new directory `assets/web/vehicles/<id>/` containing `vehicle.json` and any code or assets that are specific to the model. Include an optional **640×360** `preview.png` (strongly encouraged), taken from CarView's desktop preview.

Every `vehicle.json` needs:

- `type: "vehicle"`, a unique lowercase `id`, a readable `name`, `family`, `entry`, `version`, `author`, `license: "GPL-3.0-or-later"`.
- Searchable `make`, `model`, `body`, `years` (use `"Concept"` for fictional cars), and `tags` (array of relevant short strings).
- `defaultColour` (`#rrggbb`), and geometry in `options` when using the shared 3D or Retro builders.

Add a matching entry to `assets/web/packages.js` with exactly the same manifest, and a `base` of `vehicles/<id>/`. Keep this list in sync: the Android dashboard uses it to discover built-in cars.

### Configurable 3D vehicles

To add a body style without a custom JavaScript module, set:

```json
{
  "type": "vehicle",
  "id": "example-hatch",
  "name": "Example Hatch",
  "make": "CarView",
  "model": "Example",
  "body": "hatchback",
  "years": "Concept",
  "tags": ["compact", "urban"],
  "family": "three-pbr",
  "entry": "../model-builder/vehicle.js",
  "version": "1.0.0",
  "author": "Contributor",
  "license": "GPL-3.0-or-later",
  "defaultColour": "#b3262f",
  "options": {
    "bodyStyle": "hatchback",
    "length": 3.9,
    "width": 1.7,
    "height": 1.5,
    "rearOverhang": 0.67,
    "wheelbase": 2.50,
    "wheelRadius": 0.30,
    "groundClearance": 0.18,
    "beltHeight": 0.95,
    "cabinRear": 0.15,
    "cabinFront": 3.27,
    "roofFlatStart": 0.50,
    "roofFlatEnd": 2.78,
    "doors": 4
  }
}
```

Dimensions are in **metres**. The coordinates are measured from the **rear bumper** (x = 0). `bodyStyle` supports `hatchback`, `coupe`, `saloon`, `suv`, `pickup`, and `van`. Cabin and roof positions should increase along x: `cabinRear < roofFlatStart < roofFlatEnd < cabinFront`. The rear axle is at `rearOverhang`; the front axle is at `rearOverhang + wheelbase`. Keep both well within the overall body length. `doors` is 2 or 4. The model supports the same door, tailgate, light and colour calls as hand-built 3D vehicles.

These shared entry paths work for **built-in** packages. For a standalone downloadable ZIP, copy the builder into *your own* package folder and use `"entry": "vehicle.js"`. A ZIP must not depend on files outside itself.

### Retro models

For a matching Retro sprite, create a second directory, `assets/web/vehicles/pixel-<id>/`, with `family: "pixel-16bit"`, `entry: "../pixel-builder/vehicle.js"`, and `options: { "bodyStyle": "..." }`. Choose the matching `defaultColour`. As with 3D, copy the renderer into standalone ZIPs; relative shared paths are only for built-in packages.

## Quality checklist

1. In a desktop preview, check day, dusk, night, rain, snow, wind, navigation, and **parked with every applicable door/tailgate open**. Set the car colour twice and check that all painted body pieces update.
2. Confirm headlights and tail lights respond to `lights: true/false`, wheels animate while moving (3D), and `vehicleRect` includes the vehicle (and its open doors) for tap-to-switch.
3. Preserve the licence notices and keep geometry lightweight enough for a low-end Android head-unit GPU. Avoid network loading in vehicle modules.
4. Run `node tools/check-vehicles.mjs`; update `packages.js` and fix any validation errors.
5. Add a short PR description explaining what changed, include a preview screenshot when possible, and state whether it was tested on a real head unit. If on-device testing is unavailable, say so explicitly.

Do not add duplicate PRs for the same model; update the existing PR if review requires changes.
