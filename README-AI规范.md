# 网页 Canvas 游戏 · AI 生成规范

把本文件整份发给 AI。目标：以后新游戏 / 新仓库都按同一套脚手架生成，**分辨率行为一致、目录结构一致、范围不擅自扩张**。

分辨率细节以同目录 `README-分辨率.md` 为准（若本仓库没有，从参考项目拷一份过来一并发给 AI）。

---

## 0. 怎么用（给人看）

发给 AI 时附上一句即可，例如：

> 按 `README-AI规范.md` 搭脚手架；分辨率按 `README-分辨率.md`；**暂时不要做玩法**。

或：

> 按 `README-AI规范.md` 实现 XXX（只做我说的，不要加其它内容）。

---

## 1. 给 AI 的硬性约束（必须遵守）

1. **只做用户明确要求的事。** 没说玩法就不要写移动 / 攻击 / 敌人 / 关卡 / 数值；没说 UI 就不要做菜单、设置页、教程。
2. **不要「顺手」加东西：** README 长文、示例关卡、假数据、音效、粒子、资源包、CI、多余依赖、多余页面。
3. **技术栈固定（网页 2D）：** Vite + TypeScript + 原生 Canvas 2D（除非用户指定 Pixi / 其它引擎）。
4. **设计分辨率固定 1920×1080，letterbox（黑边）。** 算法与 DOM 结构见 `README-分辨率.md`，一字不差执行。
5. **所有布局 / 命中 / 绘制用设计像素。** 禁止用 `window.innerWidth` / `innerHeight` / `vw` / `vh` 做玩法或 HUD 布局。
6. **项目结构对齐本规范第 2 节。** 参考实现可看：`Dota乱战先锋`、`Paper`。
7. **中文沟通、代码标识符英文。** 用户可见文案可用中文。
8. **做完要能跑：** `npm install` → `npm run verify:fit` → `npm run typecheck` → `npm run dev`。

---

## 2. 标准目录（新建空项目时照抄）

```
<项目名>/
  index.html
  package.json
  package-lock.json
  tsconfig.json
  vite.config.ts
  启动.command                 # cd 到本目录；无 node_modules 则 npm install；再 npm run dev
  README-分辨率.md             # 从规范仓库拷贝，保持算法一致
  README-AI规范.md             # 本文件（可选拷贝）
  scripts/
    verify-fit.mjs            # 分辨率表格回归（见 README-分辨率.md 第 2 节）
  public/                     # 仅当有静态资源时再建；空项目可省略
    assets/
  src/
    main.ts                   # 入口：创建 GameApp + 引入 styles
    vite-env.d.ts
    app/
      GameApp.ts              # 应用壳：resize / canvas DPR / 主循环（无玩法时只画空舞台）
    config/
      design.ts               # DESIGN_WIDTH/HEIGHT + computeDesignFit / applyDesignStage / clientToDesign
    ui/
      styles.css              # #game-root / #design-root / canvas 最小样式
```

有玩法后再按需增加，仍保持分层，不要把一切塞进一个文件：

| 目录 | 放什么 |
|---|---|
| `src/config/` | 常量、技能表、设计分辨率 |
| `src/app/` | 应用生命周期、输入、主循环 |
| `src/render/` | 精灵裁剪、动画姿态、绘制辅助 |
| `src/ui/` | CSS、纯 DOM HUD（必须在 `#design-root` 内） |
| `public/assets/` | 图片等静态资源 |

---

## 3. 关键文件最低要求

### 3.1 `package.json`

```json
{
  "name": "<项目名-kebab-case>",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "description": "<中文名> — 1920×1080 letterbox canvas",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "verify:fit": "node scripts/verify-fit.mjs"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vite": "^6.0.7"
  }
}
```

不要默认加 React / Vue / Pixi / 状态库。用户点名再加。

### 3.2 `vite.config.ts`

- 别名 `@` → `src`
- `base: './'`（方便本地 / 相对路径部署）
- `server.port` 选一个未占用端口，`strictPort: true`
- `build.target: 'es2022'`

### 3.3 `tsconfig.json`

- `strict: true`
- `paths`: `@/*` → `src/*`
- `noEmit: true`（类型检查交给 `tsc --noEmit`，打包交给 Vite）

### 3.4 `index.html` DOM（不可改结构层级）

```html
<body>
  <div id="game-root">
    <div id="design-root" class="design-root">
      <canvas id="game-canvas"></canvas>
      <!-- 所有 HUD / 弹窗 / 标题 只能放在 design-root 里面 -->
    </div>
  </div>
  <script type="module" src="/src/main.ts"></script>
</body>
```

### 3.5 `src/config/design.ts`

整文件按 `README-分辨率.md` 第 5 节拷贝，不要改算法。

### 3.6 `GameApp` 壳（无玩法时）

最少包含：

1. 取 `#game-canvas`，`getContext('2d')`
2. `bindResize`：`resize` / `visualViewport.resize` / `fullscreenchange` → `applyDesignStage` + `syncCanvasBuffer`
3. `syncCanvasBuffer`：`dpr = min(2, devicePixelRatio)`，bitmap = `1920*dpr × 1080*dpr`，CSS 尺寸永远 `1920×1080`，`ctx.setTransform(dpr,0,0,dpr,0,0)`
4. 指针若需要：`clientToDesign(e.clientX, e.clientY, fit)`
5. 空项目可画：深色底 + 四角标记 `0,0` / `1920,0` / `0,1080` / `1920,1080`（方便验收 letterbox）
6. **不要**写 WASD、攻击、敌人、地图、摄像机跟随——除非用户要

---

## 4. 分辨率（摘要；细节以 README-分辨率.md 为准）

```
DESIGN_WIDTH  = 1920
DESIGN_HEIGHT = 1080
scale   = min(viewW / 1920, viewH / 1080)
offsetX = (viewW - 1920 * scale) / 2
offsetY = (viewH - 1080 * scale) / 2
transform = translate(offsetX, offsetY) scale(scale)   // origin: top left
```

禁止：

- `scaleX` / `scaleY` 分开（stretch）
- `max(...)` 缩放（crop）
- HUD 放在 `#design-root` 外
- `canvas.width = window.innerWidth`
- 用 `getBoundingClientRect` 另算一套坐标（除非与同一 fit 一致）

黑边颜色画在 `#game-root`（舞台外），不要画进 1920×1080 里面。

---

## 5. 两种常见任务模板

### A. 只搭空壳（无玩法）

AI 应交付：

- 第 2 节目录 + 依赖安装
- letterbox 可运行
- 四角标记 +（可选）fit 数值显示
- `verify:fit` / `typecheck` 通过
- **零玩法代码**

### B. 在已有壳上加功能

AI 应：

1. 先读现有 `GameApp` / `design.ts` / 目录，**不推翻脚手架**
2. 只改与需求相关的文件
3. 新坐标一律设计像素；输入一律 `clientToDesign`
4. 新 UI 节点放进 `#design-root`
5. 不顺便重构、不顺便加「以后可能用到」的系统

---

## 6. 验收清单（AI 做完自查）

- [ ] `npm run verify:fit` 通过（1080p / 720p / 16:10 / 超宽 / 正方形）
- [ ] `npm run typecheck` 通过
- [ ] 拖窗口：角色与 HUD 不变形；黑边只在舞台外
- [ ] 四角标记始终在设计画布四角，不进黑边、不被裁掉
- [ ] 未实现用户没要的玩法 / 菜单 / 额外系统
- [ ] 目录符合第 2 节，没有把资源塞进 `src/` 当 URL 静态文件（静态资源走 `public/`）

---

## 7. 一句话口令（可复制）

> 按 `README-AI规范.md` + `README-分辨率.md` 生成 Vite+TS+Canvas 脚手架：1920×1080 letterbox，目录对齐规范，只做我明确说的功能，不要擅自加玩法或其它内容。
