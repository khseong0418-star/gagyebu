package app.gagyebu;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Iterator;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 폰에서 바로 받는 업데이트. 앱 본체(APK)는 그대로 두고 화면 코드(docs/ 의 html·js·css)만
 * GitHub Pages 에서 내려받아 바꿔 끼웁니다. tools/make-ota.js 가 개인키로 서명한 묶음만 받아들입니다.
 *
 * 상태 (SharedPreferences "ota"):
 *   active = 정상 실행이 확인된 버전, trial = 적용했지만 아직 정상 실행 확인 전, ready = 받아 두고 적용 전,
 *   bad = 실행에 실패해 건너뛸 버전, reverted = 되돌렸다는 사실을 화면에 한 번 알리기 위한 표시.
 * 새 버전이 정상 시작을 알리지 못하면(otaOk) 다음 시작 때나 15초 뒤 이전 버전으로 되돌립니다.
 */
final class Ota {
    static final String BASE = "https://khseong0418-star.github.io/gagyebu/ota/";
    /** android/ota-key.pem(개인키, git에 올리지 않음)의 짝 */
    private static final String PUBLIC_KEY =
            "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEd5Z0Ap4ZxtWkYfVQ2mHeYh09zqFJcc2/8JEwxNbXfvH4KPTaAjrRpj6b6rrZ87Syd951EBamBjbP0Vy0japMUw==";
    private static final int MAX_META = 64 * 1024;
    private static final int MAX_BUNDLE = 8 * 1024 * 1024;
    private static final Pattern VER = Pattern.compile("^\\d{1,4}\\.\\d{1,4}\\.\\d{1,4}$");
    private static final Pattern BUNDLE = Pattern.compile("^bundle-\\d{1,4}\\.\\d{1,4}\\.\\d{1,4}\\.json$");
    /** 점으로 시작하는 조각이 없으니 ".." 로 폴더 밖을 가리킬 수 없음 (tools/make-ota.js 와 같은 규칙) */
    private static final Pattern PATH = Pattern.compile("^[A-Za-z0-9_-][A-Za-z0-9._-]*(/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$");
    private static final AtomicBoolean busy = new AtomicBoolean();
    private static String builtIn;

    interface Done {
        void done(String json);
    }

    private Ota() {
    }

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("ota", Context.MODE_PRIVATE);
    }

    private static String get(SharedPreferences p, String k) {
        return p.getString(k, "");
    }

    private static File dir(Context c) {
        return new File(c.getFilesDir(), "ota");
    }

    static File verDir(Context c, String v) {
        return new File(dir(c), v);
    }

    private static boolean usable(Context c, String v) {
        if (v.isEmpty()) return false;
        File d = verDir(c, v);
        return new File(d, "index.html").isFile() && new File(d, "app.js").isFile();
    }

    /** "1.10.0" > "1.9.3". 빈 값은 0.0.0 */
    static int cmp(String a, String b) {
        String[] x = a.isEmpty() ? new String[0] : a.split("\\.");
        String[] y = b.isEmpty() ? new String[0] : b.split("\\.");
        for (int i = 0; i < 3; i++) {
            int p = i < x.length ? parse(x[i]) : 0, q = i < y.length ? parse(y[i]) : 0;
            if (p != q) return Integer.compare(p, q);
        }
        return 0;
    }

    private static int parse(String s) {
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String max(String a, String b) {
        return cmp(a, b) >= 0 ? a : b;
    }

    /** APK 안에 들어 있는 화면 코드의 버전 (assets/www/app.js 의 APP_VERSION) */
    static synchronized String builtIn(Context c) {
        if (builtIn != null) return builtIn;
        String v = "";
        try (InputStream in = c.getAssets().open("www/app.js")) {
            byte[] head = new byte[2048];
            int n = 0, r;
            while (n < head.length && (r = in.read(head, n, head.length - n)) > 0) n += r;
            Matcher m = Pattern.compile("APP_VERSION = '(\\d+\\.\\d+\\.\\d+)'").matcher(new String(head, 0, n, StandardCharsets.UTF_8));
            if (m.find()) v = m.group(1);
        } catch (IOException ignored) {
        }
        builtIn = v;
        return v;
    }

    static long nativeCode(Context c) {
        try {
            return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).getLongVersionCode();
        } catch (Exception e) {
            return 0;
        }
    }

    /** 앱(화면)을 열 때 어떤 화면 코드를 쓸지 정함. 반환값: 쓸 버전, "" = APK 안의 기본 코드 */
    static synchronized String resolve(Context c) {
        SharedPreferences p = prefs(c);
        SharedPreferences.Editor e = p.edit();
        String base = builtIn(c);
        String active = get(p, "active"), trial = get(p, "trial"), ready = get(p, "ready");
        if (!trial.isEmpty()) {
            // 지난번에 적용한 새 버전이 정상 시작을 알리지 못함 → 건너뛰고 이전 버전으로
            e.putString("bad", trial).putString("reverted", trial).putString("trial", "");
            if (trial.equals(ready)) ready = "";
        }
        if (!usable(c, active) || cmp(active, base) <= 0) active = "";
        String serve = active;
        if (usable(c, ready) && cmp(ready, max(active, base)) > 0) {
            serve = ready; // 받아 둔 새 버전을 이번 시작부터 적용 (정상 시작 확인 전까지는 trial)
            e.putString("trial", ready);
        }
        e.putString("active", active).putString("ready", "").commit();
        cleanup(c, active, serve);
        return serve;
    }

    /** 받아 둔 새 버전을 지금 적용. 반환값: 적용할 버전, null = 없음 */
    static synchronized String applyReady(Context c) {
        SharedPreferences p = prefs(c);
        String ready = get(p, "ready");
        if (!usable(c, ready)) return null;
        p.edit().putString("trial", ready).putString("ready", "").commit();
        return ready;
    }

    /** 화면 코드가 정상적으로 시작됨. 반환값: 직전에 되돌린 버전(화면에 한 번 알림) */
    static synchronized String confirm(Context c, String served) {
        SharedPreferences p = prefs(c);
        String reverted = get(p, "reverted");
        SharedPreferences.Editor e = p.edit().putString("reverted", "");
        String trial = get(p, "trial");
        if (!trial.isEmpty() && trial.equals(served)) {
            e.putString("active", trial).putString("trial", "");
            reverted = "";
        }
        e.commit();
        cleanup(c, get(p, "active"), get(p, "ready"));
        return reverted;
    }

    /** 새 버전이 제때 정상 시작을 알리지 못함 → 건너뛰기. 반환값: 대신 쓸 버전, null = 이미 확인됨 */
    static synchronized String revertTrial(Context c, String v) {
        SharedPreferences p = prefs(c);
        if (v.isEmpty() || !v.equals(get(p, "trial"))) return null;
        p.edit().putString("bad", v).putString("reverted", v).putString("trial", "").commit();
        String active = get(p, "active");
        return usable(c, active) && cmp(active, builtIn(c)) > 0 ? active : "";
    }

    /** 받은 업데이트를 모두 지우고 APK 안의 기본 코드로 */
    static synchronized void reset(Context c, String served) {
        SharedPreferences.Editor e = prefs(c).edit().putString("active", "").putString("trial", "").putString("ready", "");
        if (!served.isEmpty()) e.putString("bad", served);
        e.commit();
        cleanup(c, "", "");
    }

    static synchronized String status(Context c, String served) {
        SharedPreferences p = prefs(c);
        JSONObject o = new JSONObject();
        try {
            o.put("builtIn", builtIn(c)).put("served", served).put("active", get(p, "active"))
                    .put("ready", get(p, "ready")).put("bad", get(p, "bad")).put("nativeCode", nativeCode(c));
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    /** 새 버전 확인 → 있으면 내려받아 서명 확인 후 ready 로 둠. 결과는 done 으로 (다른 스레드에서) */
    static void check(Context c, String served, Done done) {
        if (!busy.compareAndSet(false, true)) return; // 이미 확인 중: 그 결과가 곧 전달됨
        Context app = c.getApplicationContext();
        new Thread(() -> {
            JSONObject r = new JSONObject();
            String state;
            try {
                JSONObject m = new JSONObject(new String(fetch(BASE + "latest.json?t=" + System.currentTimeMillis() / 60000, MAX_META), StandardCharsets.UTF_8));
                String v = m.getString("version"), name = m.getString("bundle");
                if (!VER.matcher(v).matches() || !BUNDLE.matcher(name).matches()) throw new IOException("bad meta");
                r.put("latest", v);
                SharedPreferences p = prefs(app);
                String have;
                synchronized (Ota.class) {
                    have = max(max(builtIn(app), served), max(get(p, "active"), get(p, "trial")));
                }
                long code = nativeCode(app);
                if (cmp(v, have) <= 0) state = "latest";
                else if (v.equals(get(p, "ready")) && usable(app, v)) state = "ready";
                else if (v.equals(get(p, "bad"))) state = "bad";
                else if (m.optLong("minNative", 0) > code) state = "native";
                else {
                    byte[] b = fetch(BASE + name, MAX_BUNDLE);
                    if (!hex(MessageDigest.getInstance("SHA-256").digest(b)).equalsIgnoreCase(m.getString("sha256")))
                        throw new IOException("hash");
                    if (!verify(b, Base64.getDecoder().decode(m.getString("sig")))) throw new SecurityException("signature");
                    // 여기부터는 서명된 내용만 믿음
                    JSONObject bundle = new JSONObject(new String(b, StandardCharsets.UTF_8));
                    if (!v.equals(bundle.getString("version"))) throw new SecurityException("version");
                    if (bundle.optLong("minNative", 0) > code) state = "native";
                    else {
                        extract(app, v, bundle.getJSONObject("files"));
                        state = "ready";
                    }
                }
            } catch (Exception e) {
                state = "error";
                try {
                    r.put("error", e.getClass().getSimpleName());
                } catch (Exception ignored) {
                }
            }
            try {
                r.put("state", state);
            } catch (Exception ignored) {
            }
            busy.set(false);
            done.done(r.toString());
        }, "gagyebu-ota").start();
    }

    private static boolean verify(byte[] data, byte[] sig) throws Exception {
        PublicKey key = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(PUBLIC_KEY)));
        Signature s = Signature.getInstance("SHA256withECDSA");
        s.initVerify(key);
        s.update(data);
        return s.verify(sig);
    }

    /** 임시 폴더에 풀고 확인한 뒤 한 번에 바꿔 놓고 ready 로 표시 */
    private static void extract(Context c, String v, JSONObject files) throws Exception {
        File tmp = new File(dir(c), v + ".tmp");
        deleteTree(tmp);
        if (!tmp.mkdirs()) throw new IOException("mkdir");
        Iterator<String> it = files.keys();
        while (it.hasNext()) {
            String rel = it.next();
            if (!PATH.matcher(rel).matches()) throw new SecurityException("path");
            File f = new File(tmp, rel);
            File parent = f.getParentFile();
            if (parent != null && !parent.isDirectory() && !parent.mkdirs()) throw new IOException("mkdir");
            try (FileOutputStream os = new FileOutputStream(f)) {
                os.write(Base64.getDecoder().decode(files.getString(rel)));
            }
        }
        if (!new File(tmp, "index.html").isFile() || !new File(tmp, "app.js").isFile()) throw new IOException("incomplete");
        File dst = verDir(c, v);
        synchronized (Ota.class) {
            deleteTree(dst);
            if (!tmp.renameTo(dst)) throw new IOException("rename");
            prefs(c).edit().putString("ready", v).commit();
        }
    }

    private static byte[] fetch(String url, int limit) throws IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        try {
            con.setConnectTimeout(10000);
            con.setReadTimeout(20000);
            con.setUseCaches(false);
            con.setRequestProperty("Cache-Control", "no-cache");
            if (con.getResponseCode() != 200) throw new IOException("HTTP " + con.getResponseCode());
            if (!url.startsWith("https://") || !"https".equals(con.getURL().getProtocol())) throw new IOException("https");
            try (InputStream in = con.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    if (out.size() > limit) throw new IOException("too large");
                }
                return out.toByteArray();
            }
        } finally {
            con.disconnect();
        }
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }

    /** 지금 쓰거나 곧 쓸 버전만 남기고 지움 */
    private static void cleanup(Context c, String keepA, String keepB) {
        SharedPreferences p = prefs(c);
        String trial = get(p, "trial"), ready = get(p, "ready");
        File[] list = dir(c).listFiles();
        if (list == null) return;
        for (File f : list) {
            String n = f.getName();
            if (n.equals(keepA) || n.equals(keepB) || n.equals(trial) || n.equals(ready)) continue;
            if (n.endsWith(".tmp") && busy.get()) continue; // 받는 중인 묶음
            deleteTree(f);
        }
    }

    private static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
