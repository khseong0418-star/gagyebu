package app.gagyebu;

import android.app.Notification;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONObject;

import java.util.Iterator;
import java.util.LinkedHashMap;
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
    private static final long DEDUPE_MS = 5 * 60 * 1000;

    /** 같은 알림이 갱신되며 여러 번 오는 경우 거르기 */
    private final LinkedHashMap<String, Long> recent = new LinkedHashMap<>();

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String pkg = sbn.getPackageName();
            if (getPackageName().equals(pkg)) return;
            Notification n = sbn.getNotification();
            if (n == null) return;
            if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            if ((n.flags & Notification.FLAG_ONGOING_EVENT) != 0) return;
            Bundle e = n.extras;
            if (e == null) return;

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
            if (!MONEY.matcher(all).find()) return;

            long now = System.currentTimeMillis();
            String fp = pkg + "|" + all;
            synchronized (recent) {
                Long seen = recent.get(fp);
                if (seen != null && now - seen < DEDUPE_MS) return;
                recent.put(fp, now);
                if (recent.size() > 100) {
                    Iterator<String> it = recent.keySet().iterator();
                    it.next();
                    it.remove();
                }
            }

            JSONObject o = new JSONObject();
            o.put("pkg", pkg);
            o.put("app", appLabel(pkg));
            o.put("title", title);
            o.put("text", text);
            o.put("time", sbn.getPostTime());
            PendingStore.add(this, o);
            MainActivity.deliverIfOpen();
        } catch (Exception ignored) {
            // 알림 하나 처리 실패가 서비스 전체를 멈추지 않도록
        }
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
