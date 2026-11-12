# Modern car-art direction

Modern and Retro use different visual languages: **Retro stays intentionally blocky**. The Modern cars should read as believable, model-independent vehicles, not toys or literal reproductions of any brand.

The shapes below blend cues from familiar, popular production models. These are **visual references**, not assertions that these are the top three worldwide by annual registrations. Sales ranks vary by country and body category. No brand logo, model badge, proprietary texture or copied mesh is used.

| CarView model | Reference mixture | Signature cues in the procedural model |
| --- | --- | --- |
| Sports Coupe | Porsche 911 Carrera, Ford Mustang, Mercedes CLE Coupe | Low wide stance, wheel haunches, long raked rear fastback, shallow bonnet, integrated ducktail, full-width LED rear light |
| City Hatchback | Volkswagen Golf, Toyota Corolla Hatchback, Honda Civic Hatchback | Compact overhangs, taller practical cabin, short spoiler, curved wraparound hatch lights |
| Family Saloon | Toyota Camry, Tesla Model 3, Honda Accord | Long wheelbase, low hood, smooth four-door greenhouse, defined boot deck, narrow split rear lamps |
| Trail SUV | Toyota RAV4, Honda CR-V, Tesla Model Y | Wide crossover stance, curved roof, raised clearance, strong wheel arches and black rocker trim |
| Work Pickup | Ford F-150, Chevrolet Silverado, Ram 1500 | Full-size proportions, broad flared shoulders, crew cab, separate open ribbed bed, upright vertical rear lamps and sturdy rear valance |
| Cargo Van | Ford Transit, Volkswagen Transporter, Mercedes Vito | High-volume long roof, nearly vertical rear doors, split centre seam, sliding-door guide and tall corner lights |

## Implementation

**Each Modern class has its own design module** in `assets/web/vehicles/modern/`
(`sports-coupe.js`, `city-hatch.js`, `family-saloon.js`, `trail-suv.js`, `work-pickup.js`, `cargo-van.js`).
They all use `modern/common.js`, which builds a car the same way as the detailed Logan model:

* a smooth **lower body** lofted from a few keyed curves: the shoulder line (`belt`: boot deck, waist, bonnet),
  the sill line, rounded corners seen from above (`corners`), squareness of the cross-section (`square`) and
  extra width over the rear wheels (`hips`);
* **wheel arches** shaped into the body (the underside rises in a circle around each axle), dark well liners,
  and wheels flush with the body sides;
* a separate **glasshouse** from the base of the rear glass (`cabinRear`) over the roof to the base of the
  windscreen (`cabinFront`), narrowing toward the roof (`tumble`), with a body-coloured roof and pillars;
* **rear and front faces** whose lamps (`wrap`, `bar` or `vertical`), number plate, bumpers and grille sit on
  the body surface (never slabs bolted onto it), plus each class's own trim via `details()`.

Per-model `vehicle.json` records hold the real dimensions in metres (length, width, height, overhang,
wheelbase, wheel size, clearance, belt height and the glasshouse stations). The previous
`model-builder/vehicle.js` remains available to older/external variants.

Silhouette comes first. Front/rear fascias, wheel position, wheel-arch trim, side glass and rear detailing must remain credible in a **rear three-quarter camera**, because that is how the dashboard and Settings thumbnails usually display vehicles. Use restrained physical-material paint; avoid oversized glowing tail lamps and giant rounded surfaces.

The original detailed Logan model stays separate, with its own editable loft profile. Retro models remain unchanged.

## Review criteria

1. Compare a fresh screenshot of all eight Modern cars against the actual production references. All six new shapes should be distinguishable **without captions**.
2. Check the coupe specifically in both rear three-quarter and side profile: it must not resemble a capsule on wheels.
3. Check pickup bed depth, tailgate, four-door cab and wheelbase. An open bed should read as a load bed rather than a painted flat slab.
4. Confirm each car still supports `setColour`, `setLights`, `setDoor`, `snapDoors`, `update`, and `doorNames`. Do not sacrifice functional state for looks.
5. Test Chrome rendering using `node tools/capture-gallery.mjs`, and Android head-unit WebGL after review. The screenshot tests are integration checks, **not** automatic artistic-quality approval.
6. Preserve the turning-road capability introduced separately on `main`: changes to car meshes and preview cards must not override `turnRate`, `steer` or `nav` handling in the theme.

Artwork should be original, as a synthesis of generic vehicle form language; do not trace logos or protected graphics.
