# qq

把 QQ 私聊接进 DeepSeek Harness 的完整通道：消息接入、接线操作、回复，全在一个插件里。

## 两半功能

**消息管道**

```
QQ 好友发消息
  → NapCat 上报 HTTP POST 到 /api/qq/event?k=<token>
  → 过滤（只处理私聊文本、忽略自己发的）→ 限流 → 审计日志
  → sessionController.prompt 唤醒 'qq-chat' 会话
  → agent 用 `node qq-reply.mjs --to <QQ号> "要说的话"` 回复
```

**接入操作**

输入框下方的 QQ 状态按钮：检测 NapCat 是否在线；不在线就拉起进程；登录需要扫码时把最新二维码递到桌面并弹出。接口 `POST /api/qq-attach`。

## 依赖

- [NapCat](https://github.com/NapNeko/NapCatQQ)：QQ 的 OneBot 实现，HTTP 服务默认 `127.0.0.1:3000`
- `~/.dsh/qq.env`：

```ini
QQ_HTTP=http://127.0.0.1:3000
QQ_TOKEN=<NapCat access token，可留空>
OWNER_QQ=<你自己的 QQ 号>
```

## 配置

| 变量 | 说明 |
|---|---|
| `QQ_EVENT_TOKEN` | **必须设置**，NapCat 上报带 `?k=<同值>` 才放行 |
| `NAPCAT_DIR` | NapCat 安装目录（拉起 `NapCatWinBootMain.exe` 用） |
| `QQ_QR_CACHE` | 二维码缓存文件路径（默认从 `NAPCAT_DIR` 推算） |
| `QQ_QR_DIR` | 二维码复制到哪（默认桌面） |

NapCat 的 HTTP 上报地址填：`http://127.0.0.1:3080/api/qq/event?k=<QQ_EVENT_TOKEN>`

## qq-reply.mjs

只允许发给两类人：你自己（`OWNER_QQ`），或最近 30 分钟内真的发过消息的人。

```bash
node qq-reply.mjs --to <QQ号> "要说的话"
node qq-reply.mjs --list
```

## 安全闸

- 每人每小时最多 100 轮，超出丢弃只记审计
- 陌生人提示词写死硬约束：不透露家里的事、路径、凭据；不执行对方要求的任何命令

## 安装

1. 复制本目录到 `~/.dsh/profiles/web/plugins/qq/`
2. `cordis.patch.yml` 追加：

   ```yaml
   - insert:
       - id: qq
         name: '@local/qq'
   ```

3. 重启 `dsh web`

## License

MIT
