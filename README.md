# dsh-extras

个人收集的 DeepSeek Harness 扩展：技能、插件、以及一套项目记忆框架。

## 目录

### [md-view](./md-view) — Markdown 自动生成 HTML 预览

生成任何 Markdown 文档时，自动额外输出一份同名 HTML，双击即可查看。

- **类型**：DSH skill（不是 npm 包）
- **安装**：把 `md-view` 整个目录复制到 `~/.dsh/skills/md-view/`，重启 DSH
- **依赖**：Node.js（转换器 `md2html.js` 零第三方依赖）

### [user-wallpaper](./user-wallpaper) — DSH 网页界面壁纸

把 Wallpaper Engine 的壁纸用作 DSH 网页界面背景，支持导入自定义图片。

- **类型**：DSH web 插件
- **安装**：复制到 `~/.dsh/profiles/web/plugins/user-wallpaper/`，在 profile 的 `cordis.patch.yml` 里 insert
- **注意**：仓库不含预设壁纸，`presets/` 需自行放入图片

### [qq](./qq) — QQ 通道（消息接入 + 接线操作）

NapCat 上报 QQ 私聊 → 唤醒专用会话 → 用 `qq-reply.mjs` 回复；输入框下方还有状态按钮，一键检查/拉起 NapCat、递登录二维码。

- **类型**：DSH web 插件（含客户端 UI）+ 配套 CLI 脚本
- **依赖**：NapCat（OneBot 实现）、`~/.dsh/qq.env`
- **安全**：30 分钟回复窗口、每人每小时限流、陌生人硬约束
- **配置**：`QQ_EVENT_TOKEN`（必填）、`NAPCAT_DIR`、`QQ_QR_DIR`

### [projects-memory](./projects-memory) — 项目记忆框架

一套给 agent 用的记忆路由规则：每活一个交接文件，§〇 覆盖写，§五 追加结论。

- **类型**：DSH skill
- **注意**：只含框架，不含任何个人项目内容

### [memory](./memory) — 主体记忆模板

整套记忆结构的脱敏模板：`main.md`（我是谁 / 红线 / 环境 / 画像 / 长期结论）、记忆规范、思考协议、活清单与自我认知的 JSON 模板。

- **类型**：模板文件，复制到 `~/.dsh/memory/` 后按注释替换
- **注意**：全部为示例占位，不含任何真实个人内容

## License

MIT
