# CarView to-do

## Many very different car models (parked 2026-11-10)

Goal: people pick (and search for) their own kind of car, with the colour picker as it is now.

- [ ] **General car builder**: a parameter-driven builder exists for six new model types; the original high-detail Logan model still needs migrating to geometry specified in `vehicle.json`. Turn the Logan model into a builder driven by numbers in `vehicle.json`
      (length, width, wheelbase, overhangs, roof profile, windscreen position, 2/4 doors, estate/hatchback/saloon
      rear, pickup bed, wheel size), so a new car is just a JSON file, with no code needed.
- [x] **Clearly different built-in cars**: sports coupe, city hatchback, saloon, SUV, pickup, van (next to the
      Logan MCV and Crossover). Also matching Retro pixel sprites.
- [x] **Catalogue fields** in `vehicle.json`: `make`, `model`, `body`, `years`, `tags`.
- [x] **Search box** in Settings → Vehicle (filters by name, make, model, body type, tags).
- [x] **CONTRIBUTING.md**: how to add a car by pull request (template, licence rules, size budget, doors and lights
      must work, preview image), plus an automatic check for submitted cars.
- [ ] Cars ship with each release (no separate server). Later, optionally: download new cars from the GitHub
      repository between releases.

## Other open items

- [ ] Doors: the Hiworld CAN box sends no door status for a 2014 Logan MCV II with any profile tried, engine on or off
      (see docs/FIRMWARE.md). Next: read door states from the body computer (UCH) over OBD-II with a Wi-Fi/USB adapter.
- [ ] Lights show "--" after a restart until the switch moves (the firmware only reports changes).
- [ ] Internet on the road (data SIM in the head unit, or phone hotspot).
- [ ] Fuel / range / trip computer; volume by voice; reading messages aloud; speed limit.
