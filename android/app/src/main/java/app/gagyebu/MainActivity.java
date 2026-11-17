package app.gagyebu;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.ref.WeakReference;
import java.util.Collections;

/** 가계부 웹앱(assets/www)을 띄우는 화면. 웹 코드는 GitHub Pages 버전과 같습니다. */
public class MainActivity extends Activity {
    /** WebViewAssetLoader와 같은 예약 도메인: 실제 인터넷 주소가 아니라 앱 안의 파일을 가리킵니다. */
    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/www/index.html";
    private static final int REQ_FILE = 41;

    /** 알림이 왔을 때 화면이 열려 있으면 바로 반영하기 위한 참조 */
    private static volatile WeakReference<MainActivity> current = new WeakReference<>(null);

    WebView web;
    private ValueCallback<Uri[]> fileCallback;

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
        web.loadUrl(START_URL);
    }

    private WebResourceResponse assetResponse(String path) {
        if (path == null || !path.startsWith("/www/") || path.contains("..")) return notFound();
        String rel = path.substring(1);
        if (rel.endsWith("/")) rel += "index.html";
        try {
            InputStream in = getAssets().open(rel);
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
    }

    @Override
    protected void onDestroy() {
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
