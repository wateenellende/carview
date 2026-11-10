// SPDX-License-Identifier: GPL-3.0-or-later
package app.carview.hud;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Installed theme and vehicle packages (see THEMES.md). A package is a .zip with theme.json or vehicle.json at its
 * root. It is unpacked into app-private storage (files/packages/themes/<id>/ or .../vehicles/<id>/) and served to
 * the dashboard as https://appassets.local/user/themes/<id>/... Packages only run inside the sandboxed scene frame.
 */
final class Packages {
    static final long MAX_TOTAL = 60L * 1024 * 1024;    // unpacked size limit
    static final int MAX_FILES = 800;
    static final Pattern ID = Pattern.compile("[a-z0-9][a-z0-9-]{0,39}");

    static File root(Context c) { return new File(c.getFilesDir(), "packages"); }

    /** All installed packages as [{base, manifest}] for the dashboard. */
    static String list(Context c) {
        JSONArray out = new JSONArray();
        for (String kind : new String[] { "themes", "vehicles" }) {
            File[] dirs = new File(root(c), kind).listFiles();
            if (dirs == null) continue;
            for (File d : dirs) {
                File mf = new File(d, kind.equals("themes") ? "theme.json" : "vehicle.json");
                if (!mf.isFile()) continue;
                try {
                    JSONObject o = new JSONObject();
                    o.put("base", "user/" + kind + "/" + d.getName() + "/");
                    o.put("manifest", new JSONObject(read(new FileInputStream(mf))));
                    out.put(o);
                } catch (Exception ignored) { }
            }
        }
        return out.toString();
    }

    /** Unpacks a package .zip. Returns a short message for the user. */
    static String install(Context c, InputStream zipStream) throws Exception {
        // 1) read the zip into memory once to find and check the manifest (packages are small; size is capped)
        java.util.Map<String, byte[]> files = new java.util.LinkedHashMap<>();
        long total = 0;
        try (ZipInputStream zin = new ZipInputStream(zipStream)) {
            ZipEntry e;
            while ((e = zin.getNextEntry()) != null) {
                if (e.isDirectory()) continue;
                String name = e.getName().replace('\\', '/');
                if (name.startsWith("/") || name.contains("../") || name.contains(":") || name.startsWith("__MACOSX/")) continue;
                if (files.size() >= MAX_FILES) throw new Exception("Package has too many files");
                byte[] data = readCapped(zin, MAX_TOTAL - total);
                total += data.length;
                files.put(name, data);
            }
        }
        // allow a single top-level folder inside the zip (common when zipping a folder)
        String prefix = "";
        if (!files.containsKey("theme.json") && !files.containsKey("vehicle.json")) {
            for (String n : files.keySet()) {
                int i = n.indexOf('/');
                if (i > 0 && (n.substring(i + 1).equals("theme.json") || n.substring(i + 1).equals("vehicle.json"))) { prefix = n.substring(0, i + 1); break; }
            }
        }
        boolean theme = files.containsKey(prefix + "theme.json");
        byte[] mf = files.get(prefix + (theme ? "theme.json" : "vehicle.json"));
        if (mf == null) throw new Exception("No theme.json or vehicle.json in the package");
        JSONObject m = new JSONObject(new String(mf, StandardCharsets.UTF_8));
        String id = m.optString("id");
        if (!ID.matcher(id).matches()) throw new Exception("Package id must be lowercase letters, digits and dashes");
        if (m.optString("family").isEmpty() || m.optString("entry").isEmpty()) throw new Exception("Manifest needs \"family\" and \"entry\"");
        if (!m.has("type")) m.put("type", theme ? "theme" : "vehicle");
        if (!(theme ? "theme" : "vehicle").equals(m.optString("type"))) throw new Exception("Manifest type does not match its file name");

        // 2) write it out fresh (replaces an older version with the same id)
        File dir = new File(new File(root(c), theme ? "themes" : "vehicles"), id);
        deleteTree(dir);
        String canon = dir.getCanonicalPath() + File.separator;
        for (java.util.Map.Entry<String, byte[]> f : files.entrySet()) {
            if (!f.getKey().startsWith(prefix)) continue;
            File out = new File(dir, f.getKey().substring(prefix.length()));
            if (!out.getCanonicalPath().startsWith(canon)) continue;      // never write outside the package folder
            File parent = out.getParentFile();
            if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new Exception("Could not create folder");
            try (FileOutputStream o = new FileOutputStream(out)) { o.write(f.getValue()); }
        }
        // store the (possibly completed) manifest
        try (FileOutputStream o = new FileOutputStream(new File(dir, theme ? "theme.json" : "vehicle.json"))) {
            o.write(m.toString(2).getBytes(StandardCharsets.UTF_8));
        }
        return (theme ? "Theme" : "Vehicle") + " installed: " + m.optString("name", id);
    }

    static boolean remove(Context c, String kind, String id) {
        if (!ID.matcher(id == null ? "" : id).matches()) return false;
        File dir = new File(new File(root(c), "theme".equals(kind) ? "themes" : "vehicles"), id);
        return deleteTree(dir);
    }

    private static boolean deleteTree(File f) {
        if (!f.exists()) return true;
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        return f.delete();
    }

    private static byte[] readCapped(InputStream in, long cap) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) {
            if (b.size() + n > cap) throw new Exception("Package is too big (60 MB max)");
            b.write(buf, 0, n);
        }
        return b.toByteArray();
    }

    private static String read(InputStream in) throws Exception {
        try (InputStream i = in) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = i.read(buf)) > 0) b.write(buf, 0, n);
            return b.toString("UTF-8");
        }
    }
}
