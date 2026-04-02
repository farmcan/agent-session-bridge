# Phaser Room Layout Reference

目标：给 `session story` 找可借鉴的现成方向，优先看“房间布局 / 小人移动 / 游戏内 HUD / 像素感”，避免继续自己硬画网页式 UI。

## 结论先看

最值得优先借鉴的不是单一 repo，而是这组组合：

1. `phaserjs/examples`
作用：定游戏镜头、tilemap、camera follow、pixel art 的正确范式。

2. `blopa/top-down-react-phaser-game-template`
作用：看“房间地图 + top-down 小人 + 对话 / 菜单”的整体组织方式。

3. `rexrainbow/phaser3-rex-notes`
作用：拿现成的游戏内 `dialog / textbox / menu / HUD` 组件，不再自己拼 DOM 面板。

4. `mikewesthad/navmesh`
作用：如果要让 agent 在房间和走廊之间自然走路，用它做 pathfinding，比手写 tween 强很多。

如果只选一个“最接近你要的房间布局方向”，目前最像的是：

- `blopa/top-down-react-phaser-game-template`

如果只选一个“最适合借 Phaser 味道和镜头语言”的基础：

- `phaserjs/examples`

## 选项 A

### `blopa/top-down-react-phaser-game-template`

- GitHub: https://github.com/blopa/top-down-react-phaser-game-template
- Demo: https://blopa.github.io/top-down-react-phaser-game-template/
- Stars: `60`
- 适合度：`高`

为什么值得看：

- 它本身就是 `top-down` 地图风格，不是网页里塞 canvas。
- README 里直接写了 `Dialog system`、`Game menu`、`Tilesets`、`map`。
- 最接近“一个角色在地图上走，到不同区域互动”的产品形态。

更关键的是，它有现成的效果图素材：

- README GIF：
  - `https://raw.githubusercontent.com/blopa/top-down-react-phaser-game-template/main/source_files/game_sample.gif`

本地截图：

- [blopa-topdown-demo.png](/tmp/kage-shot-check/blopa-topdown-demo.png)

我的判断：

- 这是当前最像“房间布局 + 小人移动 + 对话”的起点。
- 不足是 star 不高，而且它把 UI 放在 React 层，不是纯 Phaser 内 HUD。
- 但地图和角色组织方式很值得借。

## 选项 B

### `phaserjs/examples`

- GitHub: https://github.com/phaserjs/examples
- 官方示例站：https://phaser.io/examples
- Stars: `1.6k`
- 适合度：`高`

为什么值得看：

- 这是官方最标准的 Phaser 风格库。
- 真正要借的不是“它的 UI 长啥样”，而是：
  - `pixel art`
  - `camera follow`
  - `tilemap`
  - `sprite movement`
  - `HUD 放在 scene 内`

我已经筛过几个最相关页面：

- Pixel Art Mode
  - https://phaser.io/examples/v3.85.0/game-config/view/pixel-art-mode
- Follow Zoom Tilemap
  - https://phaser.io/examples/v3.85.0/camera/view/follow-zoom-tilemap
- Follow Sprite Small Bounds
  - https://phaser.io/examples/v3.85.0/camera/view/follow-sprite-small-bounds

本地截图：

- [phaser-official-pixel-art.png](/tmp/kage-shot-check/phaser-official-pixel-art.png)
- [phaser-official-follow-tilemap.png](/tmp/kage-shot-check/phaser-official-follow-tilemap.png)
- [phaser-official-follow-sprite.png](/tmp/kage-shot-check/phaser-official-follow-sprite.png)

我的判断：

- 这是“味道最正”的基础。
- 但它不是现成完整项目，你不能直接拿来当最终产品。
- 更像视觉和镜头语言参考源。

## 选项 C

### `rexrainbow/phaser3-rex-notes`

- GitHub: https://github.com/rexrainbow/phaser3-rex-notes
- Docs: https://rexrainbow.github.io/phaser3-rex-notes/docs/site/
- Plugin list: https://rexrainbow.github.io/phaser3-rex-notes/docs/site/plugin-list/
- Stars: `1.3k`
- 适合度：`中高`

为什么值得看：

- 这不是一个完整游戏模板，而是一大套 Phaser UI / text / menu / dialog 生态。
- 你不该自己画网页面板时，它非常有价值。
- 比较 relevant 的是：
  - `Dialog`
  - `Text box`
  - `Menu`
  - `Scrollable`
  - `Notification`
  - `Tabs`

本地截图：

- [rex-ui-dialog-doc.png](/tmp/kage-shot-check/rex-ui-dialog-doc.png)
- [rex-ui-textbox-doc.png](/tmp/kage-shot-check/rex-ui-textbox-doc.png)

适合怎么用：

- 地图和房间用 Phaser scene / tilemap
- 对话气泡、当前事件卡、剧情 HUD 用 Rex 的现成组件

我的判断：

- 它不能单独解决“房间布局”问题。
- 但它非常适合解决“不要自己造 UI 轮子”这个核心诉求。

## 选项 D

### `mikewesthad/navmesh`

- GitHub: https://github.com/mikewesthad/navmesh
- Demo: https://www.mikewesthad.com/navmesh/demo/
- Docs: https://www.mikewesthad.com/navmesh/docs/
- Stars: `374`
- 适合度：`中高`

为什么值得看：

- 这不是视觉库，是移动逻辑库。
- 它能让角色在房间和走廊之间“按路径走”，不像我之前只是线性 tween。
- README 里有现成效果图：
  - `https://raw.githubusercontent.com/mikewesthad/navmesh/master/doc-source/single-following-agent.gif`
  - `https://raw.githubusercontent.com/mikewesthad/navmesh/master/doc-source/combined.png`

适合怎么用：

- 如果最终做成“房间地图 + 走廊 + AI 去不同 tool 房间执行任务”
- 这个库很适合接在 tilemap 之后

我的判断：

- 它解决“走路像真的”。
- 不解决视觉风格。
- 适合作为第二阶段增强，不一定是第一阶段必须接。

## 我建议的组合

### 方案 1

`phaserjs/examples` + `blopa template` + `rexrainbow`

适合目标：

- 快速做出“像一个真小游戏”的 session replay
- 有房间布局
- 有小人走动
- 有游戏内 HUD

我推荐度：`最高`

### 方案 2

`phaserjs/examples` + `rexrainbow` + `navmesh`

适合目标：

- 更 Phaser 原生
- UI 完全不靠 DOM
- 后面路径表现更高级

我推荐度：`高`

### 方案 3

只借 `phaserjs/examples`

适合目标：

- 先把方向纠正
- 先别引太多依赖

问题：

- 你还是会很快开始自己补 UI 和路径逻辑
- 风险是又回到“自己乱画”

## 我的建议

如果你现在要拍板一个参考方向，我建议直接选：

- `A + B + C`

具体就是：

- 地图布局借 `blopa`
- 镜头和像素感借 `phaserjs/examples`
- HUD / dialog / textbox 借 `rexrainbow`

如果你后面明确要“AI 小人沿真实路径去 tool 房间”，再加：

- `D navmesh`

## 你可以怎么选

如果你更在意“房间地图感”，选：

- `A`

如果你更在意“Phaser 原生味道”，选：

- `B`

如果你更在意“不要自己再画 UI”，选：

- `C`

如果你更在意“角色走路像真的”，选：

- `D`

## 参考来源

- Phaser examples repo: https://github.com/phaserjs/examples
- Phaser examples stars / repo info: https://github.com/phaserjs/examples
- Blopa template repo and demo: https://github.com/blopa/top-down-react-phaser-game-template
- Rex plugins repo: https://github.com/rexrainbow/phaser3-rex-notes
- Navmesh repo: https://github.com/mikewesthad/navmesh
