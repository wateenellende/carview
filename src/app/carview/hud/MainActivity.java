// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the CarView authors
package app.carview.hud;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.SearchManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.LauncherApps;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.location.GnssStatus;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/** The dashboard: a full-screen WebView (3D car + HUD) fed with live data from the car and the phone apps. */
public class MainActivity extends Activity {
    static final String HOST = "appassets.local";
    // Broadcasts the TW firmware sends when the headlight (ILL) wire switches. Found on 2026-11-08.
    static final String DARK_ON = "com.zjinnova.zlink.action.OUT_DARK_START";
    static final String DARK_OFF = "com.zjinnova.zlink.action.OUT_DARK_STOP";

    static volatile MainActivity current;

    private WebView web;
    private boolean pageReady;
    private final Handler h = new Handler(Looper.getMainLooper());
    private LocationManager lm;
    private static final int REQ_LOCATION = 9;
    private boolean locationListening;
    private Location lastLoc;
    private long lastTempFetch;
    private String lastLocJson = "{}", lastGpsJson = "{}", lastTempJson = "null";
    private Boolean lights;

    // ---------------- lifecycle ----------------
    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        current = this;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(11, 15, 21));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.addJavascriptInterface(new Bridge(), "Car");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (HOST.equals(u.getHost())) return asset(u.getPath());
                // Block everything else: the dashboard never talks to the internet itself.
                return new WebResourceResponse("text/plain", "utf-8", 403, "Blocked", null, null);
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; }
        });
        setContentView(web);
        web.loadUrl("https://" + HOST + "/index.html");

        IntentFilter f = new IntentFilter();
        f.addAction(DARK_ON);
        f.addAction(DARK_OFF);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(lightsRx, f, Context.RECEIVER_EXPORTED);
        else registerReceiver(lightsRx, f);
        IntentFilter cf = new IntentFilter();
        for (String a : CALL_STATES) cf.addAction(a);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(callRx, cf, Context.RECEIVER_EXPORTED);
        else registerReceiver(callRx, cf);
        IntentFilter pf = new IntentFilter(CONTACTS_SYNCED);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(contactsRx, pf, Context.RECEIVER_EXPORTED);
        else registerReceiver(contactsRx, pf);
        if ("[]".equals(btContacts())) h.postDelayed(this::requestContacts, 5000);   // no Bluetooth phonebook saved yet: ask for one

        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            startLocation();
        } else {
            // Android 12+ ignores a request for FINE location unless COARSE is requested in the same call.
            requestPermissions(new String[] { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, REQ_LOCATION);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_LOCATION) return;
        startLocation();                   // starts only if precise location was granted (GPS speed needs it)
        send("access", access().toString());
    }

    @Override
    protected void onResume() {
        super.onResume();
        current = this;
        // Location may have been enabled in system settings while CarView was away.
        startLocation();
        pushAll();
    }

    // onStart/onStop (not onResume/onPause) so the dashboard keeps animating when it is visible in split screen
    @Override
    protected void onStart() {
        super.onStart();
        web.onResume();
    }

    @Override
    protected void onStop() {
        web.onPause();      // stops the 3D drawing while Maps or Spotify is full screen: saves power and heat
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        try { unregisterReceiver(lightsRx); } catch (Exception ignored) { }
        try { unregisterReceiver(callRx); } catch (Exception ignored) { }
        try { unregisterReceiver(contactsRx); } catch (Exception ignored) { }
        if (lm != null) {
            try { lm.removeUpdates(locL); } catch (Exception ignored) { }
            try { lm.unregisterGnssStatusCallback(gnss); } catch (Exception ignored) { }
        }
        if (current == this) current = null;
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() { send("back", "true"); }

    /** Test hook: `am start -n app.carview.hud/.MainActivity --es say "play ..."` from the adb shell acts like a spoken command. */
    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        String say = i.getStringExtra("say");
        Uri ref = getReferrer();
        boolean fromShell = ref != null && "com.android.shell".equals(ref.getHost());
        if (say != null && fromShell) send("voice", new JSONArray(java.util.Collections.singletonList(say)).toString());
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_VOICE_ASSIST || code == KeyEvent.KEYCODE_SEARCH) { assistant(); return true; }
        return super.onKeyDown(code, e);
    }

    private WebResourceResponse asset(String path) {
        if (path == null || path.equals("/")) path = "/index.html";
        String p = path.substring(1);
        // The scene frame is sandboxed (opaque origin), so its module scripts need a CORS header to load.
        java.util.Map<String, String> headers = java.util.Collections.singletonMap("Access-Control-Allow-Origin", "*");
        if (p.contains("..") || p.contains("\\")) return notFound();
        try {
            InputStream in;
            if (p.startsWith("user/")) {               // installed theme/vehicle packages (app-private storage)
                java.io.File f = new java.io.File(Packages.root(this), p.substring(5));
                if (!f.getCanonicalPath().startsWith(Packages.root(this).getCanonicalPath() + java.io.File.separator) || !f.isFile()) return notFound();
                in = new java.io.FileInputStream(f);
            } else {
                in = getAssets().open("web/" + p);
            }
            return new WebResourceResponse(mime(p), "utf-8", 200, "OK", headers, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, null);
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".txt") || p.endsWith(".md")) return "text/plain";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".glb")) return "model/gltf-binary";
        if (p.endsWith(".gltf")) return "model/gltf+json";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        if (p.endsWith(".ogg")) return "audio/ogg";
        return "application/octet-stream";
    }

    // ---------------- native -> page ----------------
    static void send(final String type, final String json) {
        final MainActivity a = current;
        if (a == null) return;
        a.h.post(() -> {
            if (!a.pageReady) return;
            a.web.evaluateJavascript("window.onCar&&onCar('" + type + "'," + json + ")", null);
        });
    }

    private void pushAll() {
        send("lights", lights == null ? "null" : String.valueOf(lights));
        send("loc", lastLocJson);
        send("gps", lastGpsJson);
        send("temp", lastTempJson);
        send("media", MediaListener.lastMedia);
        send("nav", MediaListener.lastNav);
        send("access", access().toString());
        send("spotify", spotify().status().toString());
        send("call", lastCallJson);
    }

    private JSONObject access() {
        JSONObject o = new JSONObject();
        try {
            o.put("location", checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED);
            String l = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
            o.put("media", l != null && l.contains(getPackageName()));
        } catch (Exception ignored) { }
        return o;
    }

    // ---------------- headlights ----------------
    private final BroadcastReceiver lightsRx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            lights = DARK_ON.equals(i.getAction());
            send("lights", String.valueOf(lights));
        }
    };

    // ---------------- phone calls (head unit's own Bluetooth app com.tw.bt) ----------------
    // Found in com.tw.bt 2026-11-08: it announces call states for a (removed) voice assistant and obeys answer/reject orders.
    static final String[] CALL_STATES = {
            "action.bt.AIOS_INCOMING_RINGING", "action.bt.AIOS_INCOMING_OFFHOOK", "action.bt.AIOS_INCOMING_IDLE",
            "action.bt.AIOS_OUTGOING_RINGING", "action.bt.AIOS_OUTGOING_OFFHOOK", "action.bt.AIOS_OUTGOING_IDLE",
            "com.unisound.intent.action.SEND_CALL_INFO", "com.unisound.intent.action.SEND_CALL_INFO2" };
    static final String CALL_ACCEPT = "action.intent.AIOS_ACCEPT", CALL_REJECT = "action.intent.AIOS_REJECT";
    private String lastCallJson = "null";
    private String callName = "", callNumber = "";

    private final BroadcastReceiver callRx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            String a = i.getAction();
            StringBuilder dbg = new StringBuilder(a);
            Bundle x = i.getExtras();
            if (x != null) for (String k : x.keySet()) {
                Object v = x.get(k);
                dbg.append(' ').append(k).append('=').append(v);
                String key = k.toLowerCase(Locale.ROOT), val = v == null ? "" : String.valueOf(v);
                if (val.isEmpty() || "null".equals(val)) continue;
                if (key.contains("name")) callName = val;
                else if (key.contains("number") || key.contains("phone") || key.contains("num")) callNumber = val;
            }
            android.util.Log.i("CarView", "call event: " + dbg);       // to learn the extras during a real call
            if (a == null || !a.startsWith("action.bt.AIOS_")) { if (!"null".equals(lastCallJson)) pushCall(lastState, lastDir); return; }
            String dir = a.contains("INCOMING") ? "in" : "out";
            String state = a.endsWith("RINGING") ? "ringing" : a.endsWith("OFFHOOK") ? "active" : "idle";
            if ("idle".equals(state)) { callName = ""; callNumber = ""; }
            pushCall(state, dir);
            // incoming ring: the car's own big call screen (com.tw.bt overlay) handles answering; CarView stays put (user, 2026-11-10)
        }
    };
    private String lastState = "idle", lastDir = "in";

    private void pushCall(String state, String dir) {
        lastState = state; lastDir = dir;
        if ("idle".equals(state)) { lastCallJson = "null"; send("call", "null"); return; }
        JSONObject o = new JSONObject();
        try { o.put("state", state); o.put("dir", dir); o.put("name", callName); o.put("number", callNumber); } catch (Exception ignored) { }
        lastCallJson = o.toString();
        send("call", lastCallJson);
    }

    // ---------------- phonebook + dialling (com.tw.bt, decoded 2026-11-08) ----------------
    // After each phonebook sync com.tw.bt broadcasts CONTACTS_SYNC_SUCCESS with "ContactsZipSyncSuccess":
    // gzip(JSON [{"name","number"}]) stored as an ISO-8859-1 string. GET_CONTACTS makes it sync again.
    // AIOS_DIAL with extra "number" dials through the phone, like tapping a contact in the BT app.
    static final String CONTACTS_SYNCED = "com.aispeech.action.CONTACTS_SYNC_SUCCESS";
    static final String CONTACTS_REQUEST = "com.unisound.intent.action.GET_CONTACTS";
    static final String CALL_DIAL = "action.intent.AIOS_DIAL";

    private final BroadcastReceiver contactsRx = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            String zip = i.getStringExtra("ContactsZipSyncSuccess");
            if (zip == null || zip.isEmpty()) return;
            new Thread(() -> {
                try {
                    byte[] raw = zip.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);
                    java.util.zip.GZIPInputStream gz = new java.util.zip.GZIPInputStream(new java.io.ByteArrayInputStream(raw));
                    java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = gz.read(buf)) > 0) out.write(buf, 0, n);
                    String json = out.toString("UTF-8");
                    int count = new JSONArray(json).length();
                    try (java.io.FileOutputStream f = openFileOutput("contacts.json", MODE_PRIVATE)) {
                        f.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    }
                    android.util.Log.i("CarView", "phonebook synced: " + count + " entries");
                    send("contacts", String.valueOf(count));
                } catch (Exception e) {
                    android.util.Log.w("CarView", "phonebook decode failed", e);
                }
            }).start();
        }
    };

    /** Bluetooth phonebook saved from com.tw.bt, "[]" if none yet. Stays on the head unit (app-private file). */
    private String btContacts() {
        try (java.io.FileInputStream f = openFileInput("contacts.json")) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = f.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (Exception e) { return "[]"; }
    }

    /**
     * Everyone CarView can call: the head unit's own contacts (synced from the Google account, with
     * Mobile/Home/Work labels) plus the Bluetooth phonebook if the phone shares one. [{name, number, type}]
     */
    private String contacts() {
        JSONArray all = new JSONArray();
        if (checkSelfPermission(Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED) {
            String[] cols = { android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER,
                    android.provider.ContactsContract.CommonDataKinds.Phone.TYPE,
                    android.provider.ContactsContract.CommonDataKinds.Phone.LABEL };
            try (android.database.Cursor c = getContentResolver().query(
                    android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI, cols, null, null, null)) {
                while (c != null && c.moveToNext()) {
                    JSONObject o = new JSONObject();
                    o.put("name", c.getString(0));
                    o.put("number", c.getString(1));
                    o.put("type", android.provider.ContactsContract.CommonDataKinds.Phone
                            .getTypeLabel(getResources(), c.getInt(2), c.getString(3)).toString());
                    all.put(o);
                }
            } catch (Exception e) { android.util.Log.w("CarView", "contacts query failed", e); }
        }
        try {
            JSONArray bt = new JSONArray(btContacts());
            for (int i = 0; i < bt.length(); i++) all.put(bt.getJSONObject(i));
        } catch (Exception ignored) { }
        return all.toString();
    }

    private void requestContacts() {
        Intent i = new Intent(CONTACTS_REQUEST);
        i.addFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES);
        sendBroadcast(i);
    }

    private void dial(String number) {
        if (number == null || number.trim().isEmpty()) return;
        Intent i = new Intent(CALL_DIAL);
        i.putExtra("number", number.replaceAll("[^0-9+*#]", ""));
        i.addFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES);
        sendBroadcast(i);
    }

    private void callAction(boolean accept) {
        Intent i = new Intent(accept ? CALL_ACCEPT : CALL_REJECT);
        i.addFlags(Intent.FLAG_INCLUDE_STOPPED_PACKAGES);
        sendBroadcast(i);
    }

    // ---------------- GPS: speed, heading, satellites ----------------
    private final LocationListener locL = new LocationListener() {
        @Override public void onLocationChanged(Location l) {
            lastLoc = l;
            JSONObject o = new JSONObject();
            try {
                o.put("speed", l.hasSpeed() ? l.getSpeed() * 3.6 : 0);
                if (l.hasBearing()) o.put("bearing", l.getBearing());
                o.put("acc", l.getAccuracy());
            } catch (Exception ignored) { }
            lastLocJson = o.toString();
            send("loc", lastLocJson);
            if (System.currentTimeMillis() - lastTempFetch > 10 * 60 * 1000) fetchTemperature(l);
        }
        @Override public void onProviderEnabled(String p) { }
        @Override public void onProviderDisabled(String p) { }
        @Override public void onStatusChanged(String p, int s, Bundle b) { }
    };

    private final GnssStatus.Callback gnss = new GnssStatus.Callback() {
        @Override public void onSatelliteStatusChanged(GnssStatus st) {
            int used = 0, n = st.getSatelliteCount();
            for (int i = 0; i < n; i++) if (st.usedInFix(i)) used++;
            lastGpsJson = "{\"used\":" + used + ",\"visible\":" + n + "}";
            send("gps", lastGpsJson);
        }
    };

    @SuppressLint("MissingPermission")
    private void startLocation() {
        if (locationListening || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        lm = getSystemService(LocationManager.class);
        if (lm == null) return;
        try {
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 500, 0, locL, Looper.getMainLooper());
            locationListening = true; // Avoid duplicate subscriptions when permission is granted or the app resumes.
            try { lm.registerGnssStatusCallback(gnss, h); } catch (Exception ignored) { }
            Location last = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            if (last != null && System.currentTimeMillis() - last.getTime() < 3 * 3600 * 1000) fetchTemperature(last);
        } catch (Exception ignored) { }
    }

    /** Outside temperature from Open-Meteo (free, no account). Only a coarse position (~10 km) is sent. */
    private void fetchTemperature(Location l) {
        lastTempFetch = System.currentTimeMillis();
        final String url = String.format(Locale.US,
                "https://api.open-meteo.com/v1/forecast?latitude=%.1f&longitude=%.1f&current=temperature_2m,weather_code,is_day,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
                l.getLatitude(), l.getLongitude());
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                StringBuilder sb = new StringBuilder();
                try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream()))) {
                    String line;
                    while ((line = r.readLine()) != null) sb.append(line);
                }
                JSONObject cur = new JSONObject(sb.toString()).getJSONObject("current");
                JSONObject o = new JSONObject();
                o.put("c", cur.getDouble("temperature_2m"));
                o.put("code", cur.optInt("weather_code", -1));
                o.put("day", cur.optInt("is_day", 1) == 1);
                o.put("rain", cur.optDouble("precipitation", 0));          // mm in the last hour
                o.put("wind", cur.optDouble("wind_speed_10m", 0));         // km/h
                o.put("gust", cur.optDouble("wind_gusts_10m", 0));
                o.put("windDir", cur.optDouble("wind_direction_10m", 0));  // where the wind comes FROM, degrees
                lastTempJson = o.toString();
                send("temp", lastTempJson);
            } catch (Exception e) {
                lastTempFetch = System.currentTimeMillis() - 13 * 60 * 1000; // retry in ~2 minutes
            }
        }).start();
    }

    // ---------------- actions ----------------
    private void start(Intent i) {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { startActivity(i); } catch (ActivityNotFoundException | SecurityException e) { send("toast", JSONObject.quote("Couldn't open that app")); }
    }

    private void open(String pkg) {
        Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
        if (i == null) { send("toast", JSONObject.quote(pkg + " isn't installed")); return; }
        start(i);
    }

    // ---------------- voice commands ----------------
    // The firmware never switched on the full Google Assistant (only plain voice search), so CarView does it itself:
    // Google's speech-to-text turns speech into words, app.js decides what to do ("play ...", "navigate to ...").
    private static final int REQ_VOICE = 7;

    private void assistant() {
        Intent r = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        r.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        r.putExtra(RecognizerIntent.EXTRA_PROMPT, "Say \"play ...\" or \"navigate to ...\"");
        r.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        try { startActivityForResult(r, REQ_VOICE); }
        catch (Exception e) { googleVoice(); }
    }

    // ---------------- theme / vehicle packages (.zip, see THEMES.md) ----------------
    private static final int REQ_PKG = 8;

    private void pickPackage() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        i.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/zip", "application/x-zip-compressed", "application/octet-stream" });
        try { startActivityForResult(i, REQ_PKG); }
        catch (Exception e) { send("toast", JSONObject.quote("No file picker on this device")); }
    }

    private void installPackage(Uri uri) {
        new Thread(() -> {
            String msg;
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                msg = Packages.install(this, in);
            } catch (Exception e) {
                msg = "Package not installed: " + e.getMessage();
            }
            send("toast", JSONObject.quote(msg));
            send("packages", "true");
        }).start();
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_PKG) {
            if (res == RESULT_OK && data != null && data.getData() != null) installPackage(data.getData());
            return;
        }
        if (req == REQ_VOICE) {
            ArrayList<String> words = data == null ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (res == RESULT_OK && words != null && !words.isEmpty()) send("voice", new JSONArray(words).toString());
            return;
        }
        super.onActivityResult(req, res, data);
    }

    private SpotifyApi spotifyApi;
    SpotifyApi spotify() { if (spotifyApi == null) spotifyApi = new SpotifyApi(this); return spotifyApi; }

    private void playFromSearch(String q) {
        if (spotify().connected()) {                 // CarView is logged in to Spotify: search + play directly
            final boolean[] opened = {false};
            spotify().play(q, () -> h.post(() -> { opened[0] = true; open(MediaListener.SPOTIFY); }), (ok, msg) -> {
                send("toast", JSONObject.quote(msg));
                if (opened[0]) h.postDelayed(this::backToFront, 1500);
            });
            return;
        }
        // Spotify only obeys "search and play" from apps it trusts (Google Assistant, Android Auto): both the media-session
        // playFromSearch and the MEDIA_PLAY_FROM_SEARCH intent are silently ignored for CarView (tested 2026-11-08).
        // Best we can do without a Spotify login: open Spotify's search with the words filled in; one tap plays.
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("spotify:search:" + Uri.encode(q)));
        i.setPackage(MediaListener.SPOTIFY);
        if (i.resolveActivity(getPackageManager()) != null) start(i); else open(MediaListener.SPOTIFY);
    }

    private void backToFront() {
        Intent back = new Intent(this, MainActivity.class);
        back.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        startActivity(back);
    }

    private void spotifyLogin() {
        if (spotify().clientId().isEmpty()) { send("toast", JSONObject.quote("Enter the Spotify Client ID first")); return; }
        String url = spotify().startLogin((ok, msg) -> h.post(() -> {
            send("toast", JSONObject.quote(msg));
            send("spotify", spotify().status().toString());
            backToFront();
        }));
        if (url != null) start(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
    }

    private void webSearch(String q) {
        Intent i = new Intent(Intent.ACTION_WEB_SEARCH);
        i.putExtra(SearchManager.QUERY, q);
        start(i);
    }

    /** Plain Google voice search (fallback when speech-to-text isn't available). */
    private void googleVoice() {
        // On this head unit VOICE_COMMAND lands on the Google app's old hands-free screen, which shows nothing.
        // VOICE_ASSIST opens Google's "Listening..." voice screen straight away (tested 2026-11-08).
        Intent[] tries = {
                new Intent("android.intent.action.VOICE_ASSIST"),
                new Intent(Intent.ACTION_ASSIST),
                new Intent(Intent.ACTION_VOICE_COMMAND)
        };
        for (Intent i : tries) {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { startActivity(i); return; } catch (Exception ignored) { }
        }
        send("toast", JSONObject.quote("Google Assistant isn't available"));
    }

    private static String appsCache;

    private String apps() {
        if (appsCache != null) return appsCache;
        PackageManager pm = getPackageManager();
        Intent q = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> list = pm.queryIntentActivities(q, 0);
        Collections.sort(list, (a, b) -> a.loadLabel(pm).toString().compareToIgnoreCase(b.loadLabel(pm).toString()));
        JSONArray arr = new JSONArray();
        for (ResolveInfo r : list) {
            if (getPackageName().equals(r.activityInfo.packageName)) continue;
            try {
                JSONObject o = new JSONObject();
                o.put("label", r.loadLabel(pm).toString());
                o.put("pkg", r.activityInfo.packageName);
                o.put("cls", r.activityInfo.name);
                Drawable d = r.loadIcon(pm);
                Bitmap b = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888);
                Canvas c = new Canvas(b);
                d.setBounds(0, 0, 96, 96);
                d.draw(c);
                o.put("icon", MediaListener.dataUrl(b, 96, true));
                arr.put(o);
            } catch (Exception ignored) { }
        }
        appsCache = arr.toString();
        return appsCache;
    }

    /** Methods the page can call as window.Car.xxx(). */
    private class Bridge {
        @JavascriptInterface public void ready() { h.post(() -> { pageReady = true; pushAll(); }); }
        @JavascriptInterface public void playPause() { h.post(MediaListener::playPause); }
        @JavascriptInterface public void next() { h.post(MediaListener::next); }
        @JavascriptInterface public void prev() { h.post(MediaListener::prev); }
        @JavascriptInterface public void spotify() { h.post(() -> open(MediaListener.SPOTIFY)); }
        @JavascriptInterface public void spotifySearch() {
            h.post(() -> {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("spotify:search"));
                i.setPackage(MediaListener.SPOTIFY);
                if (i.resolveActivity(getPackageManager()) != null) start(i); else open(MediaListener.SPOTIFY);
            });
        }
        @JavascriptInterface public void navigate(String dest) {
            h.post(() -> {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=" + Uri.encode(dest)));
                i.setPackage(MediaListener.MAPS);
                start(i);
            });
        }
        @JavascriptInterface public void maps() { h.post(() -> open(MediaListener.MAPS)); }
        @JavascriptInterface public void mapsSplit() {
            h.post(() -> {
                Intent i = getPackageManager().getLaunchIntentForPackage(MediaListener.MAPS);
                if (i == null) return;
                i.addFlags(Intent.FLAG_ACTIVITY_LAUNCH_ADJACENT | Intent.FLAG_ACTIVITY_NEW_TASK);
                start(i);
            });
        }
        @JavascriptInterface public void assistant() { h.post(MainActivity.this::assistant); }
        /** Google Maps' own Home/Work shortcut (uses the places saved in Maps). Works because CarView is the home screen. */
        @JavascriptInterface public void mapsPlace(String which) {
            h.post(() -> {
                String id = "work".equals(which) ? "manifest_work" : "manifest_home";
                try {
                    LauncherApps la = getSystemService(LauncherApps.class);
                    if (la.hasShortcutHostPermission()) {
                        la.startShortcut(MediaListener.MAPS, id, null, null, Process.myUserHandle());
                        return;
                    }
                } catch (Exception ignored) { }
                // not the home screen (or Maps changed): let Maps resolve its saved "Home"/"Work" label
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=" + ("work".equals(which) ? "Work" : "Home")));
                i.setPackage(MediaListener.MAPS);
                start(i);
            });
        }
        @JavascriptInterface public void playSearch(String q) { h.post(() -> playFromSearch(q)); }
        @JavascriptInterface public String packages() { return Packages.list(MainActivity.this); }
        @JavascriptInterface public void importPackage() { h.post(MainActivity.this::pickPackage); }
        @JavascriptInterface public void removePackage(String kind, String id) {
            boolean ok = Packages.remove(MainActivity.this, kind, id);
            send("toast", JSONObject.quote(ok ? "Removed" : "Could not remove that package"));
        }
        @JavascriptInterface public void stopNav() {
            h.post(() -> {
                if (!MediaListener.stopNavigation()) {           // no exit button found: at least clear the card here
                    MediaListener.lastNav = "null";
                    send("nav", "null");
                    send("toast", JSONObject.quote("Close navigation in Google Maps"));
                }
            });
        }
        @JavascriptInterface public void phone() { h.post(() -> open("com.tw.bt")); }
        @JavascriptInterface public String contacts() { return MainActivity.this.contacts(); }
        @JavascriptInterface public void refreshContacts() { h.post(MainActivity.this::requestContacts); }
        @JavascriptInterface public void dial(String number) { h.post(() -> MainActivity.this.dial(number)); }
        @JavascriptInterface public void answer() { h.post(() -> callAction(true)); }
        @JavascriptInterface public void hangUp() { h.post(() -> callAction(false)); }
        @JavascriptInterface public String spotifyStatus() { return MainActivity.this.spotify().status().toString(); }
        @JavascriptInterface public void spotifySetClient(String id) { MainActivity.this.spotify().setClientId(id); }
        @JavascriptInterface public void spotifyConnect() { h.post(MainActivity.this::spotifyLogin); }
        @JavascriptInterface public void spotifyDisconnect() { MainActivity.this.spotify().disconnect(); }
        @JavascriptInterface public void webSearch(String q) { h.post(() -> MainActivity.this.webSearch(q)); }
        @JavascriptInterface public void pause() { h.post(MediaListener::pause); }
        @JavascriptInterface public void play() { h.post(MediaListener::play); }
        @JavascriptInterface public String apps() { return MainActivity.this.apps(); }
        @JavascriptInterface public void launch(String pkg, String cls) {
            h.post(() -> {
                Intent i = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
                i.setComponent(new ComponentName(pkg, cls));
                i.addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
                start(i);
            });
        }
        @JavascriptInterface public void settings() { h.post(() -> start(new Intent(Settings.ACTION_SETTINGS))); }
        @JavascriptInterface public void mediaAccess() {
            h.post(() -> start(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        }
        @JavascriptInterface public boolean hasMedia() { return MediaListener.hasSession(); }
    }
}
