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

    static synchronized String take(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        String s = p.getString(KEY, "[]");
        p.edit().remove(KEY).commit();
        return s;
    }
}
