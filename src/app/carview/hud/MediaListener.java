// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the CarView authors
package app.carview.hud;

import android.app.Notification;
import android.content.ComponentName;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.List;

/**
 * Reads the active music session (prefers Spotify) and Google Maps' turn-by-turn notification,
 * and passes both to the dashboard. Nothing leaves the device.
 */
public class MediaListener extends NotificationListenerService {
    static final String SPOTIFY = "com.spotify.music";
    static final String RADIO = "com.tw.radio";
    /** Which source the music card shows and controls: "spotify" or "radio" (chosen on the dashboard). */
    static volatile String source = "spotify";
    static void setSource(String s) { source = s; MediaListener l = inst; if (l != null) l.pickController(); }
    static final String MAPS = "com.google.android.apps.maps";

    static volatile MediaListener inst;
    static volatile String lastMedia = "{}";
    static volatile String lastNav = "null";

    private MediaSessionManager msm;
    private MediaController ctrl;
    private Object artKey;
    private String artUrl;
    private String navKey;

    private final Handler main = new Handler(Looper.getMainLooper());

    private final MediaController.Callback cb = new MediaController.Callback() {
        @Override public void onMetadataChanged(MediaMetadata m) { pushMedia(); }
        @Override public void onPlaybackStateChanged(PlaybackState s) { pushMedia(); }
        @Override public void onSessionDestroyed() { pickController(); }
    };

    private final MediaSessionManager.OnActiveSessionsChangedListener sessions = this::pickController;

    @Override
    public void onListenerConnected() {
        inst = this;
        msm = getSystemService(MediaSessionManager.class);
        try {
            msm.addOnActiveSessionsChangedListener(sessions, component(), main);
        } catch (SecurityException ignored) { }
        pickController();
        try {
            StatusBarNotification[] active = getActiveNotifications();
            if (active != null) for (StatusBarNotification s : active) onNotificationPosted(s);
        } catch (Exception ignored) { }
    }

    @Override
    public void onListenerDisconnected() {
        inst = null;
        try { msm.removeOnActiveSessionsChangedListener(sessions); } catch (Exception ignored) { }
        if (ctrl != null) ctrl.unregisterCallback(cb);
        ctrl = null;
    }

    private ComponentName component() { return new ComponentName(this, MediaListener.class); }

    private void pickController() {
        try { pickController(msm.getActiveSessions(component())); } catch (Exception e) { pickController(null); }
    }

    private void pickController(List<MediaController> list) {
        MediaController best = null;
        if (list != null) {
            String want = "radio".equals(source) ? RADIO : SPOTIFY;
            for (MediaController c : list) if (want.equals(c.getPackageName())) { best = c; break; }
            if (best == null && "radio".equals(source)) {      // radio without its own media session: show nothing else
                if (ctrl != null) ctrl.unregisterCallback(cb);
                ctrl = null; pushMedia(); return;
            }
            if (best == null && !list.isEmpty()) best = list.get(0);
        }
        if (ctrl != null) ctrl.unregisterCallback(cb);
        ctrl = best;
        if (ctrl != null) ctrl.registerCallback(cb, main);
        pushMedia();
    }

    private void pushMedia() {
        JSONObject o = new JSONObject();
        try {
            if (ctrl != null) {
                o.put("app", ctrl.getPackageName());
                MediaMetadata m = ctrl.getMetadata();
                if (m != null) {
                    o.put("title", nz(m.getString(MediaMetadata.METADATA_KEY_TITLE)));
                    String artist = m.getString(MediaMetadata.METADATA_KEY_ARTIST);
                    if (artist == null) artist = m.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
                    o.put("artist", nz(artist));
                    o.put("album", nz(m.getString(MediaMetadata.METADATA_KEY_ALBUM)));
                    o.put("duration", m.getLong(MediaMetadata.METADATA_KEY_DURATION));
                    Bitmap art = m.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
                    if (art == null) art = m.getBitmap(MediaMetadata.METADATA_KEY_ART);
                    if (art == null) art = m.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
                    if (art != artKey) { artKey = art; artUrl = art == null ? null : dataUrl(art, 240, false); }
                    if (artUrl != null) o.put("art", artUrl);
                }
                PlaybackState s = ctrl.getPlaybackState();
                if (s != null) {
                    o.put("playing", s.getState() == PlaybackState.STATE_PLAYING);
                    o.put("position", s.getPosition());
                    o.put("speed", s.getPlaybackSpeed());
                    o.put("updated", s.getLastPositionUpdateTime());
                    o.put("now", android.os.SystemClock.elapsedRealtime());
                }
            }
        } catch (Exception ignored) { }
        lastMedia = o.toString();
        MainActivity.send("media", lastMedia);
    }

    // ---- transport controls, called from the dashboard ----
    /** The car's radio may not have a media session: then send it the media keys (the steering-wheel buttons). */
    private static boolean radioKeys(int code) {
        MediaListener l = inst;
        if (!"radio".equals(source) || l == null || (l.ctrl != null && RADIO.equals(l.ctrl.getPackageName()))) return false;
        try {
            android.media.AudioManager am = (android.media.AudioManager) l.getSystemService(AUDIO_SERVICE);
            long t = android.os.SystemClock.uptimeMillis();
            am.dispatchMediaKeyEvent(new android.view.KeyEvent(t, t, android.view.KeyEvent.ACTION_DOWN, code, 0));
            am.dispatchMediaKeyEvent(new android.view.KeyEvent(t, t, android.view.KeyEvent.ACTION_UP, code, 0));
        } catch (Exception ignored) { }
        return true;
    }

    static void playPause() {
        if (radioKeys(android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)) return;
        MediaListener l = inst;
        if (l == null || l.ctrl == null) return;
        PlaybackState s = l.ctrl.getPlaybackState();
        if (s != null && s.getState() == PlaybackState.STATE_PLAYING) l.ctrl.getTransportControls().pause();
        else l.ctrl.getTransportControls().play();
    }
    static void next() { if (radioKeys(android.view.KeyEvent.KEYCODE_MEDIA_NEXT)) return; MediaListener l = inst; if (l != null && l.ctrl != null) l.ctrl.getTransportControls().skipToNext(); }
    static void prev() { if (radioKeys(android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS)) return; MediaListener l = inst; if (l != null && l.ctrl != null) l.ctrl.getTransportControls().skipToPrevious(); }
    static void pause() { MediaListener l = inst; if (l != null && l.ctrl != null) l.ctrl.getTransportControls().pause(); }
    static void play() { MediaListener l = inst; if (l != null && l.ctrl != null) l.ctrl.getTransportControls().play(); }

    /** Ask Spotify's own media session to search and play, without opening Spotify. False if Spotify isn't running. */
    static boolean playFromSearch(String q) {
        MediaListener l = inst;
        if (l == null || l.ctrl == null || !SPOTIFY.equals(l.ctrl.getPackageName())) return false;
        try { l.ctrl.getTransportControls().playFromSearch(q, new Bundle()); return true; }
        catch (Exception e) { return false; }
    }
    static boolean hasSession() { MediaListener l = inst; return l != null && l.ctrl != null; }

    // ---- Google Maps turn-by-turn ----
    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (!MAPS.equals(sbn.getPackageName())) return;
        Notification n = sbn.getNotification();
        boolean nav = Notification.CATEGORY_NAVIGATION.equals(n.category)
                || (n.flags & Notification.FLAG_ONGOING_EVENT) != 0;
        if (!nav) return;
        navKey = sbn.getKey();
        navNotification = n;
        Bundle x = n.extras;
        JSONObject o = new JSONObject();
        try {
            o.put("title", str(x.getCharSequence(Notification.EXTRA_TITLE)));
            o.put("text", str(x.getCharSequence(Notification.EXTRA_TEXT)));
            o.put("sub", str(x.getCharSequence(Notification.EXTRA_SUB_TEXT)));
            // the maneuver itself ("at the roundabout, take the 2nd exit") may sit in any of these
            StringBuilder more = new StringBuilder();
            for (String k : new String[] { Notification.EXTRA_BIG_TEXT, Notification.EXTRA_INFO_TEXT,
                    Notification.EXTRA_SUMMARY_TEXT, Notification.EXTRA_TITLE_BIG }) {
                CharSequence c = x.getCharSequence(k);
                if (c != null && c.length() > 0) more.append(c).append(" | ");
            }
            CharSequence[] lines = x.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null) for (CharSequence c : lines) more.append(c).append(" | ");
            if (n.tickerText != null) more.append(n.tickerText);
            o.put("more", more.toString());
            Icon icon = n.getLargeIcon();
            if (icon != null) {
                Drawable d = icon.loadDrawable(this);
                if (d != null) {
                    Bitmap b = toBitmap(d);
                    o.put("icon", dataUrl(b, 128, true));
                    keepSample(b, o);
                }
            }
        } catch (Exception ignored) { }
        lastNav = o.toString();
        MainActivity.send("nav", lastNav);
    }

    private Notification navNotification;
    private int lastSample;

    /**
     * Keeps the last 40 different turn arrows with their text in the app's own folder on the SD card
     * (Android/data/app.carview.hud/files/nav), so the arrow reading can be checked against what Maps really sends.
     */
    private void keepSample(Bitmap b, JSONObject o) {
        try {
            int h = (o.optString("title") + "|" + o.optString("text")).hashCode() * 31 + b.getWidth() * 7 + b.getPixel(b.getWidth() / 2, b.getHeight() / 3);
            if (h == lastSample) return;
            lastSample = h;
            java.io.File dir = getExternalFilesDir("nav");
            if (dir == null || (!dir.isDirectory() && !dir.mkdirs())) return;
            java.io.File[] old = dir.listFiles();
            if (old != null && old.length > 80) {
                java.util.Arrays.sort(old, (a, c) -> Long.compare(a.lastModified(), c.lastModified()));
                for (int i = 0; i < old.length - 80; i++) old[i].delete();
            }
            String name = String.valueOf(System.currentTimeMillis());
            try (java.io.FileOutputStream f = new java.io.FileOutputStream(new java.io.File(dir, name + ".png"))) {
                b.compress(Bitmap.CompressFormat.PNG, 100, f);
            }
            try (java.io.FileOutputStream f = new java.io.FileOutputStream(new java.io.File(dir, name + ".txt"))) {
                f.write(String.join("\n", o.optString("title"), o.optString("text"), o.optString("sub"), o.optString("more"), "").getBytes("UTF-8"));
            }
        } catch (Exception ignored) { }
    }

    /** Presses the "Exit navigation" button on Google Maps' own navigation notification. */
    static boolean stopNavigation() {
        MediaListener l = inst;
        Notification n = l == null ? null : l.navNotification;
        if (n == null || n.actions == null) return false;
        Notification.Action pick = null;
        for (Notification.Action a : n.actions) {
            String t = a.title == null ? "" : a.title.toString().toLowerCase(java.util.Locale.ROOT);
            if (t.contains("exit") || t.contains("stop") || t.contains("end") || t.contains("close")
                    || t.contains("afsluiten") || t.contains("beëindig") || t.contains("stoppen")) { pick = a; break; }
        }
        if (pick == null && n.actions.length == 1) pick = n.actions[0];
        if (pick == null || pick.actionIntent == null) return false;
        try { pick.actionIntent.send(); return true; } catch (Exception e) { return false; }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        if (navKey != null && navKey.equals(sbn.getKey())) {
            navNotification = null;
            navKey = null;
            lastNav = "null";
            MainActivity.send("nav", "null");
        }
    }

    // ---- helpers ----
    private static String nz(String s) { return s == null ? "" : s; }
    private static String str(CharSequence c) { return c == null ? "" : c.toString(); }

    private static Bitmap toBitmap(Drawable d) {
        if (d instanceof BitmapDrawable && ((BitmapDrawable) d).getBitmap() != null) return ((BitmapDrawable) d).getBitmap();
        int w = Math.max(1, d.getIntrinsicWidth()), h = Math.max(1, d.getIntrinsicHeight());
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        d.setBounds(0, 0, w, h);
        d.draw(c);
        return b;
    }

    static String dataUrl(Bitmap b, int max, boolean png) {
        int w = b.getWidth(), h = b.getHeight();
        float f = Math.min(1f, (float) max / Math.max(w, h));
        Bitmap s = f < 1f ? Bitmap.createScaledBitmap(b, Math.round(w * f), Math.round(h * f), true) : b;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        s.compress(png ? Bitmap.CompressFormat.PNG : Bitmap.CompressFormat.JPEG, 85, out);
        return (png ? "data:image/png;base64," : "data:image/jpeg;base64,")
                + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }
}
