package de.frankythereal.epistolarium;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Zeigt die Erinnerung und plant sie nach Neustart oder Update neu ein. */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        if (Reminder.ACTION_FIRE.equals(intent.getAction())) {
            Reminder.notify(c);
            Reminder.prefs(c).edit().putLong("remLastFired", System.currentTimeMillis()).apply();
        }
        Reminder.schedule(c);
        EpistolariumWidget.updateAll(c);
    }
}
