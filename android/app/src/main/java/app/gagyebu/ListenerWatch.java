package app.gagyebu;

import android.app.NotificationManager;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.NotificationListenerService;

/**
 * 알림 연결 지킴이.
 * 삼성 폰은 메모리가 부족할 때 앱을 끄고, 그 뒤 알림 연결을 다시 붙여 주지 않는 경우가 있습니다
 * (설정에는 '허용됨'으로 보이지만 알림이 오지 않음). 15분마다, 그리고 앱을 열 때 연결을 확인해서
 * 끊겨 있으면 시스템이 다시 연결하게 합니다.
 * - 이 작업이 돌면서 앱 프로세스가 뜨면, 다시 시작을 기다리던 알림 연결이 붙음
 * - 그래도 안 붙으면 빈 부품(RebindKick)을 켜고/꺼서 '앱이 바뀌었다'는 신호를 보내 시스템이 연결을 다시 맺게 함
 *   (알림 받는 부분 자체는 건드리지 않으므로 알림 접근 권한은 그대로)
 */
public class ListenerWatch extends JobService {
    private static final int JOB_ID = 4101;
    private static final long PERIOD_MS = 15 * 60 * 1000L;
    /** 앱이 막 켜졌을 때 시스템이 스스로 연결할 시간을 줌 */
    static final long GRACE_MS = 4000;

    private static final Handler main = new Handler(Looper.getMainLooper());

    static void schedule(Context c) {
        try {
            JobScheduler js = c.getSystemService(JobScheduler.class);
            if (js == null || js.getPendingJob(JOB_ID) != null) return;
            js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, ListenerWatch.class))
                    .setPeriodic(PERIOD_MS)
                    .setPersisted(true)
                    .build());
        } catch (Exception ignored) {
        }
    }

    /** 사용자가 알림 접근을 허용했는지 */
    static boolean allowed(Context c) {
        try {
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            return nm != null && nm.isNotificationListenerAccessGranted(new ComponentName(c, PayNotificationListener.class));
        } catch (Exception e) {
            return false;
        }
    }

    /** 허용됐는데 연결이 끊겨 있으면 다시 연결 요청. force = 연결돼 보여도 요청 (사용자가 직접 누른 경우) */
    static void ensure(Context c, boolean force) {
        if (!allowed(c) || (PayNotificationListener.connected && !force)) return;
        Context app = c.getApplicationContext();
        try {
            NotificationListenerService.requestRebind(new ComponentName(app, PayNotificationListener.class));
        } catch (Exception ignored) {
        }
        // 빈 부품 상태를 바꾸면 시스템이 약 10초 뒤 이 앱의 알림 연결을 다시 맺음
        try {
            PackageManager pm = app.getPackageManager();
            ComponentName kick = new ComponentName(app, RebindKick.class);
            int now = pm.getComponentEnabledSetting(kick);
            pm.setComponentEnabledSetting(kick,
                    now == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                            ? PackageManager.COMPONENT_ENABLED_STATE_DISABLED
                            : PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                    PackageManager.DONT_KILL_APP);
        } catch (Exception ignored) {
        }
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        main.postDelayed(() -> {
            ensure(this, false);
            jobFinished(params, false);
        }, GRACE_MS);
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
