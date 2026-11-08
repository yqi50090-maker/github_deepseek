# dsh-extras

个人收集的两个 DeepSeek Harness 扩展：一个 Markdown 预览技能、一个网页背景插件。

## 目录

### [md-view](./md-view) — Markdown 自动生成 HTML 预览

生成任何 Markdown 文档时，自动额外输出一份同名 HTML，双击即可查看。

- **类型**：DSH skill（不是 npm 包）
- **安装**：把 `md-view` 整个目录复制到 `~/.dsh/skills/md-view/`，重启 DSH
- **依赖**：Node.js（转换器 `md2html.js` 零第三方依赖）

### [user-wallpaper](./user-wallpaper) — DSH 网页界面壁纸

把 Wallpaper Engine 的壁纸用作 DSH 网页界面背景，支持导入自定义图片。

- **类型**：DSH web 插件
- **安装**：复制到 `~/.dsh/profiles/web/plugins/user-wallpaper/`，在 profile 的 `cordis.patch.yml` 里 insert，或发布到 npm 后用 `dsh plugin --profile web add` 安装
- **注意**：仓库不含预设壁纸，`presets/` 需自行放入图片

## License

MIT
