#!/usr/bin/env node
/*
 * Panda Games Studio – Android hazırlık betiği ("npm run cap-patch") – Panda Su Yolu
 * `npx cap add android` komutundan SONRA, `npx cap sync android` komutundan ÖNCE çalıştırın.
 *
 * Yaptıkları:
 *  1. AndroidManifest.xml  → oyun yalnızca YATAY açılır (sensorLandscape), ekran döndürmede yeniden başlamaz
 *  2. styles.xml           → başlık çubuğu yok, tam ekran tema
 *  3. MainActivity.java    → sürükleyici tam ekran (durum + gezinme çubuğu gizli), çentik alanı kullanılır, ekran kararmaz
 *  4. strings.xml          → telefonda görünen uygulama adı: "Panda Su Yolu"
 *  5. app/build.gradle     → versionName (package.json) ve versionCode (GitHub çalıştırma numarası)
 *
 * Betik tekrar tekrar çalıştırılabilir (idempotent).
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ANDROID = path.join(ROOT, "android");
const APP_LABEL = "Panda Su Yolu";
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "capacitor.config.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const APP_ID = cfg.appId;

function fail(msg) { console.error("✖ " + msg); process.exit(1); }
function ok(msg) { console.log("✔ " + msg); }
function read(p) { if (!fs.existsSync(p)) fail("Bulunamadı: " + path.relative(ROOT, p) + "  (önce: npx cap add android)"); return fs.readFileSync(p, "utf8"); }
function write(p, s) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, "utf8"); }
const xmlEsc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "\\'").replace(/"/g, '\\"');

if (!fs.existsSync(ANDROID)) fail("android/ klasörü yok. Önce `npx cap add android` çalıştırın.");
const MAIN = path.join(ANDROID, "app", "src", "main");

/* ---------- 1. AndroidManifest.xml ---------- */
{
  const p = path.join(MAIN, "AndroidManifest.xml");
  let s = read(p);
  const re = /<activity\b[^>]*android:name="[^"]*MainActivity"[^>]*>/s;
  const m = s.match(re);
  if (!m) fail("AndroidManifest.xml içinde MainActivity bulunamadı.");
  let tag = m[0]
    .replace(/\s+android:screenOrientation="[^"]*"/g, "")
    .replace(/\s+android:configChanges="[^"]*"/g, "")
    .replace(/\s+android:resizeableActivity="[^"]*"/g, "");
  tag = tag.replace(/<activity\b/, '<activity\n            android:screenOrientation="sensorLandscape"' +
    '\n            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"');
  s = s.replace(re, tag);
  if (!/android:hardwareAccelerated=/.test(s)) s = s.replace(/<application\b/, '<application\n        android:hardwareAccelerated="true"');
  write(p, s);
  ok("AndroidManifest.xml → yatay ekran (sensorLandscape)");
}

/* ---------- 2. styles.xml ---------- */
{
  const p = path.join(MAIN, "res", "values", "styles.xml");
  let s = read(p);
  const items = {
    "windowActionBar": "false",
    "windowNoTitle": "true",
    "android:windowFullscreen": "true",
    "android:windowContentOverlay": "@null"
  };
  s = s.replace(/(<style\s+name="AppTheme\.NoActionBar(Launch)?"[^>]*>)([\s\S]*?)(<\/style>)/g, (all, open, launch, body, close) => {
    // Açılış (splash) teması AppCompat değildir; ona yalnızca android: öznitelikleri eklenir
    const list = Object.entries(items).filter(([k]) => !launch || k.startsWith("android:"));
    for (const [k, v] of list) {
      const r = new RegExp('<item\\s+name="' + k.replace(".", "\\.") + '">[^<]*</item>\\s*', "g");
      body = body.replace(r, "");
      body = body.replace(/\s*$/, "") + `\n        <item name="${k}">${v}</item>`;
    }
    return open + body + "\n    " + close;
  });
  write(p, s);
  ok("styles.xml → başlıksız tam ekran tema");
}

/* ---------- 3. MainActivity.java ---------- */
{
  const dir = path.join(MAIN, "java", ...APP_ID.split("."));
  const p = path.join(dir, "MainActivity.java");
  // Kotlin dosyası varsa kaldır (Capacitor varsayılanı Java'dır)
  const kt = path.join(dir, "MainActivity.kt"); if (fs.existsSync(kt)) fs.unlinkSync(kt);
  write(p, `package ${APP_ID};

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/** Panda Games Studio – tam ekran (immersive) ve yatay oyun etkinliği. */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemBars();
    }

    @Override
    public void onResume() {
        super.onResume();
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
`);
  ok("MainActivity.java → sürükleyici tam ekran");
}

/* ---------- 4. strings.xml ---------- */
{
  const p = path.join(MAIN, "res", "values", "strings.xml");
  let s = read(p);
  const label = xmlEsc(APP_LABEL);
  s = s.replace(/(<string\s+name="app_name">)[^<]*(<\/string>)/, `$1${label}$2`)
       .replace(/(<string\s+name="title_activity_main">)[^<]*(<\/string>)/, `$1${label}$2`);
  write(p, s);
  ok(`strings.xml → uygulama adı "${APP_LABEL}"`);
}

/* ---------- 5. app/build.gradle (sürüm) ---------- */
{
  const p = path.join(ANDROID, "app", "build.gradle");
  let s = read(p);
  const versionName = pkg.version || "1.0.0";
  const versionCode = parseInt(process.env.VERSION_CODE || process.env.GITHUB_RUN_NUMBER || "1", 10);
  s = s.replace(/versionCode\s+\d+/, "versionCode " + versionCode)
       .replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);
  write(p, s);
  ok(`build.gradle → versionName ${versionName}, versionCode ${versionCode}`);
}

console.log("\nAndroid projesi hazır: " + APP_ID + "  (sıradaki adım: npx cap sync android)");
