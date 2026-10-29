package de.frankythereal.epistolarium;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

public class MainActivity extends Activity {

    private static final String HOST = "app.epistolarium";
    private static final String BASE = "https://" + HOST + "/";
    private static final int REQ_PICK_PDF = 11;
    private static final int REQ_EXPORT = 12;
    private static final int REQ_IMPORT = 13;
    private static final int MAX_EDGE = 1568;

    private WebView web;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final ExecutorService net = Executors.newCachedThreadPool();
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean jsReady = false;
    private final List<Intent> pendingIntents = new ArrayList<>();

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0E1829"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                return serve(u.getPath());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Native");
        setContentView(web);
        web.loadUrl(BASE + "index.html");
        if (getIntent() != null) handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.handleBack ? window.handleBack() : false", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    // ---------- serving files to the WebView ----------

    private WebResourceResponse serve(String path) {
        try {
            if (path == null || path.equals("/")) path = "/index.html";
            if (path.contains("..")) return notFound();
            InputStream in;
            if (path.startsWith("/letter/")) {
                File f = new File(lettersDir(), path.substring("/letter/".length()));
                if (!f.exists()) return notFound();
                in = new FileInputStream(f);
            } else {
                in = getAssets().open("www" + path);
            }
            WebResourceResponse r = new WebResourceResponse(mime(path), "utf-8", in);
            java.util.Map<String, String> h = new java.util.HashMap<>();
            h.put("Cache-Control", "no-cache");
            r.setResponseHeaders(h);
            return r;
        } catch (IOException e) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null,
                new ByteArrayInputStream(new byte[0]));
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".jpg")) return "image/jpeg";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".pdf")) return "application/pdf";
        return "application/octet-stream";
    }

    // ---------- intents (share from Adobe Scan, Gemini, ...) ----------

    private void handleIntent(Intent intent) {
        String a = intent.getAction();
        if (!Intent.ACTION_SEND.equals(a) && !Intent.ACTION_SEND_MULTIPLE.equals(a)
                && !Intent.ACTION_VIEW.equals(a)) return;
        if (!jsReady) {
            pendingIntents.add(intent);
            return;
        }
        String type = intent.getType() == null ? "" : intent.getType();
        if (Intent.ACTION_SEND.equals(a) && type.startsWith("text/")) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null) js("window.onSharedText(" + JSONObject.quote(text) + ")");
            return;
        }
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_VIEW.equals(a) && intent.getData() != null) {
            uris.add(intent.getData());
        } else if (Intent.ACTION_SEND.equals(a)) {
            Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (u != null) uris.add(u);
        } else {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        }
        importPdfs(uris);
        intent.setAction(null);
    }

    private void importPdfs(List<Uri> uris) {
        if (uris.isEmpty()) return;
        io.execute(() -> {
            for (Uri u : uris) {
                try {
                    String name = displayName(u);
                    JSONObject r = importPdf(u, name);
                    js("window.onPdfImported(" + r + ")");
                } catch (Exception e) {
                    js("window.onNativeError(" + JSONObject.quote("PDF konnte nicht gelesen werden: " + e.getMessage()) + ")");
                }
            }
        });
    }

    private String displayName(Uri u) {
        try (android.database.Cursor c = getContentResolver().query(u, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                if (i >= 0) return c.getString(i);
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    private File lettersDir() {
        File d = new File(getFilesDir(), "letters");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private JSONObject importPdf(Uri uri, String name) throws Exception {
        String id = UUID.randomUUID().toString().substring(0, 13).replace("-", "");
        File dir = new File(lettersDir(), id);
        dir.mkdirs();
        File pdf = new File(dir, "original.pdf");
        try (InputStream in = getContentResolver().openInputStream(uri);
             OutputStream out = new FileOutputStream(pdf)) {
            copy(in, out);
        }
        int pages = renderPages(pdf, dir);
        JSONObject r = new JSONObject();
        r.put("id", id);
        r.put("pages", pages);
        r.put("fileName", name == null ? "" : name);
        return r;
    }

    private int renderPages(File pdf, File dir) throws IOException {
        try (ParcelFileDescriptor fd = ParcelFileDescriptor.open(pdf, ParcelFileDescriptor.MODE_READ_ONLY);
             PdfRenderer r = new PdfRenderer(fd)) {
            int n = r.getPageCount();
            for (int i = 0; i < n; i++) {
                try (PdfRenderer.Page p = r.openPage(i)) {
                    float scale = (float) MAX_EDGE / Math.max(p.getWidth(), p.getHeight());
                    int w = Math.max(1, Math.round(p.getWidth() * scale));
                    int h = Math.max(1, Math.round(p.getHeight() * scale));
                    Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                    b.eraseColor(Color.WHITE);
                    p.render(b, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                    try (FileOutputStream out = new FileOutputStream(new File(dir, "p" + (i + 1) + ".jpg"))) {
                        b.compress(Bitmap.CompressFormat.JPEG, 86, out);
                    }
                    b.recycle();
                }
            }
            return n;
        }
    }

    // ---------- helpers ----------

    private void js(String code) {
        main.post(() -> web.evaluateJavascript(code, null));
    }

    private static void copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        copy(in, b);
        return b.toByteArray();
    }

    private File dataFile() {
        return new File(getFilesDir(), "data.json");
    }

    private SharedPreferences secret() {
        return getSharedPreferences("secret", Context.MODE_PRIVATE);
    }

    private static void deleteRec(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteRec(k);
        f.delete();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (resultCode != RESULT_OK || data == null) {
            js("window.onPickerCancelled && window.onPickerCancelled()");
            return;
        }
        if (requestCode == REQ_PICK_PDF) {
            List<Uri> uris = new ArrayList<>();
            ClipData clip = data.getClipData();
            if (clip != null) {
                for (int i = 0; i < clip.getItemCount(); i++) uris.add(clip.getItemAt(i).getUri());
            } else if (data.getData() != null) {
                uris.add(data.getData());
            }
            importPdfs(uris);
        } else if (requestCode == REQ_EXPORT) {
            Uri target = data.getData();
            io.execute(() -> {
                try (OutputStream os = getContentResolver().openOutputStream(target);
                     ZipOutputStream zip = new ZipOutputStream(os)) {
                    if (dataFile().exists()) addToZip(zip, dataFile(), "data.json");
                    File[] letters = lettersDir().listFiles();
                    if (letters != null) for (File d : letters) {
                        File[] files = d.listFiles();
                        if (files != null) for (File f : files)
                            addToZip(zip, f, "letters/" + d.getName() + "/" + f.getName());
                    }
                    js("window.onBackupDone(true)");
                } catch (Exception e) {
                    js("window.onBackupDone(false)");
                }
            });
        } else if (requestCode == REQ_IMPORT) {
            Uri src = data.getData();
            io.execute(() -> {
                try (InputStream is = getContentResolver().openInputStream(src);
                     ZipInputStream zip = new ZipInputStream(is)) {
                    ZipEntry e;
                    boolean sawData = false;
                    String canonBase = getFilesDir().getCanonicalPath();
                    while ((e = zip.getNextEntry()) != null) {
                        if (e.isDirectory()) continue;
                        File out = new File(getFilesDir(), e.getName());
                        if (!out.getCanonicalPath().startsWith(canonBase + File.separator)) continue;
                        if (e.getName().equals("data.json")) {
                            sawData = true;
                            out = new File(getFilesDir(), "restore.json");
                        }
                        out.getParentFile().mkdirs();
                        try (FileOutputStream fo = new FileOutputStream(out)) {
                            copy(zip, fo);
                        }
                    }
                    String restored = sawData
                            ? new String(readAll(new FileInputStream(new File(getFilesDir(), "restore.json"))), StandardCharsets.UTF_8)
                            : "null";
                    new File(getFilesDir(), "restore.json").delete();
                    js("window.onBackupRestored(" + JSONObject.quote(restored) + ")");
                } catch (Exception ex) {
                    js("window.onNativeError(" + JSONObject.quote("Sicherung konnte nicht gelesen werden.") + ")");
                }
            });
        }
    }

    private static void addToZip(ZipOutputStream zip, File f, String name) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        try (FileInputStream in = new FileInputStream(f)) {
            copy(in, zip);
        }
        zip.closeEntry();
    }

    // ---------- JavaScript bridge ----------

    private class Bridge {

        @JavascriptInterface
        public void ready() {
            main.post(() -> {
                jsReady = true;
                List<Intent> list = new ArrayList<>(pendingIntents);
                pendingIntents.clear();
                for (Intent i : list) handleIntent(i);
            });
        }

        @JavascriptInterface
        public String loadData() {
            try {
                if (!dataFile().exists()) return "";
                return new String(readAll(new FileInputStream(dataFile())), StandardCharsets.UTF_8);
            } catch (IOException e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean saveData(String json) {
            try {
                File tmp = new File(getFilesDir(), "data.json.tmp");
                try (FileOutputStream out = new FileOutputStream(tmp)) {
                    out.write(json.getBytes(StandardCharsets.UTF_8));
                    out.getFD().sync();
                }
                return tmp.renameTo(dataFile());
            } catch (IOException e) {
                return false;
            }
        }

        @JavascriptInterface
        public String getSecret(String key) {
            return secret().getString(key, "");
        }

        @JavascriptInterface
        public void setSecret(String key, String value) {
            secret().edit().putString(key, value).apply();
        }

        @JavascriptInterface
        public void pickPdfs() {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("application/pdf");
            i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            main.post(() -> startActivityForResult(i, REQ_PICK_PDF));
        }

        @JavascriptInterface
        public void deleteLetterFiles(String id) {
            if (id == null || id.isEmpty() || id.contains("/") || id.contains(".")) return;
            io.execute(() -> deleteRec(new File(lettersDir(), id)));
        }

        @JavascriptInterface
        public String readClipboard() {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                if (cm == null || !cm.hasPrimaryClip()) return "";
                ClipData c = cm.getPrimaryClip();
                if (c == null || c.getItemCount() == 0) return "";
                CharSequence t = c.getItemAt(0).coerceToText(MainActivity.this);
                return t == null ? "" : t.toString();
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void openExternal(String url) {
            if (url == null || !url.startsWith("https://")) return;
            main.post(() -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public void exportBackup(String fileName) {
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("application/zip");
            i.putExtra(Intent.EXTRA_TITLE, fileName);
            main.post(() -> startActivityForResult(i, REQ_EXPORT));
        }

        @JavascriptInterface
        public void importBackup() {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/zip", "application/x-zip-compressed", "application/octet-stream"});
            main.post(() -> startActivityForResult(i, REQ_IMPORT));
        }

        /**
         * Sends a request to the Claude API. If letterId is set, the rendered pages of that
         * letter are inserted as images at the start of the first user message.
         */
        @JavascriptInterface
        public void callClaude(String bodyJson, String letterId, String callbackId) {
            net.execute(() -> {
                try {
                    JSONObject body = new JSONObject(bodyJson);
                    if (letterId != null && !letterId.isEmpty()) {
                        JSONArray msgs = body.getJSONArray("messages");
                        JSONObject first = msgs.getJSONObject(0);
                        JSONArray content = first.getJSONArray("content");
                        JSONArray withImages = new JSONArray();
                        File dir = new File(lettersDir(), letterId);
                        for (int p = 1; ; p++) {
                            File img = new File(dir, "p" + p + ".jpg");
                            if (!img.exists()) break;
                            JSONObject label = new JSONObject();
                            label.put("type", "text");
                            label.put("text", "Seite " + p + ":");
                            withImages.put(label);
                            JSONObject src = new JSONObject();
                            src.put("type", "base64");
                            src.put("media_type", "image/jpeg");
                            src.put("data", Base64.encodeToString(readAll(new FileInputStream(img)), Base64.NO_WRAP));
                            JSONObject block = new JSONObject();
                            block.put("type", "image");
                            block.put("source", src);
                            withImages.put(block);
                        }
                        for (int i = 0; i < content.length(); i++) withImages.put(content.get(i));
                        first.put("content", withImages);
                    }
                    byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
                    HttpURLConnection c = (HttpURLConnection) new URL("https://api.anthropic.com/v1/messages").openConnection();
                    c.setRequestMethod("POST");
                    c.setConnectTimeout(30000);
                    c.setReadTimeout(240000);
                    c.setDoOutput(true);
                    c.setRequestProperty("content-type", "application/json");
                    c.setRequestProperty("x-api-key", secret().getString("apiKey", ""));
                    c.setRequestProperty("anthropic-version", "2023-06-01");
                    try (OutputStream os = c.getOutputStream()) {
                        os.write(payload);
                    }
                    int code = c.getResponseCode();
                    InputStream is = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    String resp = is == null ? "" : new String(readAll(is), StandardCharsets.UTF_8);
                    js("window.onClaude(" + JSONObject.quote(callbackId) + "," + code + "," + JSONObject.quote(resp) + ")");
                } catch (Exception e) {
                    String msg = e.getClass().getSimpleName() + ": " + e.getMessage();
                    js("window.onClaude(" + JSONObject.quote(callbackId) + ",0," + JSONObject.quote(msg) + ")");
                }
            });
        }
    }
}
