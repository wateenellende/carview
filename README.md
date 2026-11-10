# CarView

An open dashboard / home screen for Android car head units: a live 3D (or retro pixel) view of your car with its
real headlights and doors, speed, weather, compass, Google Maps turn-by-turn, Spotify, calling by voice, and
themes and vehicles that anyone can make (see [THEMES.md](THEMES.md)).

Built and tested on a UNISOC uis7865 head unit with TW firmware; [docs/FIRMWARE.md](docs/FIRMWARE.md) lists the
firmware signals it uses (headlights, Bluetooth calls, phonebook, CAN box) and [tools/doorspy](tools/doorspy) helps
investigate your own car.

## Licence

Copyright (C) 2026 the CarView authors.

CarView is free software: you can redistribute it and/or modify it under the terms of the GNU General Public
License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any
later version.

CarView is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
details. You should have received a copy of the GNU General Public License along with CarView (the file
`LICENSE`). If not, see <https://www.gnu.org/licenses/>.

Bundled third-party parts keep their own licences: three.js (MIT, `assets/web/licenses/three.js-LICENSE.txt`) and
the Press Start 2P font (SIL Open Font License 1.1, `assets/web/licenses/PressStart2P-OFL.txt`). Both are
compatible with GPL-3.0-or-later.

## Building

`build.ps1` builds `CarView.apk` without Gradle (Android SDK 34 build-tools + JDK 17).
