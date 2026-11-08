---
name: md-view
description: 生成任何 Markdown 文档（笔记、总结、报告、翻译、精读、方案）时，自动额外输出一份同名 HTML 供阅读。用本技能目录下的 md2html.js 转换。当用户要求写文档、做总结、整理笔记、翻译论文、生成报告、输出方案时使用。
whenToUse: 任何会产出 .md 文档的任务；用户说"生成文档""做个总结""整理笔记""翻译""写报告""输出文档""整理成 md"时，以及用户提到"HTML 版""能渲染的版本""方便看的版本""双击看"时
---

# md-view —— Markdown 自动渲染技能

## 这个技能是什么

一套**让 Markdown 双击即看**的工具 + 一条给 AI 的写作规则。

用户 2026-10-14 明确要求：
1. 在 VS Code 里看 .md 不舒服 → **文档要同时给 HTML**
2. 双击 .md 应该**直接跳到渲染页面** → 已做成系统关联
3. 工具要**通用、不要放在某个项目文件夹里** → 全部收在本技能目录

用户原话："用 HTML 吧，这个也不错" / "把这个总结成一个 SKILL，不要放在这个文件夹里，让我之后也可以使用"。

## 文件清单

| 文件 | 编码 | 作用 |
|---|---|---|
| `SKILL.md` | UTF-8 | 本说明（给 AI） |
| `使用说明.md` / `.html` | UTF-8 | 给人看的说明书 |
| `md2html.js` | UTF-8 | **转换器核心**，无第三方依赖 |
| `md-view.vbs` | **纯 ASCII** ⚠️ | 系统关联的启动器：双击 .md 时转换 + 打开浏览器 |
| `批量转换.vbs` | **UTF-16LE** | 拖拽批量转换（用户手动用） |
| `_还原关联.reg` | UTF-16LE | 撤销注册表改动 |
| `_reg_backup_原始关联.reg` | UTF-16LE | 改动前的原始状态备份 |

## 一、生成文档时：必须双份输出

**任何任务只要产出了 `.md` 文件，就必须紧接着转成 `.html`。**

```powershell
& "E:\Node\node.exe" "C:\Users\lenovo\.dsh\skills\md-view\md2html.js" "<输入.md>" "<同名.html>"
```

1. HTML 放在**和 md 同一个目录**，同名换扩展名
2. 用 `present` 把 **HTML 作为主要交付物**展示
3. 交付时说明：`.md` 存档/编辑，`.html` 双击阅读

## 二、系统关联（已完成，供恢复时参考）

```
HKCU\Software\Classes\.md            (默认) = "MarkdownAutoView"
HKCU\Software\Classes\MarkdownAutoView\shell\open\command
                                     = wscript.exe "...\md-view.vbs" "%1"
HKCU\Software\Classes\.md\OpenWithProgids
                                     = MarkdownAutoView, VSCode.md
```

**要点**：

- `VSCode.md` 是 **VS Code 自己的 ProgId**，指向 `Code.exe`。**绝对不要覆盖它**——VS Code 升级会改回去，导致用户的关联莫名失效。本技能用的是独立新建的 `MarkdownAutoView`。
- 撤销：双击 `_还原关联.reg` → 重启资源管理器
- 重建：新建 `MarkdownAutoView` ProgId → 命令指向 `md-view.vbs` → `.md` 默认值设为 `MarkdownAutoView` → 调 `SHChangeNotify(0x08000000,0,0,0)`

## 三、md-view.vbs 的行为

1. 算出同目录同名的 `.html` 路径
2. **增量判断**：`.html` 存在且不比 `.md` 旧 → 跳过转换（秒开）
3. 否则调用 node 转换（隐藏窗口，等待完成）
4. 用默认浏览器打开 `.html`

调试：环境变量 `MDVIEW_DEBUG=1` → 日志写 `%TEMP%\md-view.log`（Unicode 写入，中文路径可读）。

## 四、⚠️ 编码铁律（踩过坑，务必遵守）

### `.vbs` 脚本

wscript 用 **ANSI/GBK** 读取**无 BOM 的 UTF-8** `.vbs`。脚本里只要出现中文字面量 → 解析成乱码 → **模态语法错误对话框** → **进程永久阻塞**。

**症状极具误导性**：双击没反应、`wscript` 进程卡住、**连日志都不写一行**（错误发生在解析期，早于任何执行）。

| 文件 | 规则 |
|---|---|
| `md-view.vbs` | **必须保持纯 ASCII**，报错信息一律英文。改完用 `($bytes \| Where-Object { $_ -gt 127 }).Count` 验证为 0 |
| `批量转换.vbs` | 用 **UTF-16LE（带 BOM）** 保存，这样中文界面才安全 |

**定位这类问题的方法**：写一个**纯英文的最小探针脚本**做对照。探针正常 → 问题就是中文。

### PowerShell 脚本

同类陷阱：PS 5.1 读**无 BOM 的 UTF-8** 脚本按 GBK 处理，含中文路径会解析失败。写文件时加 BOM：`"\uFEFF" + 内容`。

### 其他易踩的语法坑

- **`$pid` 是 PowerShell 只读自动变量**，`foreach ($pid in ...)` 会静默失败，改用 `$progId`
- **PowerShell 里 `$a[0]-$b[0]` 无空格会被误解析**，必须写 `($a[0] - $b[0])`

## 五、转换器能力（md2html.js）

无第三方依赖，只用 Node 内置模块。

**支持的语法**：标题 `#`~`######`、表格、围栏代码块、引用块、有序/无序列表、分隔线、粗体、斜体、行内代码、链接。

**表格转义**：单元格内的 `\|` 不会被当作列分隔符（用 `(?<!\\)\|` 切分），行内代码里的 `\|` 会还原成 `|`。

**输出特性**：
- 单文件自包含（内嵌 CSS，断网可看）
- 自动生成侧边目录（h1/h2，宽屏常驻、窄屏隐藏）
- 中文字体优化（微软雅黑优先，行高 1.85）
- 表格斑马纹 + 悬停高亮
- 打印样式（`Ctrl+P` 存 PDF）
- 去 BOM、兼容 CRLF、支持中文路径

## 六、批量转换

给用户手动用时，把文件/文件夹拖到 `批量转换.vbs` 上（递归扫描，忽略非 .md）。

给 AI 用：

```powershell
$node = 'E:\Node\node.exe'
$conv = 'C:\Users\lenovo\.dsh\skills\md-view\md2html.js'
Get-ChildItem <目录> -Recurse -Filter *.md -File |
  Where-Object { $_.FullName -notmatch 'node_modules|\.git' } |
  ForEach-Object {
    & $node $conv $_.FullName ([System.IO.Path]::ChangeExtension($_.FullName, '.html'))
  }
```

## 七、已验证记录

| 日期 | 内容 | 结果 |
|---|---|---|
| 2026-10-14 | `可重构天线_论文\五篇论文精读翻译.md`（43.3 KB / 784 行） | → 66.6 KB HTML，27 表格 / 64 目录条目，残留 0 处 |
| 2026-10-14 | `天线学习-deepseek` 学习笔记 + 论文总结 | 16 个全部成功 |
| 2026-10-14 | `md-view.vbs` 端到端（真实中文路径） | 转换 ✓ / 增量跳过 ✓ / 无残留进程 ✓ |
| 2026-10-14 | `批量转换.vbs` 递归 + 忽略非 md | 3/3 成功，.txt 正确忽略 |
| 2026-10-14 | 修复转义管道符后全量重跑 | 17/17 成功 |

## 八、故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 双击 .md 无反应，wscript 卡住 | 脚本里混入非 ASCII | 改回纯英文；`Get-Process wscript \| Stop-Process -Force` |
| 弹窗问"你要如何打开" | 系统 UserChoice 在抢 | 去「设置 → 默认应用」指定，或右键勾"始终" |
| 打开了 VS Code 源码 | 关联被改回 | 重新把 `.md` 默认值设为 `MarkdownAutoView` |
| 表格没渲染 | 缺 `\|---\|` 分隔行 | 补上分隔行 |
| HTML 没更新 | 增量跳过 | 删掉旧 `.html`，或触碰 `.md` 的修改时间 |
| 日志中文乱码 | 日志按 ANSI 写入 | 已修：`OpenTextFile(..., 8, True, -1)` |

## 九、注意事项

- **不要**把 HTML 放到别的目录再告诉用户——**必须和 md 同目录同名**
- 用户明确说"只要 md"时，跳过 HTML 转换
- 转换后在回答里**给出 HTML 路径**，让用户能直接双击
- **通用工具不要留在用户的项目文件夹里**——用户明确要求过
