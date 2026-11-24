package app.gagyebu;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.util.Collections;

/** 가계부 웹앱을 띄우는 화면. 화면 코드는 APK 안(assets/www) 또는 바로 받은 업데이트(Ota)에서 읽습니다. */
public class MainActivity extends Activity {
    /** WebViewAssetLoader와 같은 예약 도메인: 실제 인터넷 주소가 아니라 앱 안의 파일을 가리킵니다. */
    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/www/index.html";
    private static final int REQ_FILE = 41;

    /** 알림이 왔을 때 화면이 열려 있으면 바로 반영하기 위한 참조 */
    private static volatile WeakReference<MainActivity> current = new WeakReference<>(null);

    WebView web;
    private ValueCallback<Uri[]> fileCallback;
    /** 지금 띄운 화면 코드: "" = APK 안의 기본 코드, 그 밖 = 받은 업데이트 버전 */
    volatile String webVer = "";
    private volatile File webRoot;
    private boolean clearHist;
    private final Handler ui = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);

        web.addJavascriptInterface(new NativeBridge(this), "GagyebuNative");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                return assetResponse(u.getPath());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (clearHist) { // 새 버전으로 다시 연 뒤 뒤로 가기로 이전 화면에 가지 않게
                    clearHist = false;
                    view.clearHistory();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                openExternal(u.toString());
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "백업 파일 선택"), REQ_FILE);
                    return true;
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
            }
        });
        loadWeb(Ota.resolve(this));
        ListenerWatch.schedule(this);
    }

    /** 화면 코드 버전을 정해 처음부터 다시 엶. 새 버전은 15초 안에 정상 시작을 알려야 계속 씀 */
    void loadWeb(String v) {
        webVer = v;
        webRoot = v.isEmpty() ? null : Ota.verDir(this, v);
        clearHist = true;
        web.loadUrl(START_URL);
        if (!v.isEmpty()) ui.postDelayed(() -> {
            if (isDestroyed() || !v.equals(webVer)) return;
            String back = Ota.revertTrial(this, v);
            if (back != null) loadWeb(back);
        }, 15000);
    }

    /** 바로 업데이트 확인 결과를 화면 코드에 전달 */
    void sendOta(String json) {
        if (web != null && !isDestroyed())
            web.evaluateJavascript("window.__gagyebuOta && window.__gagyebuOta(" + JSONObject.quote(json) + ")", null);
    }

    private WebResourceResponse assetResponse(String path) {
        if (path == null || !path.startsWith("/www/") || path.contains("..")) return notFound();
        String rel = path.substring(1);
        if (rel.endsWith("/")) rel += "index.html";
        try {
            InputStream in = null;
            File root = webRoot;
            if (root != null) {
                File f = new File(root, rel.substring(4)); // "www/" 다음
                if (f.isFile()) in = new FileInputStream(f);
            }
            if (in == null) in = getAssets().open(rel);
            String mime = mimeOf(rel);
            WebResourceResponse r = new WebResourceResponse(mime, mime.startsWith("text/") || mime.endsWith("json") ? "UTF-8" : null, in);
            r.setResponseHeaders(Collections.singletonMap("Cache-Control", "no-cache"));
            return r;
        } catch (IOException e) {
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
        r.setStatusCodeAndReasonPhrase(404, "Not Found");
        return r;
    }

    private static String mimeOf(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        return "application/octet-stream";
    }

    void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {
        }
    }

    /** 웹앱에 "새 알림이 쌓였으니 가져가라"고 알림 */
    void notifyWeb() {
        if (web != null) web.evaluateJavascript("window.__gagyebuNativeNotif && window.__gagyebuNativeNotif()", null);
    }

    static void deliverIfOpen() {
        MainActivity a = current.get();
        if (a != null) a.runOnUiThread(a::notifyWeb);
    }

    /** 상태바·내비게이션바 색을 앱 테마에 맞춤 */
    void setBars(int color, boolean dark) {
        Window w = getWindow();
        w.setStatusBarColor(color);
        w.setNavigationBarColor(color);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = w.getInsetsController();
            if (c != null) {
                int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(dark ? 0 : mask, mask);
            }
        } else {
            View d = w.getDecorView();
            int mask = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            int f = d.getSystemUiVisibility();
            d.setSystemUiVisibility(dark ? (f & ~mask) : (f | mask));
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        current = new WeakReference<>(this);
        notifyWeb(); // 권한 설정에서 돌아왔거나, 그사이 쌓인 알림 반영
        // 알림 연결이 끊겨 있으면 다시 연결 (다시 연결되면 놓친 알림을 가져오고 화면에 알려 줌)
        ui.postDelayed(() -> {
            if (!isDestroyed()) ListenerWatch.ensure(this, false);
        }, ListenerWatch.GRACE_MS);
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        if (current.get() == this) current = new WeakReference<>(null);
        if (web != null) web.destroy();
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); // 열린 창(바텀시트) 닫기
        else super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }
}
