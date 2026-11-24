package app.gagyebu;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 아무 일도 하지 않는 빈 부품. ListenerWatch가 이 부품을 켜고/꺼서
 * 시스템이 이 앱의 알림 연결을 다시 맺게 하는 신호로만 씁니다.
 */
public class RebindKick extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
    }
}
