#!/usr/bin/env node
/**
 * md2html.js —— 把 Markdown 转成单文件、自包含的 HTML（中文排版优化）
 *
 * 用法:  node md2html.js <输入.md> <输出.html>
 *
 * 支持的语法：标题(#~######)、表格、围栏代码块、引用块、有序/无序列表、
 *            分隔线、粗体、斜体、行内代码、链接
 * 不依赖任何第三方库，输出为单个 .html 文件，双击即可用浏览器打开。
 */

const fs = require('fs');
const path = require('path');

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('用法: node md2html.js <输入.md> <输出.html>');
  process.exit(1);
}

let md = fs.readFileSync(inPath, 'utf8');
if (md.charCodeAt(0) === 0xfeff) md = md.slice(1);   // 去 BOM
md = md.replace(/\r\n?/g, '\n');

/* ---------------- 工具函数 ---------------- */

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 行内元素：先抽出行内代码占位，再处理粗体/斜体/链接，最后还原 */
function inline(s) {
  const codes = [];
  let t = esc(s);
  t = t.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c.replace(/\\\|/g, '|'));   // 表格里转义的 \| 还原成 |
    return `\u0000CODE${codes.length - 1}\u0000`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  t = t.replace(/\\\|/g, '|');             // 行内代码之外转义的 \| 同样还原
  t = t.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
  return t;
}

/**
 * 把一行表格拆成单元格。
 * 只按「未被反斜杠转义」的 | 切分，这样单元格里的 \| 才不会被当成列分隔符。
 */
const splitRow = (line) =>
  line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());

const isSepRow = (line) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');

/* ---------------- 主解析 ---------------- */

const headings = [];   // 收集标题用于生成目录
const out = [];
const lines = md.split('\n');
let i = 0;

const slug = (s) =>
  'h-' + s.replace(/[^\w\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

while (i < lines.length) {
  const line = lines[i];

  /* --- 围栏代码块 --- */
  if (/^\s*```/.test(line)) {
    const lang = line.replace(/^\s*```/, '').trim();
    const buf = [];
    i++;
    while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
    i++; // 跳过结束的 ```
    out.push(
      `<pre class="code"><code${lang ? ` class="lang-${esc(lang)}"` : ''}>${esc(buf.join('\n'))}</code></pre>`
    );
    continue;
  }

  /* --- 分隔线 --- */
  if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
    out.push('<hr>');
    i++;
    continue;
  }

  /* --- 标题 --- */
  const hm = line.match(/^(#{1,6})\s+(.*)$/);
  if (hm) {
    const lv = hm[1].length;
    const text = hm[2].trim();
    const id = slug(text);
    headings.push({ lv, text, id });
    out.push(`<h${lv} id="${id}">${inline(text)}</h${lv}>`);
    i++;
    continue;
  }

  /* --- 表格 --- */
  if (/^\s*\|/.test(line) && i + 1 < lines.length && isSepRow(lines[i + 1])) {
    const head = splitRow(line);
    i += 2;
    const body = [];
    while (i < lines.length && /^\s*\|/.test(lines[i])) body.push(splitRow(lines[i++]));
    let html = '<div class="tw"><table><thead><tr>';
    head.forEach((c) => (html += `<th>${inline(c)}</th>`));
    html += '</tr></thead><tbody>';
    body.forEach((r) => {
      html += '<tr>';
      for (let k = 0; k < head.length; k++) html += `<td>${inline(r[k] ?? '')}</td>`;
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    out.push(html);
    continue;
  }

  /* --- 引用块（含内部简单 markdown） --- */
  if (/^\s*>\s?/.test(line)) {
    const buf = [];
    while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
      buf.push(lines[i].replace(/^\s*>\s?/, ''));
      i++;
    }
    const inner = buf.map((b) => (b.trim() === '' ? '<br>' : `<p>${inline(b)}</p>`)).join('');
    out.push(`<blockquote>${inner}</blockquote>`);
    continue;
  }

  /* --- 列表 --- */
  if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
    const ordered = /^\s*\d+\.\s+/.test(line);
    const items = [];
    while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
      let text = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '');
      const indent = (lines[i].match(/^\s*/) || [''])[0].length;
      i++;
      // 续行（缩进的普通行）
      while (i < lines.length && lines[i].trim() !== '' && !/^\s*([-*+]|\d+\.)\s+/.test(lines[i])
             && (lines[i].match(/^\s*/) || [''])[0].length > indent) {
        text += ' ' + lines[i].trim();
        i++;
      }
      items.push(`<li>${inline(text)}</li>`);
    }
    out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
    continue;
  }

  /* --- 空行 --- */
  if (line.trim() === '') { i++; continue; }

  /* --- 段落 --- */
  const para = [];
  while (
    i < lines.length &&
    lines[i].trim() !== '' &&
    !/^\s*(#{1,6}\s|>|```|\|)/.test(lines[i]) &&
    !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) &&
    !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
  ) {
    para.push(lines[i++]);
  }
  if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
}

/* ---------------- 生成目录 ---------------- */

const toc = headings
  .filter((h) => h.lv <= 2)
  .map((h) => `<a class="l${h.lv}" href="#${h.id}">${esc(h.text)}</a>`)
  .join('');

const title = (headings.find((h) => h.lv === 1) || { text: path.basename(inPath) }).text;

/* ---------------- 输出 ---------------- */

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root{
    --fg:#1f2328; --fg2:#57606a; --bg:#ffffff; --bg2:#f6f8fa;
    --line:#d8dee4; --accent:#0969da; --accent2:#0a3069;
  }
  *{box-sizing:border-box}
  html{-webkit-text-size-adjust:100%}
  body{
    margin:0; background:var(--bg); color:var(--fg);
    font-family:"Microsoft YaHei","PingFang SC","Hiragino Sans GB","Source Han Sans SC",
                "Noto Sans CJK SC",-apple-system,"Segoe UI",Roboto,sans-serif;
    font-size:16px; line-height:1.85;
  }
  .layout{display:flex; align-items:flex-start; max-width:1500px; margin:0 auto;}

  /* 侧边目录 */
  nav.toc{
    position:sticky; top:0; flex:0 0 264px; max-height:100vh; overflow-y:auto;
    padding:28px 14px 40px 22px; border-right:1px solid var(--line);
    font-size:13.5px; line-height:1.65;
  }
  nav.toc .hdr{font-weight:700; color:var(--fg2); font-size:12px; letter-spacing:.1em;
    text-transform:uppercase; margin-bottom:12px;}
  nav.toc a{display:block; color:var(--fg2); text-decoration:none; padding:3px 8px;
    border-radius:5px; border-left:2px solid transparent;}
  nav.toc a:hover{background:var(--bg2); color:var(--accent);}
  nav.toc a.l1{font-weight:700; color:var(--fg); margin-top:10px; font-size:14px;}
  nav.toc a.l2{padding-left:18px;}

  article{flex:1 1 auto; min-width:0; max-width:1000px; padding:40px 48px 120px;}

  h1,h2,h3,h4,h5,h6{line-height:1.4; margin:1.9em 0 .7em; font-weight:700; scroll-margin-top:16px;}
  h1{font-size:1.9em; margin-top:0; padding-bottom:.4em; border-bottom:2px solid var(--line);}
  h2{font-size:1.42em; padding-bottom:.3em; border-bottom:1px solid var(--line);}
  h3{font-size:1.18em; color:var(--accent2);}
  h4{font-size:1.05em;}
  p{margin:.85em 0;}
  strong{color:var(--accent2);}
  a{color:var(--accent);}
  hr{border:0; border-top:1px solid var(--line); margin:2.4em 0;}

  code{
    background:var(--bg2); padding:.16em .42em; border-radius:5px;
    font-family:Consolas,"Cascadia Mono","SF Mono",Menlo,monospace; font-size:.88em;
    color:#cf222e;
  }
  pre.code{
    background:var(--bg2); border:1px solid var(--line); border-radius:8px;
    padding:14px 16px; overflow-x:auto; line-height:1.6;
  }
  pre.code code{background:none; padding:0; color:var(--fg); font-size:13.5px;}

  blockquote{
    margin:1.1em 0; padding:.7em 1.1em; color:var(--fg2);
    background:#fbfcfd; border-left:4px solid var(--accent); border-radius:0 8px 8px 0;
  }
  blockquote p{margin:.35em 0;}

  /* 表格 */
  .tw{overflow-x:auto; margin:1.3em 0;}
  table{border-collapse:collapse; width:100%; font-size:14.5px; line-height:1.6;}
  th,td{border:1px solid var(--line); padding:8px 12px; text-align:left; vertical-align:top;}
  th{background:var(--bg2); font-weight:700; white-space:nowrap;}
  tbody tr:nth-child(even){background:#fcfcfd;}
  tbody tr:hover{background:#f3f7fd;}

  ul,ol{margin:.8em 0; padding-left:1.7em;}
  li{margin:.35em 0;}

  /* 窄屏 */
  @media (max-width:1080px){
    nav.toc{display:none;}
    article{padding:26px 18px 80px;}
    body{font-size:15.5px;}
  }
  @media print{
    nav.toc{display:none;} article{max-width:none; padding:0;}
    pre.code,.tw{page-break-inside:avoid;}
  }
</style>
</head>
<body>
<div class="layout">
  <nav class="toc"><div class="hdr">目录</div>${toc}</nav>
  <article>
${out.join('\n')}
  </article>
</div>
</body>
</html>`;

fs.writeFileSync(outPath, html, 'utf8');
console.log(`  ✓ 已生成: ${outPath}`);
console.log(`    大小 ${(Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)} KB`);
console.log(`    标题 ${headings.length} 个，目录条目 ${headings.filter((h) => h.lv <= 2).length} 条`);
