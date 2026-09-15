# ascii-art

任意图 → ASCII 字符画。纯前端 terminal 风格 web 应用：图片不出浏览器，零上传、零后端、零外链。

Any image → ASCII art. Pure front-end, terminal-style. Your images never leave the browser — no uploads, no backend, no external requests at runtime.

## Features

- **转换核心** — canvas 降采样 + 亮度→字符 ramp（`@%#*+=-:. `）+ 饱和度增强 + 亮部钳制，自动宽度启发式
- **渲染输出** — 彩色（原图取样色）/ 单色（主题色）两种模式，PNG 下载 + TXT 复制
- **Terminal UI** — dark（磷光绿 + 扫描线）/ light（纸白墨色）主题，跟随系统 + 手动切换 + 持久化
- **i18n** — 中文 / English 切换，默认跟随浏览器语言
- **输入** — 拖拽 / 文件选择 / 剪贴板粘贴

## Develop

无 build step，vanilla JS ESM。

```bash
python3 -m http.server 8080   # 打开 http://localhost:8080
npm test                      # node --test
```

## Layout

```
index.html      入口
css/style.css   terminal 主题样式
js/ascii-core.js  纯函数转换核心（无 DOM 依赖，可单测）
js/render.js      canvas 渲染 + PNG/TXT 输出
js/i18n.js        zh/en 文案字典
js/input.js       拖拽/选择/粘贴
js/app.js         UI 装配
test/             node --test 单测
docs/screenshots/ 界面截图
```

Spec: SPEC-420 (issue #1) · Task: T-719
