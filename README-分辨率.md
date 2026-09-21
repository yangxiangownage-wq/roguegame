# 固定设计分辨率 Canvas（1920×1080 + Letterbox）

把本文件整份发给 AI。目标：游戏在任意屏幕上**看起来一样**（等比缩放，不拉伸，不裁切玩法画面）。参考实现：`MaoMaoLingZhu` / `CrystalWorkshop` 的 `#design-root` letterbox。

---

## 0. 给 AI 的任务（直接照做）

1. 设计分辨率固定 **1920×1080（16:9）**。
2. 用 **uniform scale + letterbox**（黑边），不要 stretch，不要 crop。
3. 玩法、UI、特效、鼠标坐标全部使用 **设计像素**，禁止用 `window.innerWidth` / `innerHeight` 做布局或命中检测。
4. 渲染器（Canvas / Pixi / 其它）的逻辑尺寸永远是 1920×1080，只把外层舞台做 CSS `translate + scale`。
5. `resize` / `visualViewport.resize` / `fullscreenchange` 时重新 `applyDesignStage`。
6. 指针从屏幕坐标转设计坐标必须用 `clientToDesign`。

如果目标引擎不是网页，读第 8 节，用该引擎的等价设置，**算法不变**。

---

## 1. 要解决什么

| 错误做法 | 结果 |
|---|---|
| UI 按窗口百分比排 | 宽屏按钮变稀，竖屏挤成一团 |
| Canvas `width = innerWidth` | 摄像机看到的世界范围随屏幕变 |
| `background-size: cover` 铺满窗口 | 不同屏幕裁掉不同边缘 |
| X/Y 各自缩放（stretch） | 角色变胖变瘦 |
| 只缩放 Canvas、HUD 钉在 window | HUD 相对战场位置每台机器不一样 |

正确做法：**先画一张永远 1920×1080 的“设计画布”，再整张等比塞进窗口**。窗口比 16:9 更宽 → 左右黑边；更高 → 上下黑边。玩家在 27 寸 16:9、笔记本 16:10、超宽屏上看到的战场、按钮、血条相对位置完全一致。

这就是 Unity Canvas Scaler「Scale With Screen Size + Match 无所谓（因为 letterbox 后宽高比锁定）」的网页版。

---

## 2. 算法（必须一字不差）

```
DESIGN_WIDTH  = 1920
DESIGN_HEIGHT = 1080

scale   = min(viewW / 1920, viewH / 1080)
usedW   = 1920 * scale
usedH   = 1080 * scale
offsetX = (viewW - usedW) / 2
offsetY = (viewH - usedH) / 2
```

屏幕点 → 设计点：

```
designX = (clientX - offsetX) / scale
designY = (clientY - offsetY) / scale
```

校验用例（AI 实现后必须对上）：

| 窗口 | scale | offsetX | offsetY |
|---|---|---|---|
| 1920×1080 | 1 | 0 | 0 |
| 1280×720 | 2/3 | 0 | 0 |
| 1920×1200（16:10） | 1 | 0 | 60 |
| 2560×1080（超宽） | 1 | 320 | 0 |
| 800×800 | 800/1920 | 0 | 175 |

黑边颜色画在舞台**外面**的全屏根节点上（`#game-root`），不要画进 1920×1080 里面。

---

## 3. DOM 结构

```html
<body>
  <div id="game-root">           <!-- position:fixed; inset:0; 黑边底色 -->
    <div id="design-root">       <!-- 永远 1920×1080，JS 写 transform -->
      <canvas id="game-canvas"></canvas>
      <!-- 所有 HUD / 弹窗 / 标题屏都放这里，不要放在 design-root 外面 -->
    </div>
  </div>
</body>
```

规则：

- `#game-root` 铺满窗口，背景即 letterbox 条。
- `#design-root` 及其子节点用**设计像素**定位（`top: 24px; left: 36px` 就是设计坐标）。
- 弹窗、教程遮罩、设置页也进 `#design-root`，否则会脱离缩放。
- `html, body { overflow: hidden; width/height: 100%; margin: 0; }`。

---

## 4. CSS（最小集）

```css
:root {
  --design-scale: 1;
  --design-w: 1920px;
  --design-h: 1080px;
  --design-offset-x: 0px;
  --design-offset-y: 0px;
}

html, body {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #0a0c12; /* letterbox 条颜色 */
}

#game-root {
  position: fixed;
  inset: 0;
  background: #0a0c12;
}

#design-root,
.design-root {
  position: absolute;
  top: 0;
  left: 0;
  width: 1920px;
  height: 1080px;
  overflow: hidden;
  transform-origin: top left;
}

#game-canvas {
  position: absolute;
  inset: 0;
  width: 1920px;
  height: 1080px;
  display: block;
}
```

`transform` 由 JS 写，不要在 CSS 里写死 scale。

---

## 5. TypeScript 模块（整文件拷进 `src/config/design.ts`）

```ts
export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

export interface DesignFit {
  scale: number;
  offsetX: number;
  offsetY: number;
  usedW: number;
  usedH: number;
  viewW: number;
  viewH: number;
}

export function computeDesignFit(
  viewW = typeof window !== 'undefined' ? window.innerWidth : DESIGN_WIDTH,
  viewH = typeof window !== 'undefined' ? window.innerHeight : DESIGN_HEIGHT,
): DesignFit {
  const scale = Math.min(viewW / DESIGN_WIDTH, viewH / DESIGN_HEIGHT);
  const usedW = DESIGN_WIDTH * scale;
  const usedH = DESIGN_HEIGHT * scale;
  return {
    scale,
    offsetX: (viewW - usedW) / 2,
    offsetY: (viewH - usedH) / 2,
    usedW,
    usedH,
    viewW,
    viewH,
  };
}

export function applyDesignStage(
  rootId = 'design-root',
  viewW?: number,
  viewH?: number,
): DesignFit {
  const fit = computeDesignFit(viewW, viewH);
  const stage = document.getElementById(rootId) as HTMLElement | null;
  if (stage) {
    stage.style.width = `${DESIGN_WIDTH}px`;
    stage.style.height = `${DESIGN_HEIGHT}px`;
    stage.style.transform = `translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.scale})`;
    stage.style.transformOrigin = 'top left';
  }
  const gameRoot = document.getElementById('game-root');
  if (gameRoot) {
    gameRoot.style.setProperty('--design-scale', String(fit.scale));
    gameRoot.style.setProperty('--design-w', `${DESIGN_WIDTH}px`);
    gameRoot.style.setProperty('--design-h', `${DESIGN_HEIGHT}px`);
    gameRoot.style.setProperty('--design-offset-x', `${fit.offsetX}px`);
    gameRoot.style.setProperty('--design-offset-y', `${fit.offsetY}px`);
  }
  return fit;
}

export function clientToDesign(
  clientX: number,
  clientY: number,
  fit: DesignFit,
): { x: number; y: number } {
  return {
    x: (clientX - fit.offsetX) / fit.scale,
    y: (clientY - fit.offsetY) / fit.scale,
  };
}
```

CSS transform 顺序必须是 `translate(offset) scale(scale)`，origin 必须是 `top left`。  
数学上：屏幕点 = 设计点 × scale + offset。

启动和每次窗口变化：

```ts
const viewW = window.visualViewport?.width ?? window.innerWidth;
const viewH = window.visualViewport?.height ?? window.innerHeight;
this.fit = applyDesignStage('design-root', viewW, viewH);
```

监听：`window.resize`、`window.visualViewport.resize`、`document.fullscreenchange`。

指针：

```ts
window.addEventListener('pointermove', (e) => {
  const d = clientToDesign(e.clientX, e.clientY, this.fit);
  // d.x / d.y 才是设计坐标。世界坐标 = 设计坐标 + camera
});
```

不要用 `canvas.getBoundingClientRect()` 另算一套，除非那就是同一 fit；两套算法会漂。

---

## 6. 渲染器规则

### 2D Canvas

- **CSS 尺寸**永远 `1920×1080`（写在 `#design-root` 里，随舞台一起被 scale）。
- **Bitmap 尺寸** = `1920 * dpr` × `1080 * dpr`，`dpr = min(2, devicePixelRatio)`。
- `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` 之后，所有 `fillRect` / 绘图都用设计像素。
- **禁止** `canvas.width = window.innerWidth`。

### PixiJS（MaoMaoLingZhu 实际用法）

```ts
await app.init({
  canvas,
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  resolution: Math.min(1.25, window.devicePixelRatio || 1),
  autoDensity: true,
});
```

窗口变了只调用 `applyDesignStage`，**不要** `app.renderer.resize(innerWidth, innerHeight)`。

### 摄像机

可见世界宽高 = `DESIGN_WIDTH` × `DESIGN_HEIGHT`：

```ts
cameraX = clamp(focusX - DESIGN_WIDTH / 2, 0, mapW - DESIGN_WIDTH)
cameraY = clamp(focusY - DESIGN_HEIGHT / 2, 0, mapH - DESIGN_HEIGHT)
```

屏幕中心永远对应设计坐标 `(960, 540)`。

### 背景图

背景贴在 `#design-root` 内，`background-size: cover` 相对的是 **1920×1080**，不是窗口。这样每台机器裁切相同。

---

## 7. 禁止清单（实现时逐条自查）

1. 不要 `scaleX` / `scaleY` 分开算（那是 stretch）。
2. 不要用 `max(viewW/1920, viewH/1080)`（那是 crop/cover，会切掉边缘）。
3. 不要把 HUD 放在 `#design-root` 外面再用 `vw`/`vh`。
4. 不要对 `window` 做命中检测；先 `clientToDesign`。
5. 不要让字体用 `vw`。设计像素 `font-size: 28px` 即可，外层 scale 会带着走。
6. 不要在 resize 时改玩法常量（速度、碰撞盒）去“适应屏幕”。
7. 不要忽略 DPR：逻辑 1920×1080，像素可以 ×dpr，否则 Retina 发糊。
8. 不要把 letterbox 画进设计画布（那会让 1920×1080 里出现假黑边，HUD 不再贴齐真边缘）。
9. 工具页如果只占窗口一部分：对**容器**的宽高调用 `computeDesignFit(containerW, containerH)`，不要用整窗。

---

## 8. 其它引擎（算法相同）

### Unity uGUI

- Canvas Scaler：`Scale With Screen Size`
- Reference Resolution：`1920 × 1080`
- Screen Match Mode：`Expand`（等价 letterbox：画面完整，多出来的是空边）
- 不要用 `Match Width Or Height` 又同时让摄像机拉不同正交尺寸。
- 摄像机正交大小按 1080 设计高锁定；额外屏幕区域不要用来“多看地图”。

### Godot 4

```
display/window/size/viewport_width = 1920
display/window/size/viewport_height = 1080
display/window/stretch/mode = canvas_items
display/window/stretch/aspect = keep
```

`keep` = letterbox。不要用 `ignore`（拉伸）或 `expand`（多看见世界）。

### 原生 / 其它

任何引擎：内部 FBO / 逻辑分辨率 1920×1080，present 时 `min` 等比 + 居中。输入先减 offset 再除 scale。

---

## 9. 验收（做完必须过）

把窗口拖成 16:9、16:10、超宽、正方形：

1. 四角标记 `0,0` / `1920,0` / `0,1080` / `1920,1080` 始终在舞台四角，不被裁、不进黑边。
2. 角色不变形。
3. HUD 相对战场的位置不变。
4. 鼠标点角色脚底，设计坐标与绘制坐标一致（误差 < 1px）。
5. 黑边只出现在舞台外，颜色是 `#game-root` 背景。
6. 全屏进出后不裂开、不偏移。
7. 对照第 2 节表格，`computeDesignFit` 数字完全一致。

---

## 10. 本仓库对照

| 文件 | 作用 |
|---|---|
| `src/config/design.ts` | 算法与 `applyDesignStage` |
| `index.html` | `#game-root` > `#design-root` > canvas + HUD |
| `src/ui/styles.css` | 舞台 CSS |
| `src/app/GameApp.ts` | resize / 指针 / 1920×1080 绘图 |
| `scripts/verify-fit.mjs` | 第 2 节表格的数字回归 |

以后新游戏：把本文件发给 AI，再附一句「按 README-分辨率.md 接 letterbox，设计分辨率 1920×1080」。
