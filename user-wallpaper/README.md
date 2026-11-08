# user-wallpaper

给 DeepSeek Harness 网页界面换壁纸的插件：把 Wallpaper Engine 的壁纸用作界面背景，支持导入本地图片、固定在聊天背景上。

## 安装

1. 把本目录复制到 `~/.dsh/profiles/web/plugins/user-wallpaper/`
2. 在 `~/.dsh/profiles/web/cordis.patch.yml` 里追加：

   ```yaml
   - insert:
       - id: user-wallpaper
         name: 'user-wallpaper'
   ```

3. 重启 `dsh web`（客户端插件改动刷新页面即可）

## 壁纸

仓库**不包含预设壁纸**。安装后把想用的图片放进 `presets/` 目录，或在设置里导入。

## 结构

```
user-wallpaper/
├── client.js       # 浏览器半区：渲染壁纸层、导入界面
├── lib/index.js    # Host 半区：读取/保存壁纸配置
├── lib/import.js   # 导入本地图片
├── package.json
└── README.md
```

## License

MIT
