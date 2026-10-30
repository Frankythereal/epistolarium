package de.frankythereal.epistolarium;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

/** Startbildschirm-Widget: Brief ablegen, mit Adobe Scan scannen, Status. */
public class EpistolariumWidget extends AppWidgetProvider {

    static final String ADOBE_SCAN = "com.adobe.scan.android";

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, views(c));
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        if (m == null) return;
        int[] ids = m.getAppWidgetIds(new ComponentName(c, EpistolariumWidget.class));
        for (int id : ids) m.updateAppWidget(id, views(c));
    }

    private static RemoteViews views(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        v.setTextViewText(R.id.w_sub, Reminder.status(c));

        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(c, 10, open,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));

        Intent add = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_PICK_PDF)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.w_add, PendingIntent.getActivity(c, 11, add,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));

        Intent scan = c.getPackageManager().getLaunchIntentForPackage(ADOBE_SCAN);
        if (scan != null) {
            scan.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            v.setOnClickPendingIntent(R.id.w_scan, PendingIntent.getActivity(c, 12, scan,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            v.setViewVisibility(R.id.w_scan, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.w_scan, View.GONE);
        }
        return v;
    }
}
