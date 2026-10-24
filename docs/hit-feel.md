# 2D 打击感方案（三轮检索）

对照页：`http://localhost:5174/feel.html`（本仓库 `feel.html`）。本笔记只整理方案，不改正式战斗代码。

现有实现：`src/render/fighterCards.ts` 的 `STRIKE`，由 `src/ui/BattleView.ts` 在棋盘结算全部结束后调用 `playStrike`。

## 为什么现在发飘

现有层已经有：蓄力、冲刺、18ms 挤压、弹簧回弹、残影、白闪、9 条弹道、−伤害泡。缺的是把“力”钉在接触帧上的另外几层。

| 层 | 现有 | 缺口 |
|---|---|---|
| 时间 | impact 0.24 → release 0.30，压缩 18ms，时间轴不停 | 无 freeze-frame / hitstop |
| 闪光 | `flashAge = elapsed - STRIKE.release` | 比接触晚 60ms |
| 镜头 | 无 | 无 trauma²、无方向 kick |
| 特效 | 固定 9 条 | 不随伤害变 |
| 声音 | 无 | 无 thump / 观众层 |
| 数字节奏 | 格子加分先走完再出拳 | 高潮错开 |
| 伤害档 | 1 与 10 同一套 | 无炉石 smash 阶梯 |

`STRIKE = { windup: 0.09, impact: 0.24, compress: 0.018, release: 0.3, end: 0.69 }`
`SETTLEMENT_IMPACT = 0.065`

## 七层（可单独开关）

### 1. 时间 · Hitstop
接触瞬间冻结双方立绘 2–10 帧（轻击 33–66ms，重击 100–160ms）。模拟停、渲染不停：闪光、粒子、镜头继续。格斗游戏把这停顿读成“咬合”。Sakurai：定格时模型可微抖，碰撞盒可脱离。

### 2. 运动 · 预备 / 挤压 / 击退
Disney 预备、挤压拉伸、跟随。我们这一层已经最完整。建议：接触挤压拉到 30–50ms；击退随伤害放大。

### 3. 镜头 · Trauma²
Eiserloh：`trauma ∈ [0,1]`，`shake = trauma²`，每帧衰减。摇镜头容器，不摇棋盘格子。接触加方向 kick。1 伤 +0.18，10 伤 +0.85，衰减约 2.4/s。

### 4. 特效 · 闪光 / 碎屑 / 冲击波
Juice it or Lose It。闪光必须从 impact 衰减，不能从 release。4 伤起尘土，8 伤冲击波，9 伤震装饰。

### 5. 声音 · 低频撞击
Nijman：低音卖重量。接触：低频 thump + 高频 click；6 伤起观众层。炉石 thwack 按伤害换层。

### 6. 数字 · 弹出时机
−伤害必须和接触同一拍。格子加分可以提前，立绘数字不能等结算条。

### 7. 伤害档 · 炉石 Smash
同一套动作，用档位加层：

1. 小刺泡 + 轻 tick
2. 闪光 + 尘土
3. 定向碎石
4. 小镜头抖
5. 碎石变多
6. 岩石变大、闪光更亮、声音变沉、观众起哄
7. 再放大一档
8. 冲击波 + 尘雾
9. 英雄框 / 棋盘装饰跟着抖
10. 上限，之后不再加层

## 推荐时值（60fps）

- 蓄力 90–110ms
- 冲刺 110–130ms（ease-in 二次）
- 接触挤压 30–50ms
- Hitstop：2–4 帧轻击，6–10 帧重击
- 闪光：从 impact 指数衰减（现有 `exp(-age*38)` 可用，起点改到 impact）
- 回弹弹簧：现有 `springDisplacement` 可保留，振幅随档位

## 来源

### 第一轮 · 基础
- Juice it or Lose It，Jonasson & Purho：https://www.youtube.com/watch?v=Fy0aCDmgnxg
- GDC Vault：https://www.gdcvault.com/play/1016487/Juice-It-or-Lose
- Juicy Breakout：http://grapefrukt.com/f/games/juicy-breakout/
- 源码：https://github.com/grapefrukt/juicy-breakout
- The Art of Screenshake，Nijman：https://www.youtube.com/watch?v=AJdEqssNZ-U
- Steve Swink《Game Feel》
- Disney 十二原则：预备、挤压拉伸、夸张、跟随

### 第二轮 · 卡牌 / 格斗
- Hearthstone smash 分解：https://www.youtube.com/watch?v=1p0mq47asnw
- 樱井政博 八种 Hit Stop：https://www.youtube.com/watch?v=tycbMSjDDLg
- What Is Hitstop?：https://www.youtube.com/watch?v=s4HKw7Hqqd0
- 炉石伤害音分层：https://www.reddit.com/r/hearthstone/comments/lb37qo/the_sounds_every_character_on_the_board_makes/

### 第三轮 · 时值与缺口
- Eiserloh trauma² 相机
- 轻击定格 2–4 帧，重击 6–10 帧，必杀 12–18 帧
- Nijman sleep 约 20ms 起；格斗常见 50–150ms
- 我们压缩 18ms 低于轻击下限；闪光从 0.30s 才起
- 结算数字高潮和拳头高潮错开
