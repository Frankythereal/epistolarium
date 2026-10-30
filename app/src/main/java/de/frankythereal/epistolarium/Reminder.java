package de.frankythereal.epistolarium;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.drawable.Icon;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Random;

/** Erinnerung an den nächsten Brief und Text für das Widget. */
final class Reminder {

    static final String ACTION_FIRE = "de.frankythereal.epistolarium.REMINDER";
    private static final String CHANNEL = "reminder";
    private static final long HOUR = 3_600_000L;
    private static final long DAY = 24 * HOUR;

    private Reminder() {
    }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("state", Context.MODE_PRIVATE);
    }

    /** Übernimmt den Zustand aus der App (Erinnerung, letzter Brief, Sprüche). */
    static void store(Context c, String json) {
        try {
            JSONObject o = new JSONObject(json);
            SharedPreferences p = prefs(c);
            SharedPreferences.Editor e = p.edit();
            boolean wasOn = p.getBoolean("remOn", false);
            boolean on = o.optBoolean("remOn", false);
            e.putBoolean("remOn", on);
            e.putInt("remDays", Math.max(1, o.optInt("remDays", 14)));
            e.putString("remTime", o.optString("remTime", "19:00"));
            e.putString("lastLetter", o.optString("lastLetter", ""));
            if (on && !wasOn) e.putString("remSince", LocalDate.now().toString());
            if (o.has("quotes")) e.putString("quotes", o.getJSONArray("quotes").toString());
            if (o.has("prompts")) e.putString("prompts", o.getJSONArray("prompts").toString());
            e.apply();
        } catch (Exception ignored) {
        }
    }

    private static LocalDate parse(String s) {
        try {
            return s == null || s.isEmpty() ? null : LocalDate.parse(s);
        } catch (Exception e) {
            return null;
        }
    }

    private static int[] time(SharedPreferences p) {
        String[] t = p.getString("remTime", "19:00").split(":");
        try {
            return new int[]{Integer.parseInt(t[0]), Integer.parseInt(t[1])};
        } catch (Exception e) {
            return new int[]{19, 0};
        }
    }

    /** Fällig ab: letzter Brief + Turnus. Ohne Brief zählt der Tag, an dem die Erinnerung eingeschaltet wurde. */
    private static LocalDate dueDate(SharedPreferences p) {
        LocalDate base = parse(p.getString("lastLetter", ""));
        if (base == null) base = parse(p.getString("remSince", ""));
        if (base == null) base = LocalDate.now();
        return base.plusDays(p.getInt("remDays", 14));
    }

    static long nextFire(SharedPreferences p, long now) {
        ZoneId z = ZoneId.systemDefault();
        int[] hm = time(p);
        long due = dueDate(p).atTime(hm[0], hm[1]).atZone(z).toInstant().toEpochMilli();
        if (due > now) return due;
        // Noch nicht geschrieben: sanft alle 2 Tage wieder erinnern
        long lastFired = p.getLong("remLastFired", 0);
        long earliest = Math.max(now + 60_000, lastFired + 2 * DAY - 2 * HOUR);
        ZonedDateTime e = Instant.ofEpochMilli(earliest).atZone(z);
        ZonedDateTime cand = e.toLocalDate().atTime(hm[0], hm[1]).atZone(z);
        if (cand.toInstant().toEpochMilli() < earliest) cand = cand.plusDays(1);
        return cand.toInstant().toEpochMilli();
    }

    private static PendingIntent alarmIntent(Context c) {
        Intent i = new Intent(c, ReminderReceiver.class).setAction(ACTION_FIRE);
        return PendingIntent.getBroadcast(c, 7, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void schedule(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        PendingIntent pi = alarmIntent(c);
        am.cancel(pi);
        SharedPreferences p = prefs(c);
        if (!p.getBoolean("remOn", false)) return;
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextFire(p, System.currentTimeMillis()), pi);
    }

    static boolean canNotify(Context c) {
        return Build.VERSION.SDK_INT < 33
                || c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private static String pick(String json, String fallback, Random r) {
        try {
            JSONArray a = new JSONArray(json);
            if (a.length() > 0) return a.getString(r.nextInt(a.length()));
        } catch (Exception ignored) {
        }
        return fallback;
    }

    static void notify(Context c) {
        if (!canNotify(c)) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Erinnerung an deinen Brief", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("Erinnert dich im gewählten Turnus an deinen Brief an dich selbst.");
        nm.createNotificationChannel(ch);

        SharedPreferences p = prefs(c);
        Random r = new Random();
        String prompt = pick(p.getString("prompts", ""), "Was hat dich seit deinem letzten Brief am meisten bewegt?", r);
        String quote = pick(p.getString("quotes", ""), "Was du aufschreibst, muss dein Kopf nicht mehr tragen.", r);
        int days = p.getInt("remDays", 14);
        String title = days == 7 ? "Zeit für deinen Weekly an dich" : "Zeit für deinen Brief an dich";

        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(c, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Intent add = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_PICK_PDF)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent addPi = PendingIntent.getActivity(c, 2, add, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification.Builder b = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setColor(0xFFCFAE67)
                .setContentTitle(title)
                .setContentText(prompt)
                .setStyle(new Notification.BigTextStyle().bigText(prompt + "\n\n„" + quote + "“"))
                .setContentIntent(openPi)
                .setAutoCancel(true)
                .addAction(new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_notify), "Brief ablegen", addPi).build());
        nm.notify(1, b.build());
    }

    /** Kurzer Status für das Widget. */
    static String status(Context c) {
        SharedPreferences p = prefs(c);
        LocalDate last = parse(p.getString("lastLetter", ""));
        LocalDate today = LocalDate.now();
        if (p.getBoolean("remOn", false)) {
            long left = ChronoUnit.DAYS.between(today, dueDate(p));
            if (left <= 0) return "Zeit für einen neuen Brief";
            if (left == 1) return "Nächster Brief morgen";
            return "Nächster Brief in " + left + " Tagen";
        }
        if (last == null) return "Briefe an dich selbst";
        long since = ChronoUnit.DAYS.between(last, today);
        if (since <= 0) return "Letzter Brief: heute";
        if (since == 1) return "Letzter Brief: gestern";
        return "Letzter Brief vor " + since + " Tagen";
    }
}
