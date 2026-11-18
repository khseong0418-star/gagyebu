package app.gagyebu;

import android.content.ComponentName;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** 웹앱(app.js)에서 window.GagyebuNative 로 부르는 함수들 */
public class NativeBridge {
    private final MainActivity act;

    NativeBridge(MainActivity act) {
        this.act = act;
    }

    /** 사용자가 '알림 접근'을 허용했는지 */
    @JavascriptInterface
    public boolean listenerEnabled() {
        String flat = Settings.Secure.getString(act.getContentResolver(), "enabled_notification_listeners");
        if (flat == null || flat.isEmpty()) return false;
        ComponentName me = new ComponentName(act, PayNotificationListener.class);
        for (String part : flat.split(":")) {
            ComponentName cn = ComponentName.unflattenFromString(part);
            if (me.equals(cn)) return true;
        }
        return false;
    }

    @JavascriptInterface
    public void openListenerSettings() {
        act.runOnUiThread(() -> {
            try {
                Intent i;
                if (Build.VERSION.SDK_INT >= 30) {
                    i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
                    i.putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                            new ComponentName(act, PayNotificationListener.class).flattenToString());
                } else {
                    i = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
                }
                act.startActivity(i);
            } catch (Exception e) {
                act.startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
            }
        });
    }

    /** '제한된 설정 허용'은 앱 정보 화면의 ⋮ 메뉴에 있음 */
    @JavascriptInterface
    public void openAppSettings() {
        act.runOnUiThread(() -> act.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + act.getPackageName()))));
    }

    /** 쌓여 있는 알림(JSON 배열)을 가져가고 비움 */
    @JavascriptInterface
    public String takePending() {
        return PendingStore.take(act);
    }

    @JavascriptInterface
    public void openUrl(String url) {
        if (url != null && url.startsWith("https://")) act.runOnUiThread(() -> act.openExternal(url));
    }

    /** 다운로드/가계부 폴더에 파일 저장, share=true면 공유 창까지 띄움 */
    @JavascriptInterface
    public String saveFile(String name, String mime, String content, boolean share) {
        try {
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME, name);
            v.put(MediaStore.Downloads.MIME_TYPE, mime);
            v.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/가계부");
            Uri uri = act.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) return "error";
            try (OutputStream os = act.getContentResolver().openOutputStream(uri)) {
                if (os == null) return "error";
                os.write(content.getBytes(StandardCharsets.UTF_8));
            }
            if (share) {
                act.runOnUiThread(() -> {
                    Intent s = new Intent(Intent.ACTION_SEND);
                    s.setType(mime);
                    s.putExtra(Intent.EXTRA_STREAM, uri);
                    s.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    act.startActivity(Intent.createChooser(s, "백업 보내기"));
                });
            }
            return "ok";
        } catch (Exception e) {
            return "error";
        }
    }

    @JavascriptInterface
    public void setBars(String hex, boolean dark) {
        try {
            int color = Color.parseColor(hex);
            act.runOnUiThread(() -> act.setBars(color, dark));
        } catch (Exception ignored) {
        }
    }

    /* ---------- 바로 업데이트 (Ota) ---------- */

    /** {builtIn, served, active, ready, bad, nativeCode} */
    @JavascriptInterface
    public String otaStatus() {
        return Ota.status(act, act.webVer);
    }

    /** 새 버전 확인·내려받기. 결과는 window.__gagyebuOta(json) 으로 */
    @JavascriptInterface
    public void otaCheck() {
        Ota.check(act, act.webVer, json -> act.runOnUiThread(() -> act.sendOta(json)));
    }

    /** 받아 둔 새 버전을 지금 적용 (화면을 다시 엶) */
    @JavascriptInterface
    public boolean otaApply() {
        String v = Ota.applyReady(act);
        if (v == null) return false;
        act.runOnUiThread(() -> act.loadWeb(v));
        return true;
    }

    /** 화면 코드가 정상 시작됨 (jsVersion = 화면 코드의 APP_VERSION). 반환값: 직전에 실패해 되돌린 버전 */
    @JavascriptInterface
    public String otaOk(String jsVersion) {
        String served = act.webVer;
        return Ota.confirm(act, !served.isEmpty() && served.equals(jsVersion) ? served : "");
    }

    /** 받은 업데이트를 지우고 APK 안의 기본 코드로 되돌림 */
    @JavascriptInterface
    public void otaReset() {
        Ota.reset(act, act.webVer);
        act.runOnUiThread(() -> act.loadWeb(""));
    }

    @JavascriptInterface
    public String version() {
        try {
            return act.getPackageManager().getPackageInfo(act.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }
}
