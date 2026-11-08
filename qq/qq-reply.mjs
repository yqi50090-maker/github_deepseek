#!/usr/bin/env node
// qq-reply.mjs —— 在 QQ 对话里回一句。和 qq-send.mjs 的区别只有一条：
//   qq-send 只发 OWNER_QQ（防误发），qq-reply 可以发给「最近真的跟她说过话的人」。
//
// 为什么这样限制：主人选了「所有人都回」，但发送端不能无条件放开 ——
//   否则她就被当成任意发信工具，可以被诱导给陌生人发消息。
//   白名单由 qq-chat 插件在收到消息时写入（recent-senders.json），30 分钟有效。
//
// 用法：
//   node qq-reply.mjs --to <QQ号> "要说的话"
//   node qq-reply.mjs --list            # 看当前可以回给谁
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const HOME = process.env.USERPROFILE || process.env.HOME || os.homedir()
const ENV_FILE = path.join(HOME, '.dsh', 'qq.env')
const STATE_DIR = path.join(HOME, '.dsh', 'qq-chat')
const SENDERS = path.join(STATE_DIR, 'recent-senders.json')
const TTL_MS = 30 * 60_000

function readEnvFile() {
  const out = {}
  try {
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* 没配置文件也能跑 */ }
  return out
}

const file = readEnvFile()
const cfg = {
  http: (process.env.QQ_HTTP || file.QQ_HTTP || 'http://127.0.0.1:3000').replace(/\/+$/, ''),
  token: process.env.QQ_TOKEN ?? file.QQ_TOKEN ?? '',
  owner: String(process.env.OWNER_QQ || file.OWNER_QQ || '').trim(),
}

const argv = process.argv.slice(2)
const toIdx = argv.indexOf('--to')
const to = toIdx >= 0 ? String(argv[toIdx + 1] || '').trim() : cfg.owner
const dropped = new Set(['--to', '--list'])
const text = argv
  .filter((a, i) => !dropped.has(a) && !(toIdx >= 0 && i === toIdx + 1))
  .join(' ')
  .trim()

function recentSenders() {
  try {
    const raw = JSON.parse(fs.readFileSync(SENDERS, 'utf8'))
    const now = Date.now()
    const alive = {}
    for (const [uid, at] of Object.entries(raw)) {
      if (now - Number(at) <= TTL_MS) alive[uid] = Number(at)
    }
    return alive
  } catch { return {} }
}

function die(msg) { console.error(`✗ ${msg}`); process.exit(2) }

if (argv.includes('--list')) {
  const alive = recentSenders()
  const rows = Object.entries(alive).sort((a, b) => b[1] - a[1])
  if (!rows.length) { console.log('（最近 30 分钟没有人跟她说过话）'); process.exit(0) }
  for (const [uid, at] of rows) {
    console.log(`${uid}  ${Math.round((Date.now() - at) / 60000)} 分钟前`)
  }
  process.exit(0)
}

if (!text) die('没给正文。用法：node qq-reply.mjs --to <QQ号> "要说的话"')
if (text.length > 1500) die(`正文 ${text.length} 字，太长了（上限 1500）`)
if (!to) die('不知道回给谁：请给 --to <QQ号>')

const isOwner = cfg.owner && to === cfg.owner
const allowed = recentSenders()
if (!isOwner && !allowed[to]) {
  die(`${to} 不在「最近 30 分钟跟她说过话」的名单里，拒绝发送。要发给陌生人请先让 TA 先发消息过来。`)
}

const url = `${cfg.http}/send_private_msg`
const payload = { user_id: Number(to), message: text }
const headers = { 'content-type': 'application/json', ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}) }

try {
  const r = await fetch(url, {
    method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok || (body.status && body.status !== 'ok')) {
    console.error(`✗ 发送失败 HTTP ${r.status} ${JSON.stringify(body).slice(0, 200)}`)
    process.exit(1)
  }
  console.log(`✓ 已回给 ${to} · message_id=${body?.data?.message_id ?? '?'}`)
} catch (e) {
  console.error(`✗ 连接失败：${String(e.message).slice(0, 160)}`)
  process.exit(1)
}
