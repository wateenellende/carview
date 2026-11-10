// SPDX-License-Identifier: GPL-3.0-or-later
// Built-in theme and vehicle packages (a copy of their theme.json / vehicle.json; keep in sync).
// Installed packages come from Android at runtime (Car.packages()).
window.CARVIEW_BUILTIN = [
  { "base": "themes/modern/", "manifest": {"type":"theme","id":"modern","name":"Modern 3D","version":"1.0.0","author":"CarView","license":"GPL-3.0-or-later","family":"three-pbr","entry":"theme.js","style":"theme.css","defaultVehicle":"logan-mcv","hud":{"speedPad":0,"warnIcon":true}} },
  { "base": "themes/retro/", "manifest": {"type":"theme","id":"retro","name":"Retro 16-bit","version":"1.0.0","author":"CarView","license":"GPL-3.0-or-later","family":"pixel-16bit","entry":"theme.js","style":"theme.css","defaultVehicle":"pixel-estate","hud":{"speedPad":3,"warnIcon":false}} },
  { "base": "vehicles/logan-mcv/", "manifest": {"type":"vehicle","id":"logan-mcv","name":"Logan MCV","version":"1.0.0","author":"CarView","license":"GPL-3.0-or-later","family":"three-pbr","entry":"vehicle.js","defaultColour":"#1f3a6e"} },
  { "base": "vehicles/logan-crossover/", "manifest": {"type":"vehicle","id":"logan-crossover","name":"Logan Crossover","version":"1.0.0","author":"CarView","license":"GPL-3.0-or-later","family":"three-pbr","entry":"../logan-mcv/vehicle.js","options":{"wheelRadius":0.335,"rideHeight":0.07,"archTube":0.06},"defaultColour":"#d9772b"} },
  { "base": "vehicles/pixel-estate/", "manifest": {"type":"vehicle","id":"pixel-estate","name":"Pixel Estate","version":"1.0.0","author":"CarView","license":"GPL-3.0-or-later","family":"pixel-16bit","entry":"vehicle.js"} },
  { "base": "vehicles/pixel-roadster/", "manifest": {"type":"vehicle","id":"pixel-roadster","name":"Pixel Roadster","version":"1.0.0","author":"CarView","license":"GPL-3.0-or-later","family":"pixel-16bit","entry":"vehicle.js","defaultColour":"#b3262f"} }
];
