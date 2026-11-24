package app.gagyebu;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** 앱이 닫혀 있는 동안 받은 결제 알림을 쌓아 두는 곳 (다음에 앱을 열면 웹앱이 가져감) */
final class PendingStore {
    private static final String PREF = "gagyebu_native";
    private static final String KEY = "pending";
    private static final int MAX = 200;

    private PendingStore() {
    }

    static synchronized void add(Context c, JSONObject item) {
        SharedPreferences p = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        JSONArray a;
        try {
            a = new JSONArray(p.getString(KEY, "[]"));
        } catch (JSONException e) {
            a = new JSONArray();
        }
        a.put(item);
        while (a.length() > MAX) a.remove(0);
        p.edit().putString(KEY, a.toString()).commit();
    }

    private static final String SEEN = "seen";
    private static final long SEEN_KEEP = 3L * 24 * 60 * 60 * 1000;
    private static final int SEEN_MAX = 400;

    /**
     * 받은 알림 내용을 기억 (앱이 꺼졌다 켜져도 유지). window 안에 같은 내용을 이미 받았으면 false.
     * 내용 대신 해시만 저장합니다.
     */
    static synchronized boolean markSeen(Context c, String content, long now, long window) {
        SharedPreferences p = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        JSONObject parsed;
        try {
            parsed = new JSONObject(p.getString(SEEN, "{}"));
        } catch (JSONException e) {
            parsed = new JSONObject();
        }
        final JSONObject seen = parsed;
        String key = Integer.toHexString(content.hashCode()) + ":" + content.length();
        long last = seen.optLong(key, 0);
        if (last > 0 && now - last < window) return false;
        // 오래된 것 정리
        JSONObject keep = new JSONObject();
        java.util.ArrayList<String> keys = new java.util.ArrayList<>();
        for (java.util.Iterator<String> it = seen.keys(); it.hasNext(); ) keys.add(it.next());
        keys.sort((a, b) -> Long.compare(seen.optLong(b), seen.optLong(a)));
        try {
            for (String k : keys) {
                if (keep.length() >= SEEN_MAX - 1) break;
                long t = seen.optLong(k);
                if (now - t < SEEN_KEEP) keep.put(k, t);
            }
            keep.put(key, now);
        } catch (JSONException ignored) {
        }
        p.edit().putString(SEEN, keep.toString()).commit();
        return true;
    }

    static synchronized String take(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        String s = p.getString(KEY, "[]");
        p.edit().remove(KEY).commit();
        return s;
    }
}
