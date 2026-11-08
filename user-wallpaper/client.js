// user-wallpaper — 浏览器半区（手写 CJS bundle，遵循 dsh 客户端插件契约）
//
// 1) 把 /api/user-wallpaper/image 铺成整个应用背景（body cover + 面板半透明 +
//    全局文字黑边 + 输入框保持原样）。
// 2) 在"设置"页注册"壁纸"版块：预设壁纸缩略图网格（点击即换）+ 上传自定义图。
window.__ModuleLoader__.load({
	id: "user-wallpaper",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		/** 字典命名空间（本插件拥有）。 */
		const NS = "settings.userWallpaper";
		/** apply 阶段需要的服务。 */
		const inject = ["slots", "locale"];

		const CSS = `
body {
  background-image: url("/api/user-wallpaper/image") !important;
  background-size: cover !important;
  background-position: center !important;
  background-attachment: fixed !important;
  background-repeat: no-repeat !important;
}
body,
body[data-ds-dark-theme] {
  --dsw-alias-bg-base: transparent !important;
  --dsw-alias-bg-layer-1: rgba(16, 19, 24, 0.55) !important;
  --dsw-alias-bg-layer-2: rgba(16, 19, 24, 0.66) !important;
  --dsw-alias-bg-layer-3: rgba(20, 24, 31, 0.74) !important;
  --dsw-alias-bg-overlay: rgba(10, 12, 16, 0.6) !important;
  --dsw-alias-bg-mask-2: rgba(0, 0, 0, 0.15) !important;
  --dsw-specific-sidebar-fill: rgba(16, 19, 24, 0.55) !important;
}
/* 全局文字黑边：四向描边 + 柔光，保证壁纸上可读 */
body,
body * {
  text-shadow:
    1px 1px 0 rgba(0, 0, 0, 0.75),
    -1px 1px 0 rgba(0, 0, 0, 0.75),
    1px -1px 0 rgba(0, 0, 0, 0.75),
    -1px -1px 0 rgba(0, 0, 0, 0.75),
    0 0 4px rgba(0, 0, 0, 0.65),
    0 0 10px rgba(0, 0, 0, 0.4) !important;
}
/* 输入对话框保持原样（不加黑边） */
[data-composer-card],
[data-composer-card] * {
  text-shadow: none !important;
}
/* 动态视频背景层（位于所有面板之下、静态背景之上） */
video[data-user-wallpaper-video] {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: -1;
  pointer-events: none;
}
/* 网页壁纸背景层（iframe 跑原版 HTML 动画） */
iframe[data-user-wallpaper-web] {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  border: 0;
  pointer-events: none;
}
`;

		/** 简体中文词典（键源）。 */
		const zh = {
			nav: "壁纸",
			loading: "正在读取壁纸…",
			error: "暂时无法读取壁纸。",
			retry: "重试",
			current: "当前",
			currentLabel: "当前壁纸：{name}",
			dynamic: "动态背景",
			dynamicHint: "开启后，带视频的壁纸以动态播放；页面切到后台自动暂停",
			video: "动态",
			web: "网页",
			presets: "预设壁纸（来自 Wallpaper Engine，点击即换）",
			custom: "自定义图片",
			upload: "上传图片",
			uploading: "上传中…",
			uploadHint: "支持 JPG / PNG / WebP，上传后立即应用",
			applied: "✓ 已应用",
			sync: "与 Wallpaper Engine 同步",
			syncing: "同步中…",
			synced: "✓ 已同步：新增 {added} 张，共 {total} 张",
			syncError: "同步失败，请重试",
			applyError: "应用失败，请重试",
			uploadError: "上传失败，请换一张图片"
		};
		/** 英文词典，键与中文一致。 */
		const en = {
			nav: "Wallpaper",
			loading: "Loading wallpapers…",
			error: "Wallpapers are temporarily unavailable.",
			retry: "Retry",
			current: "Current",
			currentLabel: "Current: {name}",
			dynamic: "Animated background",
			dynamicHint: "When on, wallpapers with video play as motion; pauses when tab hidden",
			video: "Video",
			web: "Web",
			presets: "Presets (from Wallpaper Engine, click to apply)",
			custom: "Custom image",
			upload: "Upload image",
			uploading: "Uploading…",
			uploadHint: "JPG / PNG / WebP; applies immediately",
			applied: "✓ Applied",
			sync: "Sync with Wallpaper Engine",
			syncing: "Syncing…",
			synced: "✓ Synced: {added} new, {total} total",
			syncError: "Sync failed, try again",
			applyError: "Failed to apply, try again",
			uploadError: "Upload failed, try another image"
		};

		/** 内联样式（零构建依赖）。 */
		const styles = {
			section: { width: "100%", maxWidth: "760px", color: "var(--dsw-alias-label-primary)", display: "flex", flexDirection: "column", gap: "12px" },
			status: { margin: "0", color: "var(--dsw-alias-label-tertiary)", fontSize: "13px", lineHeight: "20px" },
			failure: { color: "var(--dsw-alias-state-error-primary)", display: "flex", alignItems: "center", gap: "10px" },
			failureButton: { border: "1px solid var(--dsw-alias-border-l2)", color: "var(--dsw-alias-label-primary)", font: "inherit", cursor: "pointer", background: "transparent", borderRadius: "6px", padding: "4px 10px" },
			grid: { margin: "0", padding: "0", listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "12px" },
			card: { border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-3)", borderRadius: "10px", overflow: "hidden", cursor: "pointer", padding: "0", textAlign: "left", font: "inherit", color: "var(--dsw-alias-label-primary)", display: "flex", flexDirection: "column", width: "100%" },
			thumb: { width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block", background: "var(--dsw-alias-bg-layer-2)" },
			cardBody: { padding: "6px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" },
			cardName: { margin: "0", fontSize: "12px", lineHeight: "18px", flex: "1", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
			currentBadge: { flex: "none", fontSize: "11px", lineHeight: "16px", color: "var(--dsw-alias-state-success-primary)", border: "1px solid var(--dsw-alias-state-success-primary)", borderRadius: "999px", padding: "0 6px" },
			videoBadge: { flex: "none", fontSize: "11px", lineHeight: "16px", color: "#5ab0ff", border: "1px solid #5ab0ff", borderRadius: "999px", padding: "0 6px" },
			webBadge: { flex: "none", fontSize: "11px", lineHeight: "16px", color: "#c58bff", border: "1px solid #c58bff", borderRadius: "999px", padding: "0 6px" },
			switchRow: { display: "flex", alignItems: "center", gap: "10px" },
			switchLabel: { margin: "0", fontSize: "13px", lineHeight: "18px", color: "var(--dsw-alias-label-primary)" },
			switchHint: { margin: "0", fontSize: "12px", lineHeight: "18px", color: "var(--dsw-alias-label-tertiary)" },
			toggle: { flex: "none", width: "42px", height: "24px", borderRadius: "999px", border: "1px solid var(--dsw-alias-border-l2)", padding: "2px", cursor: "pointer", display: "flex", alignItems: "center", transition: "background 0.15s" },
			toggleKnob: { width: "18px", height: "18px", borderRadius: "50%", background: "#fff", display: "block", transition: "transform 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.4)" },
			uploadRow: { display: "flex", alignItems: "center", gap: "10px" },
			uploadButton: { border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-3)", color: "var(--dsw-alias-label-primary)", font: "inherit", fontSize: "13px", lineHeight: "26px", padding: "0 14px", borderRadius: "8px", cursor: "pointer" },
			uploadHint: { margin: "0", fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" },
			notice: { margin: "0", fontSize: "13px", color: "var(--dsw-alias-state-success-primary)" },
			busy: { opacity: "0.55", pointerEvents: "none" }
		};

		/** 设置页"壁纸"版块：动态开关 + 预设网格 + 上传 + 同步。 */
		function WallpaperSection({ load, apply, upload, sync, refreshBackground, setVideoBackground, setWebBackground, t }) {
			const [state, setState] = react.useState({ status: "loading" });
			const [busy, setBusy] = react.useState("");
			const [notice, setNotice] = react.useState("");
			const [request, setRequest] = react.useState(0);
			const [dynamic, setDynamic] = react.useState(() => {
				try {
					return localStorage.getItem("user-wallpaper.dynamic") === "1";
				} catch {
					return false;
				}
			});
			const fileRef = react.useRef(null);

			react.useEffect(() => {
				let current = true;
				Promise.resolve()
					.then(() => load())
					.then(
						(payload) => {
							if (current) setState({ status: "ready", payload });
						},
						() => {
							if (current) setState({ status: "error" });
						}
					);
				return () => {
					current = false;
				};
			}, [load, request]);

			const refresh = () => {
				setNotice("");
				setState({ status: "loading" });
				setRequest((value) => value + 1);
			};

			// 就绪后 / 动态开关变化时，把当前壁纸切到对应的网页 / 视频 / 静态背景
			react.useEffect(() => {
				if (state.status !== "ready") return;
				const cur = (state.payload.presets || []).find((p) => p.id === state.payload.current);
				if (cur && cur.web) {
					setWebBackground(cur.webUrl);
					setVideoBackground(null);
				} else if (cur && cur.video && dynamic) {
					setVideoBackground(cur.videoUrl);
					setWebBackground(null);
				} else {
					setVideoBackground(null);
					setWebBackground(null);
				}
			}, [state.status, dynamic]);

			if (state.status === "loading") {
				return react.createElement("div", { style: styles.section }, react.createElement("p", { style: styles.status }, t("loading")));
			}
			if (state.status === "error") {
				return react.createElement(
					"div",
					{ style: styles.failure },
					react.createElement("p", { role: "alert" }, t("error")),
					react.createElement("button", { type: "button", style: styles.failureButton, onClick: refresh }, t("retry"))
				);
			}

			const payload = state.payload;
			const current = payload.current;
			const presets = payload.presets || [];
			const currentName = current === "custom" ? t("custom") : (presets.find((p) => p.id === current) || {}).name || current;

			const onApply = (id) => {
				if (busy) return;
				setBusy(id);
				setNotice("");
				Promise.resolve()
					.then(() => apply(id))
					.then(
						() => {
							const preset = presets.find((p) => p.id === id);
							if (preset && preset.web) {
								setWebBackground(preset.webUrl);
								setVideoBackground(null);
							} else if (preset && preset.video && dynamic) {
								setVideoBackground(preset.videoUrl);
								setWebBackground(null);
							} else {
								setVideoBackground(null);
								setWebBackground(null);
							}
							refreshBackground();
							refresh();
							setBusy("");
							setNotice(t("applied"));
						},
						() => {
							setBusy("");
							setNotice(t("applyError"));
						}
					);
			};

			const onSync = () => {
				if (busy) return;
				setBusy("sync");
				setNotice("");
				Promise.resolve()
					.then(() => sync())
					.then(
						(result) => {
							refresh();
							setBusy("");
							setNotice(
								t("synced")
									.replace("{added}", String(result.added || 0))
									.replace("{total}", String(result.total || 0))
							);
						},
						() => {
							setBusy("");
							setNotice(t("syncError"));
						}
					);
			};

			const onPick = (event) => {
				const file = event.target.files && event.target.files[0];
				event.target.value = "";
				if (!file) return;
				if (!/^image\//.test(file.type)) {
					setNotice(t("uploadError"));
					return;
				}
				setBusy("upload");
				setNotice("");
				const reader = new FileReader();
				reader.onload = () => {
					Promise.resolve()
						.then(() => upload(reader.result))
						.then(
							() => {
								setVideoBackground(null);
								setWebBackground(null);
								refreshBackground();
								refresh();
								setBusy("");
								setNotice(t("applied"));
							},
							() => {
								setBusy("");
								setNotice(t("uploadError"));
							}
						);
				};
				reader.onerror = () => {
					setBusy("");
					setNotice(t("uploadError"));
				};
				reader.readAsDataURL(file);
			};

			return react.createElement(
				"div",
				{ style: styles.section, "aria-busy": false },
				react.createElement("p", { style: styles.status }, t("currentLabel").replace("{name}", currentName)),
				notice ? react.createElement("p", { style: styles.notice }, notice) : null,
				react.createElement(
					"div",
					{ style: styles.switchRow },
					react.createElement(
						"button",
						{
							type: "button",
							role: "switch",
							"aria-checked": dynamic,
							style: { ...styles.toggle, background: dynamic ? "var(--dsw-alias-brand-primary)" : "var(--dsw-alias-bg-layer-3)" },
							onClick: () => setDynamic((value) => {
								const next = !value;
								try {
									localStorage.setItem("user-wallpaper.dynamic", next ? "1" : "0");
								} catch { /* ignore */ }
								return next;
							})
						},
						react.createElement("span", { style: { ...styles.toggleKnob, transform: dynamic ? "translateX(18px)" : "translateX(0)" } })
					),
					react.createElement(
						"div",
						{ style: { display: "flex", flexDirection: "column", gap: "2px" } },
						react.createElement("p", { style: styles.switchLabel }, t("dynamic")),
						react.createElement("p", { style: styles.switchHint }, t("dynamicHint"))
					),
					react.createElement(
						"button",
						{ type: "button", style: { ...styles.uploadButton, marginLeft: "auto" }, disabled: !!busy, onClick: onSync },
						busy === "sync" ? t("syncing") : t("sync")
					)
				),
				react.createElement(
					"h3",
					{ style: { margin: "0", fontSize: "13px", lineHeight: "20px", color: "var(--dsw-alias-label-secondary)" } },
					t("presets")
				),
				react.createElement(
					"ul",
					{ style: styles.grid },
					presets.map((p) =>
						react.createElement(
							"li",
							{ key: p.id, style: { margin: "0", padding: "0", listStyle: "none" } },
							react.createElement(
								"button",
								{ type: "button", style: Object.assign({}, styles.card, busy ? styles.busy : {}), onClick: () => onApply(p.id), disabled: !!busy, title: p.name },
								react.createElement("img", { src: p.url, alt: p.name, loading: "lazy", style: styles.thumb }),
								react.createElement(
									"span",
									{ style: styles.cardBody },
									react.createElement("span", { style: styles.cardName }, p.name),
									p.id === current ? react.createElement("span", { style: styles.currentBadge }, t("current")) : null,
									p.video ? react.createElement("span", { style: styles.videoBadge }, t("video")) : null,
									p.web ? react.createElement("span", { style: styles.webBadge }, t("web")) : null
								)
							)
						)
					)
				),
				react.createElement(
					"div",
					{ style: styles.uploadRow },
					react.createElement(
						"button",
						{ type: "button", style: styles.uploadButton, disabled: !!busy, onClick: () => fileRef.current && fileRef.current.click() },
						busy === "upload" ? t("uploading") : t("upload")
					),
					react.createElement("p", { style: styles.uploadHint }, t("uploadHint")),
					react.createElement("input", { ref: fileRef, type: "file", accept: "image/*", style: { display: "none" }, onChange: onPick })
				)
			);
		}

		/** apply 阶段：注册词典、设置页版块，并注入背景样式。 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "user-wallpaper: dictionaries");
			const t = ctx.locale.bind(NS);

			const load = async () => {
				const res = await fetch("/api/user-wallpaper/list", { headers: { accept: "application/json" } });
				if (!res.ok) throw new Error(`user-wallpaper/list failed: ${res.status}`);
				return res.json();
			};
			const applyPreset = async (id) => {
				const res = await fetch("/api/user-wallpaper/apply", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ id }),
				});
				if (!res.ok) throw new Error(`user-wallpaper/apply failed: ${res.status}`);
				return res.json();
			};
			const upload = async (dataBase64) => {
				const res = await fetch("/api/user-wallpaper/upload", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ dataBase64 }),
				});
				if (!res.ok) throw new Error(`user-wallpaper/upload failed: ${res.status}`);
				return res.json();
			};

			const syncWallpapers = async () => {
				const res = await fetch("/api/user-wallpaper/refresh", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "{}",
				});
				if (!res.ok) throw new Error(`user-wallpaper/refresh failed: ${res.status}`);
				return res.json();
			};

			// 背景样式：挂到 <head>，effect 卸载时移除；提供带缓存戳的即时刷新
			const bgStyle = { el: null };
			ctx.effect(() => {
				const style = document.createElement("style");
				style.setAttribute("data-user-wallpaper", "");
				style.textContent = CSS;
				document.head.appendChild(style);
				bgStyle.el = style;
				return () => {
					style.remove();
					bgStyle.el = null;
				};
			}, "user-wallpaper: style");

			const refreshBackground = () => {
				if (bgStyle.el) {
					bgStyle.el.textContent = CSS.replace(
						'url("/api/user-wallpaper/image")',
						'url("/api/user-wallpaper/image?v=' + Date.now() + '")'
					);
				}
			};

			// 动态视频背景层：固定铺底的 <video>，页面切后台自动暂停
			const videoRef = { el: null };
			ctx.effect(() => {
				const video = document.createElement("video");
				video.setAttribute("data-user-wallpaper-video", "");
				video.muted = true;
				video.loop = true;
				video.playsInline = true;
				video.autoplay = true;
				video.preload = "auto";
				video.style.display = "none";
				document.body.appendChild(video);
				videoRef.el = video;

				const onVisibility = () => {
					const v = videoRef.el;
					if (!v) return;
					if (document.hidden) {
						try {
							v.pause();
						} catch { /* ignore */ }
					} else if (v.getAttribute("src")) {
						try {
							v.play().catch(() => {});
						} catch { /* ignore */ }
					}
				};
				document.addEventListener("visibilitychange", onVisibility);
				return () => {
					document.removeEventListener("visibilitychange", onVisibility);
					try {
						v.pause();
					} catch { /* ignore */ }
					v.remove();
					videoRef.el = null;
				};
			}, "user-wallpaper: video");

			const setVideoBackground = (url) => {
				const video = videoRef.el;
				if (!video) return;
				if (!url) {
					try {
						video.pause();
					} catch { /* ignore */ }
					video.removeAttribute("src");
					video.style.display = "none";
					return;
				}
				video.src = url + (url.indexOf("?") === -1 ? "?" : "&") + "v=" + Date.now();
				video.style.display = "";
				try {
					video.play().catch(() => {});
				} catch { /* ignore */ }
			};

			// 网页壁纸背景层：固定铺底的 iframe，跑原版 HTML 动画
			const webRef = { el: null };
			ctx.effect(() => {
				const frame = document.createElement("iframe");
				frame.setAttribute("data-user-wallpaper-web", "");
				frame.setAttribute("title", "wallpaper");
				frame.style.display = "none";
				document.body.appendChild(frame);
				webRef.el = frame;
				return () => {
					frame.remove();
					webRef.el = null;
				};
			}, "user-wallpaper: web");

			const setWebBackground = (url) => {
				const frame = webRef.el;
				if (!frame) return;
				if (!url) {
					frame.removeAttribute("src");
					frame.style.display = "none";
					return;
				}
				frame.src = url + (url.indexOf("?") === -1 ? "?" : "&") + "v=" + Date.now();
				frame.style.display = "";
			};

			const injected = () => ({ load, apply: applyPreset, upload, sync: syncWallpapers, refreshBackground, setVideoBackground, setWebBackground });
			ctx.slots.inject("settings.section", () =>
				ctx.slots.register(
					{
						name: "settings.section",
						id: "wallpaper",
						order: 35,
						label: () => t("nav"),
						locale: NS,
						inject: injected
					},
					WallpaperSection
				)
			);
		}

		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
