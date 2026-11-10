# DoorSpy: listen to the CAN box / MCU on TW-firmware head units

A tiny research tool that prints every MCU / CAN-box message the head unit receives, with raw bytes, using the
firmware's own `android.tw.john.TWUtil` (the same library `com.tw.service` uses). It runs from `adb shell`;
nothing is installed.

```powershell
# build (JDK 17 + Android SDK build-tools 34)
javac --release 11 -classpath <sdk>/platforms/android-34/android.jar -d out DoorSpy.java
d8 --release --lib <sdk>/platforms/android-34/android.jar --min-api 26 --output . out/DoorSpy*.class
move classes.dex doorspy.dex

# run on the head unit (stop with Ctrl+C, or use `timeout 120 sh -c '…'`)
adb push doorspy.dex /data/local/tmp/
adb shell "CLASSPATH=/data/local/tmp/doorspy.dex app_process / DoorSpy"
```

Then flip something in the car (lights, a door, the handbrake) and look for the message that changes.
Edit the `ids` list in `DoorSpy.java` to listen to other message numbers. See `docs/FIRMWARE.md` for what is known.
