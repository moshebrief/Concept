#!/usr/bin/env node
// Task Message — prepares the iPhone and Android projects during the cloud build (Codemagic).
// Usage: node native-setup.js web | assets | android | ios
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "capacitor.config.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const APP_ID = cfg.appId;
const VERSION = pkg.version;                       // shown in the stores, e.g. 1.0.0
const BUILD = String(parseInt(process.env.BUILD_NUMBER || process.env.PROJECT_BUILD_NUMBER || "1", 10) + 0);

const log = (...a) => console.log("[native-setup]", ...a);
const read = p => fs.readFileSync(p, "utf8");
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const must = (cond, msg) => { if (!cond) { console.error("[native-setup] ERROR:", msg); process.exit(1); } };

// ---------------------------------------------------------------- web files
function web() {
  const out = path.join(ROOT, "www");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const files = ["index.html", "styles.css", "tones.js", "app.js", "config.js", "supabase.js", "591.supabase.js",
                 "manifest.json", "icon.svg", "icon-192.png", "icon-512.png", "privacy.html", "terms.html"];
  for (const f of files) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(out, f));
    else must(!["index.html", "styles.css", "tones.js", "app.js", "config.js", "supabase.js"].includes(f), `${f} is missing from the repository`);
  }
  const conf = read(path.join(out, "config.js"));
  must(!/YOUR_SUPABASE/.test(conf), "config.js still has the placeholder keys — add your Supabase URL and key first");
  log("web files copied to www/");
}

// ---------------------------------------------------------------- icons & splash (rendered from vector art)
const ICON_GLYPH = `<g transform="translate(256 256) scale(.92) translate(-256 -256)"><path d="M146 92h176a66 66 0 0 1 66 66v94a66 66 0 0 1-66 66H214l-62 52a10 10 0 0 1-16-8v-46a66 66 0 0 1-56-65v-93a66 66 0 0 1 66-66z" fill="#fff"/><path d="M152 176h150M152 234h96" stroke="#2F7BFF" stroke-width="26" stroke-linecap="round" fill="none"/><circle cx="364" cy="364" r="98" fill="#34C759" stroke="#0E5FE8" stroke-width="20"/><path d="M318 364l32 32 62-66" stroke="#fff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>`;
const svgIcon = (bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3D8BFF"/><stop offset="1" stop-color="#0A55E0"/></linearGradient></defs>${bg ? `<rect width="512" height="512" fill="url(#g)"/>` : ""}${ICON_GLYPH}</svg>`;
const svgForeground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(96 96) scale(.625)">${ICON_GLYPH.replace(/#0E5FE8/g,"none")}</g></svg>`;
const svgBackground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3D8BFF"/><stop offset="1" stop-color="#0A55E0"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/></svg>`;
const svgSplash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="#007AFF"/><g transform="translate(1366 1366) scale(1.5) translate(-256 -256)">${ICON_GLYPH.replace(/#0E5FE8/g,"#007AFF")}</g></svg>`;
async function assets() {
  const sharp = require("sharp");
  const dir = path.join(ROOT, "assets");
  fs.mkdirSync(dir, { recursive: true });
  const png = (svg, size, file) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toFile(path.join(dir, file));
  await png(svgIcon(true), 1024, "icon-only.png");
  await png(svgForeground, 1024, "icon-foreground.png");
  await png(svgBackground, 1024, "icon-background.png");
  await png(svgSplash, 2732, "splash.png");
  await png(svgSplash, 2732, "splash-dark.png");
  log("icon and splash images created in assets/");
}

// ---------------------------------------------------------------- Android
function android() {
  const app = path.join(ROOT, "android", "app");
  must(fs.existsSync(app), "android/ folder not found — run `npx cap add android` first");

  // Firebase (notifications)
  const gs = path.join(ROOT, "google-services.json");
  if (fs.existsSync(gs)) { fs.copyFileSync(gs, path.join(app, "google-services.json")); log("google-services.json added"); }
  else log("WARNING: google-services.json not found — notifications will not work on Android");

  // Version + signing (Codemagic provides the keystore through environment variables)
  const gradleP = path.join(app, "build.gradle");
  let g = read(gradleP);
  g = g.replace(/versionCode \d+/, `versionCode ${BUILD}`).replace(/versionName "[^"]*"/, `versionName "${VERSION}"`);
  if (!g.includes("signingConfigs {")) {
    g = g.replace(/\n    buildTypes \{/, `
    signingConfigs {
        release {
            if (System.getenv("CM_KEYSTORE_PATH")) {
                storeFile file(System.getenv("CM_KEYSTORE_PATH"))
                storePassword System.getenv("CM_KEYSTORE_PASSWORD")
                keyAlias System.getenv("CM_KEY_ALIAS")
                keyPassword System.getenv("CM_KEY_PASSWORD")
            }
        }
    }
    buildTypes {`);
    g = g.replace(/release \{\n(\s+)minifyEnabled false/, `release {\n$1if (System.getenv("CM_KEYSTORE_PATH")) { signingConfig signingConfigs.release }\n$1minifyEnabled false`);
  }
  must(g.includes("signingConfig signingConfigs.release"), "could not add signing to build.gradle");
  write(gradleP, g);

  // Permissions, portrait, notification icon
  const manP = path.join(app, "src", "main", "AndroidManifest.xml");
  let man = read(manP);
  const perms = ["INTERNET", "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS", "CAMERA", "READ_CONTACTS",
                 "ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "POST_NOTIFICATIONS", "VIBRATE"];
  for (const p of perms) if (!man.includes(`android.permission.${p}"`)) man = man.replace("</manifest>", `    <uses-permission android:name="android.permission.${p}" />\n</manifest>`);
  // Asking for camera, microphone and location makes Google Play quietly hide the app from phones
  // missing any of that hardware (for example a camera without autofocus). Mark all of it optional.
  const optional = ["android.hardware.camera", "android.hardware.camera.any", "android.hardware.camera.autofocus",
    "android.hardware.camera.front", "android.hardware.camera.flash", "android.hardware.microphone",
    "android.hardware.location", "android.hardware.location.gps", "android.hardware.location.network",
    "android.hardware.telephony", "android.hardware.wifi", "android.hardware.screen.portrait"];
  for (const f of optional) if (!man.includes(`"${f}"`)) man = man.replace("</manifest>", `    <uses-feature android:name="${f}" android:required="false" />\n</manifest>`);
  if (!man.includes('android:screenOrientation')) man = man.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="portrait"\n            android:windowSoftInputMode="adjustResize"');
  if (!man.includes("default_notification_icon")) man = man.replace("</application>", `    <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_notify" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/notify_color" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="messages" />
    </application>`);
  write(manP, man);
  write(path.join(app, "src", "main", "res", "drawable", "ic_stat_notify.xml"),
`<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FFFFFFFF" android:pathData="M4,5h16a1,1 0,0 1,1 1v10a1,1 0,0 1,-1 1h-8l-4.5,3.5v-3.5H4a1,1 0,0 1,-1 -1V6a1,1 0,0 1,1 -1z"/>
</vector>
`);
  write(path.join(app, "src", "main", "res", "values", "notify_color.xml"),
`<?xml version="1.0" encoding="utf-8"?>
<resources><color name="notify_color">#007AFF</color></resources>
`);
  // Notification tones
  const { TONES, wav } = require("./tones.js");
  for (const t of TONES) write2(path.join(app, "src", "main", "res", "raw", `tone_${t.id}.wav`), wav(t));
  log(`${TONES.length} notification tones added`);
  log(`Android ready — ${APP_ID} version ${VERSION} (${BUILD})`);
}

// ---------------------------------------------------------------- iOS
function pbxId(seed) { // 24 hex chars, stable per seed
  let h = 0n; for (const c of seed) h = (h * 131n + BigInt(c.charCodeAt(0))) % (1n << 96n);
  return h.toString(16).toUpperCase().padStart(24, "0").slice(-24);
}
const write2 = (p, bytes) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, bytes); };
function addResource(pbx, name, type) {
  const fileRef = pbxId(name + "-fileref"), buildFile = pbxId(name + "-buildfile");
  pbx = pbx.replace("/* Begin PBXBuildFile section */", `/* Begin PBXBuildFile section */\n\t\t${buildFile} /* ${name} in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRef} /* ${name} */; };`);
  pbx = pbx.replace("/* Begin PBXFileReference section */", `/* Begin PBXFileReference section */\n\t\t${fileRef} /* ${name} */ = {isa = PBXFileReference; lastKnownFileType = ${type}; path = "${name}"; sourceTree = "<group>"; };`);
  const cfgRef = /(\w{24}) \/\* config\.xml \*\/,/.exec(pbx);
  must(cfgRef, "could not find config.xml in the Xcode project");
  pbx = pbx.replace(cfgRef[0], `${cfgRef[0]}\n\t\t\t\t${fileRef} /* ${name} */,`);
  const cfgBuild = /(\w{24}) \/\* config\.xml in Resources \*\/,/.exec(pbx);
  must(cfgBuild, "could not find the Resources build phase");
  return pbx.replace(cfgBuild[0], `${cfgBuild[0]}\n\t\t\t\t${buildFile} /* ${name} in Resources */,`);
}
function ios() {
  const dir = path.join(ROOT, "ios", "App");
  must(fs.existsSync(dir), "ios/ folder not found — run `npx cap add ios` first");
  const pbxP = path.join(dir, "App.xcodeproj", "project.pbxproj");
  let pbx = read(pbxP);

  // Version, iPhone only, entitlements
  pbx = pbx.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${BUILD};`)
           .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${VERSION};`)
           .replace(/TARGETED_DEVICE_FAMILY = "[^"]*";/g, `TARGETED_DEVICE_FAMILY = 1;`)
           .replace(/TARGETED_DEVICE_FAMILY = [0-9,]+;/g, `TARGETED_DEVICE_FAMILY = 1;`);
  if (!pbx.includes("CODE_SIGN_ENTITLEMENTS")) pbx = pbx.replace(/INFOPLIST_FILE = App\/Info\.plist;/g, "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n\t\t\t\tINFOPLIST_FILE = App/Info.plist;");
  write(path.join(dir, "App", "App.entitlements"),
`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>aps-environment</key>
	<string>production</string>
</dict>
</plist>
`);

  // Firebase config file must be inside the app bundle
  const gsi = path.join(ROOT, "GoogleService-Info.plist");
  if (fs.existsSync(gsi)) {
    fs.copyFileSync(gsi, path.join(dir, "App", "GoogleService-Info.plist"));
    if (!pbx.includes("GoogleService-Info.plist")) {
      const fileRef = pbxId("gsi-fileref"), buildFile = pbxId("gsi-buildfile");
      pbx = pbx.replace("/* Begin PBXBuildFile section */", `/* Begin PBXBuildFile section */\n\t\t${buildFile} /* GoogleService-Info.plist in Resources */ = {isa = PBXBuildFile; fileRef = ${fileRef} /* GoogleService-Info.plist */; };`);
      pbx = pbx.replace("/* Begin PBXFileReference section */", `/* Begin PBXFileReference section */\n\t\t${fileRef} /* GoogleService-Info.plist */ = {isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = "GoogleService-Info.plist"; sourceTree = "<group>"; };`);
      const cfgRef = /(\w{24}) \/\* config\.xml \*\/,/.exec(pbx);
      must(cfgRef, "could not find config.xml in the Xcode project");
      pbx = pbx.replace(cfgRef[0], `${cfgRef[0]}\n\t\t\t\t${fileRef} /* GoogleService-Info.plist */,`);
      const cfgBuild = /(\w{24}) \/\* config\.xml in Resources \*\/,/.exec(pbx);
      must(cfgBuild, "could not find the Resources build phase");
      pbx = pbx.replace(cfgBuild[0], `${cfgBuild[0]}\n\t\t\t\t${buildFile} /* GoogleService-Info.plist in Resources */,`);
    }
    log("GoogleService-Info.plist added");
  } else log("WARNING: GoogleService-Info.plist not found — notifications will not work on iPhone");
  // Notification tones must be inside the app bundle
  const { TONES, wav } = require("./tones.js");
  for (const t of TONES) {
    const name = `tone_${t.id}.wav`;
    write2(path.join(dir, "App", name), wav(t));
    if (!pbx.includes(`/* ${name} */`)) pbx = addResource(pbx, name, "audio.wav");
  }
  log(`${TONES.length} notification tones added`);
  write(pbxP, pbx);

  // Info.plist: permission texts, background push, portrait
  const plP = path.join(dir, "App", "Info.plist");
  let pl = read(plP);
  const add = (k, v) => { if (!pl.includes(`<key>${k}</key>`)) pl = pl.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${k}</key>\n\t${v}\n</dict>\n</plist>\n`); };
  add("NSCameraUsageDescription", "<string>Task Message uses the camera so you can take photos and videos to send in chats.</string>");
  add("NSMicrophoneUsageDescription", "<string>Task Message uses the microphone so you can record voice notes.</string>");
  add("NSPhotoLibraryUsageDescription", "<string>Task Message lets you choose photos and videos to send in chats.</string>");
  add("NSPhotoLibraryAddUsageDescription", "<string>Task Message can save photos and videos you receive.</string>");
  add("NSContactsUsageDescription", "<string>Task Message checks your contacts to show which of your friends use Task Message. Your address book is not uploaded.</string>");
  add("NSLocationWhenInUseUsageDescription", "<string>Task Message uses your location only when you choose to share it in a chat.</string>");
  add("UIBackgroundModes", "<array>\n\t\t<string>remote-notification</string>\n\t</array>");
  add("UIRequiresFullScreen", "<true/>");
  add("ITSAppUsesNonExemptEncryption", "<false/>"); // only the encryption built into iOS is used
  add("UIFileSharingEnabled", "<true/>");              // backups show in Files → On My iPhone → Task Message
  add("LSSupportsOpeningDocumentsInPlace", "<true/>");
  pl = pl.replace(/(<key>UISupportedInterfaceOrientations<\/key>\s*<array>)[\s\S]*?(<\/array>)/, "$1\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t$2");
  write(plP, pl);

  // AppDelegate: hand the push token to the notifications plugin
  const adP = path.join(dir, "App", "AppDelegate.swift");
  let ad = read(adP);
  if (!ad.includes("capacitorDidRegisterForRemoteNotifications")) {
    const hooks = `
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable: Any], fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        NotificationCenter.default.post(name: Notification.Name.init("didReceiveRemoteNotification"), object: completionHandler, userInfo: userInfo)
    }
`;
    const i = ad.lastIndexOf("}");
    ad = ad.slice(0, i) + hooks + ad.slice(i);
    write(adP, ad);
  }
  // The window behind the app shows around the keyboard's rounded top while it slides in.
  // It's black by default; make it the app's own colour (white, or dark grey in dark mode).
  ad = read(adP);
  if (!ad.includes("TM_WINDOW_BG")) {
    const bg = `
        // TM_WINDOW_BG
        let tmBg = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.11, green: 0.11, blue: 0.118, alpha: 1) : UIColor.white }
        window?.backgroundColor = tmBg
        window?.rootViewController?.view.backgroundColor = tmBg
`;
    ad = ad.replace(/(didFinishLaunchingWithOptions[^{]*\{)/, `$1${bg}`);
    if (!ad.includes("applicationDidBecomeActive(_ application: UIApplication) {\n        // TM_BG2")) {
      ad = ad.replace(/(func applicationDidBecomeActive\(_ application: UIApplication\) \{)/, `$1\n        // TM_BG2\n        window?.backgroundColor = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0.11, green: 0.11, blue: 0.118, alpha: 1) : UIColor.white }`);
    }
    write(adP, ad);
  }
  log(`iOS ready — ${APP_ID} version ${VERSION} (${BUILD})`);
}

const cmd = process.argv[2];
const run = { web, assets, android, ios }[cmd];
if (!run) { console.error("Usage: node native-setup.js web | assets | android | ios"); process.exit(1); }
Promise.resolve(run()).catch(e => { console.error(e); process.exit(1); });
