// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 the CarView authors
package app.carview.hud;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.text.Normalizer;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Talks to Spotify's official Web API so voice commands can really start music ("play Michael Jackson").
 * Login: Authorization Code + PKCE (no secret stored anywhere). The user signs in on Spotify's own web page;
 * Spotify sends the browser back to http://127.0.0.1:8977/callback, where a tiny one-shot server in this app
 * picks up the code. Only the refresh token is kept, in this app's private storage. Talks to spotify.com only.
 */
final class SpotifyApi {
    static final int PORT = 8977;
    static final String REDIRECT = "http://127.0.0.1:" + PORT + "/callback";
    static final String SCOPES = "user-modify-playback-state user-read-playback-state playlist-read-private";

    interface Done { void result(boolean ok, String message); }

    private final Context ctx;
    private final SharedPreferences sp;
    private final ExecutorService bg = Executors.newSingleThreadExecutor();
    private String access;
    private long accessUntil;
    private volatile ServerSocket server;

    SpotifyApi(Context c) {
        ctx = c.getApplicationContext();
        sp = ctx.getSharedPreferences("spotify", Context.MODE_PRIVATE);
    }

    String clientId() { return sp.getString("client", ""); }
    boolean connected() { return !sp.getString("refresh", "").isEmpty() && !clientId().isEmpty(); }
    String user() { return sp.getString("user", ""); }

    void setClientId(String id) {
        id = id == null ? "" : id.trim();
        if (!id.equals(clientId())) sp.edit().putString("client", id).remove("refresh").remove("user").remove("uid").apply();
        access = null;
    }

    void disconnect() { sp.edit().remove("refresh").remove("user").remove("uid").apply(); access = null; }

    JSONObject status() {
        JSONObject o = new JSONObject();
        try { o.put("clientId", clientId()); o.put("connected", connected()); o.put("user", user()); o.put("redirect", REDIRECT); }
        catch (Exception ignored) { }
        return o;
    }

    // ------------------------------------------------------------------ login
    /** Returns the Spotify login page URL and starts listening for the redirect. */
    String startLogin(Done done) {
        final String verifier = random(64);
        final String state = random(16);
        String challenge;
        try {
            byte[] h = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII));
            challenge = Base64.encodeToString(h, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        } catch (Exception e) { done.result(false, "Login failed"); return null; }
        final String client = clientId();
        stopServer();
        new Thread(() -> waitForRedirect(client, verifier, state, done), "spotify-login").start();
        return "https://accounts.spotify.com/authorize?response_type=code"
                + "&client_id=" + enc(client)
                + "&scope=" + enc(SCOPES)
                + "&redirect_uri=" + enc(REDIRECT)
                + "&state=" + state
                + "&code_challenge_method=S256&code_challenge=" + challenge;
    }

    private void waitForRedirect(String client, String verifier, String state, Done done) {
        try (ServerSocket ss = new ServerSocket(PORT, 4, InetAddress.getByName("127.0.0.1"))) {
            server = ss;
            ss.setSoTimeout(10 * 60 * 1000);                     // give up after 10 minutes
            while (true) {
                try (Socket s = ss.accept()) {
                    BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
                    String line = in.readLine();                 // "GET /callback?code=...&state=... HTTP/1.1"
                    if (line == null || !line.startsWith("GET /callback")) { reply(s, 404, "Not found"); continue; }
                    String query = line.split(" ")[1];
                    query = query.contains("?") ? query.substring(query.indexOf('?') + 1) : "";
                    String code = param(query, "code"), st = param(query, "state"), err = param(query, "error");
                    if (err != null || code == null || !state.equals(st)) {
                        reply(s, 200, page("Spotify login was cancelled.", "You can close this page and try again in CarView."));
                        done.result(false, "Spotify login cancelled");
                        return;
                    }
                    boolean ok = exchange(client, code, verifier);
                    reply(s, 200, ok ? page("CarView is connected to Spotify &#10003;", "You can close this page and go back to CarView.")
                                     : page("Something went wrong.", "Check the Client ID and the Redirect URI in your Spotify app, then try again."));
                    done.result(ok, ok ? "Spotify connected" + (user().isEmpty() ? "" : " as " + user()) : "Spotify login failed");
                    return;
                }
            }
        } catch (Exception e) {
            if (server != null) done.result(false, "Spotify login timed out");
        } finally { server = null; }
    }

    private void stopServer() {
        ServerSocket s = server; server = null;
        if (s != null) try { s.close(); } catch (Exception ignored) { }
    }

    private boolean exchange(String client, String code, String verifier) {
        try {
            JSONObject t = postForm("https://accounts.spotify.com/api/token",
                    "grant_type=authorization_code&code=" + enc(code) + "&redirect_uri=" + enc(REDIRECT)
                            + "&client_id=" + enc(client) + "&code_verifier=" + enc(verifier));
            if (t == null || !t.has("access_token")) return false;
            keep(t);
            JSONObject me = api("GET", "/v1/me", null);
            if (me != null) sp.edit().putString("user", me.optString("display_name", me.optString("id")))
                    .putString("uid", me.optString("id")).apply();
            return true;
        } catch (Exception e) { return false; }
    }

    private void keep(JSONObject t) {
        access = t.optString("access_token");
        accessUntil = System.currentTimeMillis() + (t.optLong("expires_in", 3600) - 60) * 1000;
        String r = t.optString("refresh_token", "");
        if (!r.isEmpty()) sp.edit().putString("refresh", r).apply();
    }

    private String token() throws Exception {
        if (access != null && System.currentTimeMillis() < accessUntil) return access;
        String r = sp.getString("refresh", "");
        if (r.isEmpty()) return null;
        JSONObject t = postForm("https://accounts.spotify.com/api/token",
                "grant_type=refresh_token&refresh_token=" + enc(r) + "&client_id=" + enc(clientId()));
        if (t == null || !t.has("access_token")) return null;
        keep(t);
        return access;
    }

    // ------------------------------------------------------------------ playing
    /** "michael jackson", "my liked songs", "playlist roadtrip", "thriller" ... → starts it on this head unit. */
    void play(final String what, final Runnable openSpotify, final Done done) {
        bg.execute(() -> {
            try {
                if (token() == null) { done.result(false, "Spotify isn't connected"); return; }
                String q = what.trim();
                String n = norm(q);
                String context = null, offset = null, label = q;

                if (n.matches("(my )?(liked songs|liked|favorites|favourites|my music|my songs)")) {
                    context = "spotify:user:" + sp.getString("uid", "") + ":collection";
                    label = "your Liked Songs";
                } else if (n.contains("playlist")) {
                    String name = norm(n.replaceAll("\\b(my|the|playlist)\\b", " "));
                    JSONObject mine = api("GET", "/v1/me/playlists?limit=50", null);
                    JSONArray items = mine == null ? null : mine.optJSONArray("items");
                    if (items != null) for (int i = 0; i < items.length() && context == null; i++) {
                        JSONObject p = items.optJSONObject(i);
                        if (p != null && norm(p.optString("name")).contains(name)) { context = p.optString("uri"); label = p.optString("name"); }
                    }
                    if (context == null) {
                        JSONObject r = api("GET", "/v1/search?type=playlist&limit=5&q=" + enc(name), null);
                        JSONObject p = first(r, "playlists");
                        if (p != null) { context = p.optString("uri"); label = p.optString("name"); }
                    }
                } else if (n.matches(".+ (by|van) .+")) {      // "dynamite by taio cruz" → that exact song
                    String[] parts = n.split(" (by|van) ", 2);
                    JSONObject r = api("GET", "/v1/search?type=track&limit=3&q=" + enc("track:" + parts[0] + " artist:" + parts[1]), null);
                    JSONObject track = first(r, "tracks");
                    if (track == null) track = first(api("GET", "/v1/search?type=track&limit=3&q=" + enc(parts[0] + " " + parts[1]), null), "tracks");
                    if (track != null) {
                        JSONObject album = track.optJSONObject("album");
                        context = album != null ? album.optString("uri") : null;
                        offset = track.optString("uri");
                        JSONArray as = track.optJSONArray("artists");
                        label = track.optString("name") + (as != null && as.length() > 0 ? " by " + as.optJSONObject(0).optString("name") : "");
                    }
                } else {
                    JSONObject r = api("GET", "/v1/search?type=artist,track&limit=3&q=" + enc(q), null);
                    JSONObject artist = first(r, "artists"), track = first(r, "tracks");
                    if (artist != null && norm(artist.optString("name")).equals(n)) {
                        context = artist.optString("uri"); label = artist.optString("name");
                    } else if (track != null) {
                        JSONObject album = track.optJSONObject("album");
                        context = album != null ? album.optString("uri") : null;
                        offset = track.optString("uri");
                        JSONArray as = track.optJSONArray("artists");
                        label = track.optString("name") + (as != null && as.length() > 0 ? " by " + as.optJSONObject(0).optString("name") : "");
                    } else if (artist != null) {
                        context = artist.optString("uri"); label = artist.optString("name");
                    }
                }
                if (context == null || context.isEmpty()) { done.result(false, "Couldn't find " + q + " on Spotify"); return; }

                String device = pickDevice();
                if (device == null) {                         // Spotify isn't running here yet: start it, then retry
                    openSpotify.run();
                    for (int i = 0; i < 8 && device == null; i++) { Thread.sleep(1000); device = pickDevice(); }
                }
                if (device == null) { done.result(false, "Open Spotify once, then try again"); return; }

                JSONObject body = new JSONObject();
                body.put("context_uri", context);
                if (offset != null) body.put("offset", new JSONObject().put("uri", offset));
                int code = call("PUT", "/v1/me/player/play?device_id=" + enc(device), body.toString());
                if (code >= 200 && code < 300) done.result(true, "Playing " + label);
                else if (code == 403) done.result(false, "Spotify says no: Premium is needed for this");
                else done.result(false, "Spotify couldn't start it (" + code + ")");
            } catch (Exception e) {
                done.result(false, "Spotify isn't reachable");
            }
        });
    }

    /** The Spotify app on this head unit: the active device if it's a phone/car type, else one that looks local. */
    private String pickDevice() throws Exception {
        JSONObject r = api("GET", "/v1/me/player/devices", null);
        JSONArray ds = r == null ? null : r.optJSONArray("devices");
        if (ds == null || ds.length() == 0) return null;
        String local = norm(android.os.Build.MODEL);
        String active = null, phone = null;
        for (int i = 0; i < ds.length(); i++) {
            JSONObject d = ds.optJSONObject(i);
            if (d == null || d.optBoolean("is_restricted")) continue;
            String type = d.optString("type"), name = norm(d.optString("name"));
            boolean mobile = "Smartphone".equalsIgnoreCase(type) || "Automobile".equalsIgnoreCase(type) || "Tablet".equalsIgnoreCase(type);
            if (!local.isEmpty() && name.contains(local)) return d.optString("id");
            if (d.optBoolean("is_active") && mobile) active = d.optString("id");
            if (mobile && phone == null) phone = d.optString("id");
        }
        return active != null ? active : phone;
    }

    // ------------------------------------------------------------------ HTTP helpers
    private JSONObject api(String method, String path, String body) throws Exception {
        HttpURLConnection c = open(method, path, body);
        int code = c.getResponseCode();
        if (code == 204) return new JSONObject();
        if (code < 200 || code >= 300) return null;
        return new JSONObject(read(c.getInputStream()));
    }

    private int call(String method, String path, String body) throws Exception {
        HttpURLConnection c = open(method, path, body);
        int code = c.getResponseCode();
        try { read(code >= 400 ? c.getErrorStream() : c.getInputStream()); } catch (Exception ignored) { }
        return code;
    }

    private HttpURLConnection open(String method, String path, String body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL("https://api.spotify.com" + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(8000);
        c.setReadTimeout(10000);
        c.setRequestProperty("Authorization", "Bearer " + token());
        if (body != null) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
        } else if ("PUT".equals(method)) {
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(0);
        }
        return c;
    }

    private static JSONObject postForm(String url, String form) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod("POST");
        c.setConnectTimeout(8000);
        c.setReadTimeout(10000);
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        try (OutputStream o = c.getOutputStream()) { o.write(form.getBytes(StandardCharsets.UTF_8)); }
        int code = c.getResponseCode();
        if (code < 200 || code >= 300) return null;
        return new JSONObject(read(c.getInputStream()));
    }

    private static String read(InputStream in) throws Exception {
        if (in == null) return "";
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        in.close();
        return b.toString("UTF-8");
    }

    private static JSONObject first(JSONObject r, String key) {
        if (r == null) return null;
        JSONObject s = r.optJSONObject(key);
        JSONArray items = s == null ? null : s.optJSONArray("items");
        if (items == null) return null;
        for (int i = 0; i < items.length(); i++) if (!items.isNull(i)) return items.optJSONObject(i);
        return null;
    }

    private static void reply(Socket s, int code, String html) throws Exception {
        byte[] b = html.getBytes(StandardCharsets.UTF_8);
        OutputStream o = s.getOutputStream();
        o.write(("HTTP/1.1 " + code + " OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: " + b.length
                + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
        o.write(b);
        o.flush();
    }

    private static String page(String title, String text) {
        return "<!doctype html><meta name=viewport content='width=device-width'><body style='font:20px sans-serif;background:#0b1020;color:#eef3fb;"
                + "display:flex;align-items:center;justify-content:center;height:90vh;text-align:center'><div><h2>" + title + "</h2><p>" + text + "</p></div>";
    }

    private static String param(String query, String name) {
        for (String kv : query.split("&")) {
            int i = kv.indexOf('=');
            if (i > 0 && kv.substring(0, i).equals(name)) {
                try { return URLDecoder.decode(kv.substring(i + 1), "UTF-8"); } catch (Exception e) { return null; }
            }
        }
        return null;
    }

    private static String enc(String s) {
        try { return URLEncoder.encode(s, "UTF-8").replace("+", "%20"); } catch (Exception e) { return s; }
    }

    static String norm(String s) {
        if (s == null) return "";
        s = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return s.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9 ]", " ").replaceAll("\\s+", " ").trim();
    }

    private static String random(int n) {
        final String abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        SecureRandom r = new SecureRandom();
        StringBuilder b = new StringBuilder(n);
        for (int i = 0; i < n; i++) b.append(abc.charAt(r.nextInt(abc.length())));
        return b.toString();
    }
}
