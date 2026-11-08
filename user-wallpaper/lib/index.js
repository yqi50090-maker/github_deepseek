// user-wallpaper — Host 半区
//
// 接口：
//   GET  /api/user-wallpaper/image        → 当前壁纸图片（wallpaper.jpg，自动识别格式）
//   GET  /api/user-wallpaper/config       → 壁纸配置
//   GET  /api/user-wallpaper/list         → 预设壁纸列表（含当前、视频标记）
//   GET  /api/user-wallpaper/preset/<id>  → 某张预设壁纸原图
//   GET  /api/user-wallpaper/video/<id>   → 某张预设的视频流（HTTP Range，动态背景用）
//   POST /api/user-wallpaper/apply        → body { id } 应用某张预设
//   POST /api/user-wallpaper/upload       → body { dataBase64 } 上传自定义图片当壁纸
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { syncWallpapers } from "./import.js";

const PLUGIN_NAME = "user-wallpaper";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const IMG = path.join(ROOT, "wallpaper.jpg");
const PRESETS_DIR = path.join(ROOT, "presets");
const MANIFEST = path.join(PRESETS_DIR, "manifest.json");
const VIDEOS = path.join(PRESETS_DIR, "videos.json");
const WEBS = path.join(PRESETS_DIR, "web.json");
const MIRROR = "D:\\LenovoQMDownload\\deepseek_缓冲\\user-wallpaper\\wallpaper.jpg"; // 镜像到缓冲目录（非 test 工作区）
const WS_ROOT = "C:/Program Files (x86)/Steam/steamapps/workshop/content/431960";

/** web 壁纸静态托管的 MIME 表。 */
const WEB_MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".wasm": "application/wasm",
  ".map": "application/json",
};

/** 注入到 web 壁纸 index.html 的 WE 兼容垫片（把 WE 专属 JS 接口变成空函数，壁纸按默认参数运行）。
 *  同时强制静音：HTML5 媒体元素一律 muted+volume=0，Web Audio 上下文创建即挂起——壁纸不出声。 */
const WEB_SHIM =
  "<script>(function(){function n(){}var w=window;w.wallpaperPropertyDefinition=n;w.wallpaperRegisterListener=n;w.wallpaperRegisterAudioListener=n;w.wallpaperRegisterAudioVolumeListener=n;w.wallpaperRegisterMouseEvents=n;w.wallpaperRegisterTimelineEvents=n;w.wallpaperRequestRandomFileForProperty=n;w.wallpaperRegisterPropertiesChangeListener=n;w.wallpaperAddTimelineEvent=n;w.wallpaperSetInterval=n;w.wallpaperClearInterval=n;w.wallpaperSetTimeout=n;w.wallpaperClearTimeout=n;w.wallpaperRequestLog=n;w.wallpaperPictureThis=n;w.wallpaperSendMessage=n;w.wallpaperGetPropertyValue=function(){return undefined};w.wallpaperSystemGetVersion=function(){return '0'};})();" +
  "(function(){try{var op=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){this.muted=true;this.volume=0;return op.apply(this,arguments)};document.addEventListener('play',function(e){var m=e.target;if(m&&m.muted!==undefined){m.muted=true;m.volume=0}},true);var AC=window.AudioContext||window.webkitAudioContext;if(AC){var Real=AC;var Patched=function(){var ctx=new Real();try{if(ctx.suspend)ctx.suspend()}catch(e){}return ctx};Patched.prototype=Real.prototype;window.AudioContext=Patched;if(window.webkitAudioContext)window.webkitAudioContext=Patched}}catch(e){}})();</script>";

const MAX_UPLOAD = 30 * 1024 * 1024; // 上传上限 30MB（含 base64 膨胀）
const ID_RE = /^[a-zA-Z0-9_-]+$/;
const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"]);

function sha1(buf) {
  return crypto.createHash("sha1").update(buf).digest("hex");
}

function json(res, code, obj) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit, onOk, onErr) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
    if (body.length > limit) {
      onErr(413, "请求体过大");
      req.destroy();
    }
  });
  req.on("end", () => onOk(body));
  req.on("error", () => onErr(400, "请求读取失败"));
}

/** 视频清单：id → { name, file }（由 import.js 生成）。 */
function videoMap() {
  try {
    return JSON.parse(fs.readFileSync(VIDEOS, "utf8"));
  } catch {
    return {};
  }
}

/** web 壁纸清单：id → { name }（由 import.js 生成）。 */
function webMap() {
  try {
    return JSON.parse(fs.readFileSync(WEBS, "utf8"));
  } catch {
    return {};
  }
}

/** 扫描 presets 目录 + manifest 名称 + 视频/网页标记，返回预设列表。 */
function presetList() {
  let names = {};
  try {
    names = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  } catch {
    /* 无 manifest 也能列出 */
  }
  const vids = videoMap();
  const webs = webMap();
  const out = [];
  try {
    for (const f of fs.readdirSync(PRESETS_DIR)) {
      if (!/\.jpg$/i.test(f)) continue;
      const id = f.slice(0, -4);
      const hasVideo = !!vids[id];
      const isWeb = !!webs[id];
      out.push({
        id,
        name: names[id] || id,
        url: `/api/user-wallpaper/preset/${id}`,
        video: hasVideo,
        videoUrl: hasVideo ? `/api/user-wallpaper/video/${id}` : null,
        web: isWeb,
        webUrl: isWeb ? `/api/user-wallpaper/web/${id}/index.html` : null,
      });
    }
  } catch {
    /* 目录不存在时返回空列表 */
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/** 通过 SHA1 比对判断当前壁纸是哪张预设（自定义图则返回 "custom"）。 */
function currentPresetId() {
  let cur;
  try {
    cur = fs.readFileSync(IMG);
  } catch {
    return "custom";
  }
  const h = sha1(cur);
  for (const p of presetList()) {
    try {
      if (sha1(fs.readFileSync(path.join(PRESETS_DIR, p.id + ".jpg"))) === h) return p.id;
    } catch {
      /* 文件缺失跳过 */
    }
  }
  return "custom";
}

function writeWallpaper(buf) {
  fs.writeFileSync(IMG, buf);
  try {
    fs.writeFileSync(MIRROR, buf);
  } catch {
    /* 镜像目录不存在时忽略 */
  }
}

/** 按文件头识别图片真实格式（wallpaper.jpg 只是固定文件名，内容可能是 PNG/WebP 等）。 */
function sniffImageType(buf) {
  let type = "image/jpeg";
  if (buf.length > 12) {
    if (buf[0] === 0x89 && buf[1] === 0x50) type = "image/png";
    else if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45) type = "image/webp";
    else if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) type = "image/gif";
  }
  return type;
}

function sendImage(res, file, fallback404 = "not found") {
  try {
    const buf = fs.readFileSync(file);
    res.writeHead(200, {
      "content-type": sniffImageType(buf),
      "cache-control": "public, max-age=86400",
      "content-length": buf.length,
    });
    res.end(buf);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(fallback404);
  }
}

const plugin = {
  name: PLUGIN_NAME,
  inject: ["webServer"],
  apply(ctx) {
    let syncing = false;
    ctx.effect(() => {
      const dis = [];

      dis.push(
        ctx.webServer.register({
          kind: "exact",
          path: "/api/user-wallpaper/image",
          handler: (req, res) => sendImage(res, IMG, "wallpaper not found"),
        })
      );

      dis.push(
        ctx.webServer.register({
          kind: "exact",
          path: "/api/user-wallpaper/config",
          handler: (req, res) => {
            json(res, 200, {
              ok: true,
              enabled: true,
              current: currentPresetId(),
              image: "/api/user-wallpaper/image",
            });
          },
        })
      );

      dis.push(
        ctx.webServer.register({
          kind: "exact",
          path: "/api/user-wallpaper/list",
          handler: (req, res) => {
            json(res, 200, { ok: true, current: currentPresetId(), presets: presetList() });
          },
        })
      );

      dis.push(
        ctx.webServer.register({
          kind: "prefix",
          path: "/api/user-wallpaper/preset",
          handler: (req, res) => {
            const pathname = new URL(req.url ?? "/", "http://x").pathname;
            const id = pathname.slice("/api/user-wallpaper/preset".length).replace(/^\//, "");
            if (!ID_RE.test(id)) {
              json(res, 400, { ok: false, error: "非法预设 ID" });
              return;
            }
            sendImage(res, path.join(PRESETS_DIR, `${id}.jpg`), "preset not found");
          },
        })
      );

      dis.push(
        ctx.webServer.register({
          kind: "prefix",
          path: "/api/user-wallpaper/video",
          handler: (req, res) => {
            const pathname = new URL(req.url ?? "/", "http://x").pathname;
            const id = pathname.slice("/api/user-wallpaper/video".length).replace(/^\//, "");
            if (!ID_RE.test(id)) {
              json(res, 400, { ok: false, error: "非法 ID" });
              return;
            }
            const rec = videoMap()[id];
            if (!rec || !rec.file || !fs.existsSync(rec.file)) {
              json(res, 404, { ok: false, error: "视频不存在" });
              return;
            }
            const file = rec.file;
            const stat = fs.statSync(file);
            const size = stat.size;
            const type = /\.webm$/i.test(file) ? "video/webm" : "video/mp4";
            const range = req.headers.range;
            if (range) {
              const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
              let start = 0;
              let end = size - 1;
              if (m) {
                if (m[1] !== "") start = parseInt(m[1], 10);
                if (m[2] !== "") end = parseInt(m[2], 10);
              }
              if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
                res.writeHead(416, { "content-range": `bytes */${size}` });
                res.end();
                return;
              }
              end = Math.min(end, size - 1);
              res.writeHead(206, {
                "content-type": type,
                "content-range": `bytes ${start}-${end}/${size}`,
                "content-length": end - start + 1,
                "accept-ranges": "bytes",
                "cache-control": "public, max-age=86400",
              });
              fs.createReadStream(file, { start, end }).pipe(res);
            } else {
              res.writeHead(200, {
                "content-type": type,
                "content-length": size,
                "accept-ranges": "bytes",
                "cache-control": "public, max-age=86400",
              });
              fs.createReadStream(file).pipe(res);
            }
          },
        })
      );

      dis.push(
        ctx.webServer.register({
          kind: "prefix",
          path: "/api/user-wallpaper/web",
          handler: (req, res) => {
            const pathname = new URL(req.url ?? "/", "http://x").pathname;
            const rest = pathname.slice("/api/user-wallpaper/web".length).replace(/^\//, "");
            const slash = rest.indexOf("/");
            const id = slash === -1 ? rest : rest.slice(0, slash);
            const sub = slash === -1 ? "" : rest.slice(slash + 1);
            if (!ID_RE.test(id)) {
              json(res, 400, { ok: false, error: "非法 ID" });
              return;
            }
            const folder = path.join(WS_ROOT, id);
            if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
              json(res, 404, { ok: false, error: "web 壁纸不存在" });
              return;
            }
            const rel = sub === "" ? "index.html" : sub;
            const file = path.resolve(folder, rel);
            const base = path.resolve(folder);
            if (file !== base && !file.startsWith(base + path.sep)) {
              res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
              res.end("forbidden");
              return;
            }
            if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
              json(res, 404, { ok: false, error: "文件不存在" });
              return;
            }
            const ext = path.extname(file).toLowerCase();
            let type = WEB_MIME[ext] || "application/octet-stream";
            let data = fs.readFileSync(file);
            if (ext === ".html" && path.basename(file).toLowerCase() === "index.html") {
              let html = data.toString("utf8");
              if (html.indexOf("</head>") !== -1) html = html.replace("</head>", WEB_SHIM + "</head>");
              else html = WEB_SHIM + html;
              data = Buffer.from(html, "utf8");
            }
            res.writeHead(200, { "content-type": type, "cache-control": "public, max-age=300" });
            res.end(data);
          },
        })
      );

      dis.push(
        ctx.webServer.register({
          kind: "exact",
          path: "/api/user-wallpaper/refresh",
          handler: async (req, res) => {
            if (syncing) {
              json(res, 200, { ok: true, busy: true });
              return;
            }
            syncing = true;
            try {
              const r = await syncWallpapers((m) => ctx.logger.info(`[${PLUGIN_NAME}] ${m}`));
              json(res, 200, r);
            } catch (err) {
              json(res, 500, { ok: false, error: err && err.message ? err.message : String(err) });
            } finally {
              syncing = false;
            }
          },
        })
      );

      dis.push(
        ctx.webServer.register({
          kind: "exact",
          path: "/api/user-wallpaper/apply",
          handler: (req, res) => {
            readBody(
              req,
              MAX_UPLOAD,
              (body) => {
                let parsed;
                try {
                  parsed = JSON.parse(body || "{}");
                } catch {
                  json(res, 400, { ok: false, error: "JSON 解析失败" });
                  return;
                }
                const id = parsed.id;
                if (typeof id !== "string" || !ID_RE.test(id)) {
                  json(res, 400, { ok: false, error: "缺少合法的 id" });
                  return;
                }
                const file = path.join(PRESETS_DIR, `${id}.jpg`);
                if (!fs.existsSync(file)) {
                  json(res, 404, { ok: false, error: "预设不存在" });
                  return;
                }
                try {
                  writeWallpaper(fs.readFileSync(file));
                  json(res, 200, { ok: true, id, video: !!videoMap()[id] });
                } catch (err) {
                  json(res, 500, { ok: false, error: err && err.message ? err.message : String(err) });
                }
              },
              (code, message) => json(res, code, { ok: false, error: message })
            );
          },
        })
      );

      dis.push(
        ctx.webServer.register({
          kind: "exact",
          path: "/api/user-wallpaper/upload",
          handler: (req, res) => {
            readBody(
              req,
              MAX_UPLOAD,
              (body) => {
                let parsed;
                try {
                  parsed = JSON.parse(body || "{}");
                } catch {
                  json(res, 400, { ok: false, error: "JSON 解析失败" });
                  return;
                }
                const dataBase64 = parsed.dataBase64;
                if (typeof dataBase64 !== "string" || dataBase64.length === 0) {
                  json(res, 400, { ok: false, error: "缺少文件数据" });
                  return;
                }
                const m = dataBase64.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,(.+)$/s);
                if (!m) {
                  json(res, 400, { ok: false, error: "数据格式必须是 data:<mime>;base64,..." });
                  return;
                }
                if (!IMAGE_MIME.has(m[1].toLowerCase())) {
                  json(res, 400, { ok: false, error: `不支持的图片类型: ${m[1]}` });
                  return;
                }
                try {
                  const buf = Buffer.from(m[2], "base64");
                  if (buf.length === 0) {
                    json(res, 400, { ok: false, error: "文件内容为空" });
                    return;
                  }
                  writeWallpaper(buf);
                  json(res, 200, { ok: true });
                } catch (err) {
                  json(res, 500, { ok: false, error: err && err.message ? err.message : String(err) });
                }
              },
              (code, message) => json(res, code, { ok: false, error: message })
            );
          },
        })
      );

      return () => {
        for (const d of dis) d();
      };
    }, `${PLUGIN_NAME}: routes`);

    ctx.logger.info(`[${PLUGIN_NAME}] 壁纸接口就绪：image / config / list / preset / video / apply / upload`);
  },
};

export default plugin;
