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

`assets/web/vehicles/model-builder/vehicle.js` blends a common dimensional framework with **six separate body-style recipes**. Per-model `vehicle.json` records define real-world dimensions in metres: length, width, height, rear overhang, wheelbase, ground clearance, wheel radius, cabin start/end and roof positions. The style recipe changes taper, wheel haunches, rocker inset, roof crown, rear shoulder and lamp signature.

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
