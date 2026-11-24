package app.gagyebu;

import android.app.Notification;
import android.content.ComponentName;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONObject;

import java.util.regex.Pattern;

/**
 * 다른 앱의 알림을 받아, 금액이 들어 있는 것만 PendingStore에 쌓습니다.
 * 결제인지 판단·금액/가맹점 추출은 웹앱(notif.js)에서 합니다. 알림 내용은 폰 밖으로 나가지 않습니다.
 */
public class PayNotificationListener extends NotificationListenerService {
    /** 통화 표시가 붙은 숫자가 있는 알림만 저장 (채팅 등 나머지는 아예 저장하지 않음) */
    private static final Pattern MONEY = Pattern.compile(
            "(S\\$|SG\\$|US\\$|A\\$|HK\\$|SGD|USD|AUD|HKD|KRW|MYR|EUR|JPY|GBP|THB|IDR|CNY|₩|￦|€|¥|£|\\$|\\bRM)\\s?\\d"
                    + "|\\d[\\d,]*(\\.\\d+)?\\s?(원|円|SGD|USD|KRW|MYR)");
    /** 같은 알림이 갱신되며 여러 번 오는 경우 거르기 */
    private static final long DEDUPE_MS = 5 * 60 * 1000;
    /** 다시 연결됐을 때 알림창에서 가져올 알림의 최대 나이 */
    private static final long RECOVER_MS = 3L * 24 * 60 * 60 * 1000;

    /** 시스템과 실제로 연결되어 알림을 받고 있는지 (권한이 있어도 폰이 연결을 끊을 수 있음) */
    static volatile boolean connected = false;

    @Override
    public void onListenerConnected() {
        connected = true;
        ListenerWatch.schedule(this);
        // 연결이 끊긴 동안 온 알림 중 아직 알림창에 남아 있는 것을 가져옴 (이미 받은 것은 SeenStore로 거름)
        int added = 0;
        try {
            StatusBarNotification[] list = getActiveNotifications();
            if (list != null) for (StatusBarNotification sbn : list) if (handle(sbn, true)) added++;
        } catch (Exception ignored) {
        }
        MainActivity.deliverIfOpen(); // 화면이 열려 있으면 연결 상태와 새 알림 반영
    }

    @Override
    public void onListenerDisconnected() {
        connected = false;
        // 시스템이 연결을 끊은 경우 다시 붙여 달라고 요청 (안 되면 ListenerWatch가 다시 시도)
        try {
            requestRebind(new ComponentName(this, PayNotificationListener.class));
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        connected = true;
        try {
            if (handle(sbn, false)) MainActivity.deliverIfOpen();
        } catch (Exception ignored) {
            // 알림 하나 처리 실패가 서비스 전체를 멈추지 않도록
        }
    }

    /** 금액이 있는 알림이면 쌓아 두고 true. recovering = 다시 연결된 뒤 알림창에서 가져오는 중 */
    private boolean handle(StatusBarNotification sbn, boolean recovering) throws Exception {
        String pkg = sbn.getPackageName();
        if (getPackageName().equals(pkg)) return false;
        Notification n = sbn.getNotification();
        if (n == null) return false;
        if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return false;
        if ((n.flags & Notification.FLAG_ONGOING_EVENT) != 0) return false;
        Bundle e = n.extras;
        if (e == null) return false;
        long post = sbn.getPostTime();
        long now = System.currentTimeMillis();
        if (recovering && now - post > RECOVER_MS) return false;

        String title = str(e.getCharSequence(Notification.EXTRA_TITLE));
        CharSequence big = e.getCharSequence(Notification.EXTRA_BIG_TEXT);
        String text = str(big != null ? big : e.getCharSequence(Notification.EXTRA_TEXT));
        if (text.isEmpty()) {
            CharSequence[] lines = e.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
            if (lines != null) {
                StringBuilder sb = new StringBuilder();
                for (CharSequence l : lines) sb.append(l).append('\n');
                text = sb.toString().trim();
            }
        }
        String all = title + " " + text;
        if (!MONEY.matcher(all).find()) return false;

        // 새 알림: 같은 내용이 5분 안에 또 오면 무시 / 알림창에서 가져올 때: 한 번이라도 받은 내용이면 무시
        if (!PendingStore.markSeen(this, pkg + "|" + all, now, recovering ? RECOVER_MS : DEDUPE_MS)) return false;

        JSONObject o = new JSONObject();
        o.put("pkg", pkg);
        o.put("app", appLabel(pkg));
        o.put("title", title);
        o.put("text", text);
        o.put("time", post);
        if (recovering) o.put("recovered", true);
        PendingStore.add(this, o);
        return true;
    }

    private String appLabel(String pkg) {
        try {
            PackageManager pm = getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (Exception e) {
            return pkg;
        }
    }

    private static String str(CharSequence cs) {
        return cs == null ? "" : cs.toString().trim();
    }
}
