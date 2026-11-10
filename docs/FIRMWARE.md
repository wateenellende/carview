# TW / "Dofun" head-unit firmware: what CarView uses

Notes from reverse-engineering a UNISOC uis7865 ("T20") Android 14 head unit with TW firmware and a Hiworld CAN box
(November 2026). Other TW-based units (sold under many brand names) likely behave the same. Package names and
signals below are from the firmware; nothing here needs root.

## Headlights (ILL wire)

`com.tw.service` sends **non-protected implicit broadcasts** when the light switch changes:

| broadcast | meaning |
|---|---|
| `com.zjinnova.zlink.action.OUT_DARK_START` | lights on |
| `com.zjinnova.zlink.action.OUT_DARK_STOP`  | lights off |

Any app can register a receiver (`RECEIVER_EXPORTED` on Android 13+). Only changes are announced; the state at
start-up is unknown until the switch moves. On the MCU side the same switch arrives ~0.5 s earlier as TWUtil message
`what = 0x0204`, `arg1` = 1 (on) / 0 (off), `arg2` = 2560.

## Phone calls (Bluetooth app `com.tw.bt`, gocsdk module)

Calls do **not** go through Android telephony. `com.tw.bt` talks to a separate Bluetooth stack (gocsdk) and
announces calls with broadcasts meant for a (removed) voice assistant ("AIOS"):

| broadcast | extras | meaning |
|---|---|---|
| `action.bt.AIOS_INCOMING_RINGING` | `number`, `name` (often `"null"`) | incoming call rings |
| `action.bt.AIOS_INCOMING_OFFHOOK` | | incoming call answered |
| `action.bt.AIOS_INCOMING_IDLE` | | incoming call ended |
| `action.bt.AIOS_OUTGOING_RINGING` / `_OFFHOOK` / `_IDLE` | | same for outgoing calls |
| `com.unisound.intent.action.SEND_CALL_INFO` | `state` (int: 0 idle, 1 incoming, 3 dialling, 4 alerting), `callName`, `callNumber` | call details |

It **obeys** these broadcasts (registered dynamically in `AIOSReceiveManager`):

| broadcast | extras | effect |
|---|---|---|
| `action.intent.AIOS_ACCEPT` | | answer the ringing call |
| `action.intent.AIOS_REJECT` | | reject / hang up |
| `action.intent.AIOS_DIAL` | `number` (String) | dial that number (`requestCall`) |
| `action.intent.AIOS_SWITCH_VOICE` | | move call audio between car and phone |
| `action.intent.AIOS_MUTE_VOICE` | | mute the microphone |

While ringing, `com.tw.bt` also shows its own large call overlay on top of every app.

### Phonebook

After a phonebook sync, `com.tw.bt` broadcasts `com.aispeech.action.CONTACTS_SYNC_SUCCESS` with extra
`ContactsZipSyncSuccess`: gzip-compressed JSON `[{"name":…, "number":…}]`, stored in a String as ISO-8859-1.
Sending `com.unisound.intent.action.GET_CONTACTS` asks it to sync again. With some phones (seen with a Xiaomi Redmi)
the Bluetooth phonebook stays empty; CarView then uses the Android contacts synced from the Google account.

## MCU / CAN box: `android.tw.john.TWUtil`

The firmware library in the boot classpath; `/dev/tw` and `/dev/tw2` are world-readable/writable.

```java
TWUtil tw = new TWUtil();
tw.open(new short[] { 0x0501, ... });   // message numbers ("what") to receive
tw.start();
tw.addHandler("tag", handler);          // Message: what, arg1, arg2, obj (byte[])
tw.write(what, arg1, arg2);             // send
```

`what = 0x0501` carries CAN-box data: `arg1` = CAN-box message type, `arg2` = length, `obj` = payload. The head unit
polls about ten types (98, 38, 35, 0, 232, 19, 20, 24, 72, 97 with this box) every ~10 s.

**Firmware bug:** `com.tw.service` crashes (`ArrayIndexOutOfBoundsException: length=2; index=2` in
`TWService.m.a`) on type 35 with a 2-byte payload, logged as `what=1281arg1=35arg2=2`, so that data never reaches
any app. With the Hiworld box configured as Renault → Dacia → "public" on a 2014 Dacia Logan MCV II, a full test (all 64
message numbers `com.tw.service` handles, every door and the tailgate opened in turn, the headlights as a control)
showed **no message at all for the doors**, while the lights appeared as `0x0204`. So this CAN-box profile does not
report door status for that car. Also tested: the Hiworld "21 Sandero" profile (mid spec), and the Dacia profile
with the **engine running** and the dashboard's door-open warning lit: still no change in any message. Conclusion: on this
car the CAN box does not receive door status at all (it sits on the multimedia part of the network). Next idea: read
the doors from the body computer via the OBD-II port. Use `tools/doorspy` to investigate your own car.

## Voice assistant

This firmware lacks the feature `android.software.voice_recognizers`, so Android never binds Google Assistant's
`VoiceInteractionService`: Google only offers plain voice search. CarView therefore uses Google's speech-to-text
(`RecognizerIntent.ACTION_RECOGNIZE_SPEECH`) and handles commands itself.

## Spotify

Spotify ignores both `MediaController.TransportControls.playFromSearch` and the `MEDIA_PLAY_FROM_SEARCH` intent
from untrusted apps. "Play X" therefore uses the Spotify Web API (the user's own free developer app, PKCE login,
Premium required) or falls back to opening `spotify:search:<query>`.

## Google Maps

* Home/Work: Maps publishes launcher shortcuts `manifest_home` / `manifest_work`; the default launcher can start
  them with `LauncherApps.startShortcut`, using the places saved in Maps.
* Turn-by-turn: Maps' navigation notification (category `navigation`, ongoing) carries the next turn as title/text and
  the maneuver arrow as large icon; its "Exit navigation" action ends navigation.

## Removed for privacy on this unit (for reference)

The firmware shipped with several cloud/remote-control components (for example `com.tw.core`, which held an MQTT
link to a server abroad, plus an Adups FOTA updater and Baidu-based apps). They were removed with
`pm uninstall --user 0` (reversible with `cmd package install-existing`) without affecting CarView.
