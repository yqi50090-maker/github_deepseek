// import.js — 与 Wallpaper Engine 同步
// 扫描 workshop 目录：
//   - video 类型（有 mp4/webm）→ ffmpeg 抽一帧高清预览图，记录视频文件路径
//   - web 类型（HTML 网页壁纸，无视频）→ 用 preview 图当缩略图，记录为 web 壁纸（网页端 iframe 运行）
//   - scene 类型（场景包）→ 排除（网页端只能低清预览图，无法运行）
//   - 已卸载的壁纸（文件夹消失）→ 清理对应预设
// 输出：manifest.json（id→名称）+ videos.json（id→视频路径）+ web.json（id→web 壁纸）
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = path.join(__dirname, "..", "presets");
const MANIFEST = path.join(PRESETS_DIR, "manifest.json");
const VIDEOS = path.join(PRESETS_DIR, "videos.json");
const WEBS = path.join(PRESETS_DIR, "web.json");
const WS_ROOT = "C:/Program Files (x86)/Steam/steamapps/workshop/content/431960";
const FFMPEG = "C:/Program Files/ffmpeg/bin/ffmpeg.exe";

const ffmpeg = (args) =>
  new Promise((resolve) => {
    execFile(FFMPEG, args, { timeout: 90000, windowsHide: true }, () => resolve(true));
  });

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
}

function readTitle(folder) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(folder, "project.json"), "utf8"));
    return String(j.title || "").trim();
  } catch {
    return "";
  }
}

function readType(folder) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(folder, "project.json"), "utf8"));
    return String(j.type || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

export async function syncWallpapers(log = () => {}) {
  fs.mkdirSync(PRESETS_DIR, { recursive: true });
  const oldManifest = readJson(MANIFEST);
  const oldVideos = readJson(VIDEOS);
  const oldWebs = readJson(WEBS);
  const manifest = { ...oldManifest };
  const videos = { ...oldVideos };
  const webMap = { ...oldWebs };

  let dirs;
  try {
    dirs = fs
      .readdirSync(WS_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /^\d+$/.test(d.name));
  } catch {
    return { ok: false, error: "无法读取 Wallpaper Engine 目录" };
  }

  const seen = new Set();
  let added = 0;
  let processed = 0;
  let skippedType = 0;

  for (const d of dirs) {
    const folder = path.join(WS_ROOT, d.name);
    let files = [];
    try {
      files = fs.readdirSync(folder);
    } catch {
      continue;
    }

    // 排除 scene（场景包，网页端无法运行）；web（HTML 网页）保留，用 iframe 直接跑
    const type = readType(folder);
    if (type === "scene") {
      skippedType++;
      continue;
    }
    seen.add(d.name);

    const vids = files.filter((f) => /\.(mp4|webm)$/i.test(f)).map((f) => path.join(folder, f));
    const title = readTitle(folder) || d.name;
    const out = path.join(PRESETS_DIR, d.name + ".jpg");
    const existedBefore = fs.existsSync(out);

    if (vids.length > 0) {
      // 有视频的（包括个别 web 类型带视频，如泉奈）→ 按视频处理，最稳
      vids.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
      const video = vids[0];
      if (!existedBefore) {
        await ffmpeg(["-y", "-ss", "2", "-i", video, "-frames:v", "1", "-q:v", "2", "-vf", "scale='min(1920,iw)':-2", out]);
      }
      if (fs.existsSync(out)) {
        manifest[d.name] = title;
        videos[d.name] = { name: title, file: video };
        delete webMap[d.name];
        processed++;
        if (!existedBefore) added++;
      }
    } else if (type === "web") {
      // 纯 web 壁纸：用 preview 图当缩略图，运行时用 iframe 加载原版 HTML
      const pj = files.find((f) => /^preview\.jpg$/i.test(f));
      const pg = files.find((f) => /^preview\.gif$/i.test(f));
      if (pj && !existedBefore) {
        try {
          fs.copyFileSync(path.join(folder, pj), out);
        } catch { /* ignore */ }
      } else if (pg && !existedBefore) {
        await ffmpeg(["-y", "-i", path.join(folder, pg), "-frames:v", "1", "-q:v", "2", out]);
      }
      if (fs.existsSync(out)) {
        manifest[d.name] = title;
        delete videos[d.name];
        webMap[d.name] = { name: title };
        processed++;
        if (!existedBefore) added++;
      }
    }
    if (processed % 10 === 0) log(`...${processed}`);
  }

  // 清理已卸载的壁纸（目录扫描有足够样本时才清理，防误删）
  let removed = 0;
  if (dirs.length > 20) {
    for (const id of Object.keys(manifest)) {
      if (!seen.has(id)) {
        try {
          fs.rmSync(path.join(PRESETS_DIR, id + ".jpg"), { force: true });
        } catch { /* ignore */ }
        delete manifest[id];
        delete videos[id];
        delete webMap[id];
        removed++;
      }
    }
  }

  writeJson(MANIFEST, manifest);
  writeJson(VIDEOS, videos);
  writeJson(WEBS, webMap);
  return {
    ok: true,
    added,
    removed,
    skippedType,
    total: Object.keys(manifest).length,
    videos: Object.keys(videos).length,
    web: Object.keys(webMap).length,
  };
}
