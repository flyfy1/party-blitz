# PARTY BLITZ ⚡ 三阵营派对：基础设计

> 全场扫码，自动分成三个阵营。每局 15 秒小游戏，大屏上三个吉祥物在派对棋盘上抢星星。
> 技术栈：Supabase（Postgres + RPC + Realtime Broadcast）+ Vite/React/TS。游戏里不接 AI，用 Claude Code 构建。

---

## 0. 硬约束（所有设计都围绕这几条）

| 约束 | 对应做法 |
|---|---|
| 只有大约 1 小时开发时间 | 按 P0 → P1 → P2 分阶段做，第 40 分钟停止加功能，开始彩排 |
| Supabase Free 版有 200 个 Realtime 连接、每秒 100 条消息的限制 | **玩家人数上限 120**（`games.max_players`，可调整），留出 80 个连接的余量。满员的人只看到"已满，请看大屏"，**不建立 Realtime 连接**。手机端的输入**走 RPC（HTTP）**，不走 Realtime。Realtime 只用来做大屏 → 手机的低频广播 |
| 所有人共用场馆 WiFi，出口是同一个 IP | **不用 Supabase Auth，包括匿名登录**，因为按 IP 限流，会把全场挡在门外。玩家身份用 `localStorage` 里的 uuid |
| 名字会显示在大屏上 | **不允许自己输入昵称**，只能用随机生成的名字（形容词 + 食物），可以点"换一个"重新抽 |
| 节奏要快 | 每轮固定 15 秒，自动推进，Claude 和网络请求都不能阻塞流程 |

---

## 1. 整体流程

```
大厅（扫码加入，名字飞进阵营）
  → 第 1 轮 ⚡ 狂点冲刺
  → 第 2 轮 🎯 精准停止
  → 第 3 轮 🤔 少数派
  → 第 4 轮 ✊ 阵营猜拳
  → 第 5 轮 ⚡ 狂点冲刺（决赛：前进格数 ×2）
  → 颁奖（获胜阵营 + 个人 MVP 前三）
```
总时长 ≈ 大厅 30s + 5 × 15s + 颁奖 15s ≈ **2 分钟**。

---

## 2. 阵营

| id | 名称 | 吉祥物 | 主色 | 亮色 | 深色 |
|---|---|---|---|---|---|
| 0 | 熔岩 | 🐲 | `#FF4D3D` | `#FFB199` | `#8A1A10` |
| 1 | 深海 | 🐙 | `#2F7BFF` | `#9CC3FF` | `#0F2E73` |
| 2 | 森林 | 🦊 | `#22C55E` | `#A7F3C0` | `#0E5A2B` |

- 分配方式：`faction = nextval('join_seq') % 3`，三个阵营人数差最多 1
- **阵营得分永远按人均计算**，所以人数不均也公平

---

## 3. 每轮 15 秒的时间分配

```
0s ── 2s ─────────────── 12s ─── 15s
│INTRO│        PLAY (10s)      │RESULT│
```
- **INTRO（2s）**：大屏和手机同时显示一个动词大字：「狂点！」「停在中间！」「选人少的！」「出拳！」
- **PLAY（10s）**：玩游戏
- **RESULT（3s）**：显示阵营排名 → 棋子跳格 → 显示本轮 MVP。和下一轮的 INTRO 动画可以重叠播放
- 开发模式 `?fast=1`：缩短为 1s / 4s / 1s

**时间同步**：每轮开始时，大屏只广播一次 `round`，带上 `intro_ms` 和 `play_ms`。手机收到后按本地时间切换阶段并倒数，不依赖设备时钟。服务端在 `ends_at` 之后再多接受 **500ms** 内的提交，作为宽限期。

---

## 4. 棋盘

- 一条蜿蜒的赛道，共 **20 格**，从第 0 格出发。三个棋子可以停在同一格（并排显示）
- 每轮按阵营排名前进：**第 1 名 3 格，第 2 名 2 格，第 3 名 1 格**；并列时取较高的格数。决赛轮翻倍
- 特殊格子：
  - ⭐ 星星格：第 3、7、11、15、19 格，**经过或停在上面**都 +1 颗星
  - 💥 陷阱格：第 9、17 格，**停在上面**后退 2 格
  - 🚀 加速格：第 5、13 格，**停在上面**再前进 2 格（不触发连锁）
- 胜负：**星星多的阵营获胜**；星星相同就看位置；位置也相同就算并列冠军

---

## 5. 小游戏规格

所有输入都通过 `submit_input(round_id, player_id, value)` 提交（见第 7 节）。

### ⚡ 狂点冲刺 `mash`
- **手机**：半屏大小的按钮，在本地累计点击次数，**每 500ms 提交一次累计值**，结束时再强制提交一次
- **服务端**：`value = greatest(旧值, 新值)`，重复提交也不会出错（幂等）
- **阵营得分**：总点击数 ÷ 阵营人数
- **个人 MVP**：点击次数最多的 3 个人
- **大屏**：三个吉祥物在跑道上赛跑，位置 = 阵营人均点击数 ÷ 当前最高值。脚下的尘土粒子随速度增加。领先者换人时**震屏**并闪出"超车！"；结束时冲线撒彩带

### 🎯 精准停止 `stop`
- **手机**：一个指针在条形区域来回摆动（速度会逐渐加快）。每人只能点一次，**在本地算出偏差** `|pos - 0.5| * 2`（0 表示正中，1 表示最边上），然后只提交这个偏差值
- **阵营得分**：`1 - 人均偏差`，没提交的人按偏差 1 计算
- **个人 MVP**：偏差最小的 3 个人
- **大屏**：一个大靶子，每收到一个提交，就有一支飞镖从屏幕外射到对应的环上。颜色代表阵营，靶心附近的飞镖显示名字。最后，最准的那支飞镖放大，并显示名字

### 🤔 少数派 `minority`
- **题目**：从预设题库里随机抽一道三选一的题，例如「早餐：kaya toast / nasi lemak / 不吃」
- **手机**：三个大按钮，可以改选，以最后一次为准
- **阵营得分**：阵营里选了"人数最少选项"的成员比例。如果有多个选项并列最少，都算对
- **个人 MVP**：从选对的人里，按最早提交的时间取前 3 名
- **大屏**：三根透明管子，每个答案变成一颗阵营颜色的小球掉进去叠起来。PLAY 阶段**不显示数字**，揭晓时人最少的那根管子爆出彩带

### ✊ 阵营猜拳 `rps`
- **手机**：✊ ✋ ✌️ 三个按钮，投票给自己阵营的出拳
- **阵营出拳** = 阵营内得票最多的选项（平票时按 ✊ → ✋ → ✌️ 的顺序选）
- **阵营得分** = 击败的阵营数（0–2）。三方出同一种拳，或者三种拳都有，都算全部平局
- **个人 MVP**：从获胜阵营中，按最早投票的时间取 3 人
- **大屏**：PLAY 阶段显示三个阵营各自的实时投票条。RESULT 阶段三只巨大的拳头从三个方向砸向中间，赢家的拳头把输家砸扁

### 排名规则（所有小游戏通用）
按阵营得分从高到低排名；得分相差在 1% 以内算并列。

---

## 6. 架构

```
           ┌──────────── 手机（玩家）──────────────┐
           │ join_game RPC（一次）                │
           │ submit_input RPC（低频）  ──HTTP──┐   │
           │ 订阅 channel game:{id}（只收不发）│   │
           └──────────────▲────────────────────┼───┘
                          │ Broadcast：每个阶段一条
┌─────────────────────────┴───────┐     ┌──────▼──────────────┐
│ 大屏（唯一裁判，host）             │     │ Supabase Postgres    │
│ · 驱动阶段计时器                    │◀───▶│ players / rounds /   │
│ · 每 250ms 调用 round_live RPC      │ RPC │ inputs / games       │
│ · 本轮结束读取全部 inputs，          │     └─────────────────────┘
│   用纯函数计分，把状态写回 games       │
│ · ?bots=N 模拟玩家                   │
└─────────────────────────────────┘
```

**配额估算（120 名玩家上限）**
- 连接数：最多 120 台手机 + 1 个大屏 = 121，低于 Free 版的 200
- Realtime 消息：**每轮只广播 2 次**：
  - `round` 在 INTRO 开始时发出，带上 intro 和 play 的时长，手机自己计算什么时候进入 PLAY
  - `result` 在 PLAY 结束时发出
  - 两次广播至少相隔 2 秒，平均约 **16 条/秒**
- ⚠️ **还不确定的地方**：如果 Supabase 把一次广播按接收者数量计费，那么一次广播就是 120 条，会超过 Free 版每秒 100 条的上限。所以：
  - 大厅阶段**不做定时广播**，大屏的人数通过 RPC 读取
  - 负载测试时（第 12 节）用 120 个客户端验证广播能否全部送达
  - 如果有消息丢失，把 `max_players` 降到 90，或者让手机每秒调用一次 `get_state` 作为补充
- RPC：狂点时 120 人 × 每秒 2 次 = 240 请求/秒，持续 10 秒，压力在 Postgres 上，没有问题
- **手机端绝对不订阅 Postgres Changes，也不发送 Broadcast**

---

## 7. 数据模型与 RPC

```sql
create sequence join_seq;

create table games (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'lobby',   -- lobby | playing | finished
  max_players int  not null default 120,       -- 留出 Realtime 连接余量（Free 版上限 200）
  round_idx   int  not null default -1,
  state       jsonb not null default '{}'::jsonb, -- 棋子位置 / 星星 / MVP 积分，由 host 写入
  created_at  timestamptz default now()
);

create table players (
  id        uuid primary key,                  -- 客户端生成，存在 localStorage
  game_id   uuid references games(id),
  nickname  text not null,
  faction   smallint not null check (faction between 0 and 2),
  joined_at timestamptz default now()
);

create table rounds (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid references games(id),
  idx       int not null,
  kind      text not null,                     -- mash | stop | minority | rps
  options   jsonb,                             -- 少数派题目等
  starts_at timestamptz,                       -- PLAY 开始时间
  ends_at   timestamptz,                       -- PLAY 结束时间
  unique (game_id, idx)
);

create table inputs (
  round_id   uuid references rounds(id),
  player_id  uuid references players(id),
  faction    smallint not null,
  value      double precision not null,
  first_at   timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (round_id, player_id)
);
```

**RPC**（全部用 `security definer`；anon 角色只能执行这些函数，不能直接读写表）
- `join_game(p_game uuid, p_player uuid, p_nick text) → {faction} | {full: true}`
  - 如果 `p_player` 已经存在，就返回原来的阵营（重新扫码或刷新页面时不会换阵营，也不占用新名额）
  - 如果人数已经达到 `max_players`，返回 `{full: true}`。用 `pg_advisory_xact_lock` 保证并发加入时不会超过上限
  - 否则用 `nextval('join_seq') % 3` 分配阵营
  - bot 也通过这个 RPC 加入，会占用名额，所以正式 demo 时不要开启 bot
- `submit_input(p_round uuid, p_player uuid, p_value float8) → void`
  - 如果 `now() > ends_at + interval '500 ms'` 就拒绝
  - 狂点：`value = greatest(old, new)`；其他游戏：覆盖旧值。保留最早的 `first_at`
- `get_state(p_game uuid) → {status, round, players_by_faction}`：手机进入页面或断线重连时调用
- `round_live(p_round uuid) → [{faction, n, sum, avg}]`：大屏每 250ms 调用一次，用来画实时动画
- 计分**在大屏用 TypeScript 纯函数完成**（`src/scoring.ts`，有单元测试），结果写回 `games.state`

**Realtime 频道 `game:{id}` 的事件**（只有大屏发送）
```ts
// 每轮只发两次。手机收到 round 后，按 intro_ms 自己切换到 PLAY，再按 play_ms 倒数
{ type: 'round', round_idx, round_id, kind, intro_ms, play_ms, options? }
{ type: 'result', round_idx, ranks, moves, stars, mvp: [{nick, faction, value}] }
{ type: 'final', winner, stars, mvp_top3 }
// 大厅阶段不广播。大屏的人数通过 get_state RPC 读取
```

---

## 8. 视觉设计（大屏）

**风格**：明亮、扁平、粗描边、圆角，像派对游戏一样夸张，每个元素都会弹跳。
- 舞台固定为 **1920×1080**，按比例缩放适配任何屏幕。深紫色背景 `#1B1033`，加上缓慢移动的彩色光斑
- 字体（Google Fonts）：中文用 **ZCOOL KuaiLe**，数字和英文用 **Baloo 2**
- 动画：**GSAP**（弹跳、跳格、震屏）+ **canvas-confetti** + Canvas 2D 粒子（尘土、飞镖、小球）
- 音效：**Web Audio API 现场合成**，不使用任何素材文件。需要的音效：加入的"啵"、倒计时滴答、开始号角、点击、超车、飞镖击中、跳格落地、星星、陷阱、胜利

**画面要做到的效果（每个画面都要检查一遍）**
- [ ] 元素出现时先放大到 1.2 倍再回弹到 1（`back.out`）
- [ ] 每个重要时刻都有"一大字 + 一音效 + 一粒子效果"
- [ ] 领先者换人或踩到陷阱时，震屏 300ms
- [ ] 大屏上要出现**玩家自己的名字**：加入大厅时、飞镖上、本轮 MVP
- [ ] 吉祥物一直在动：待机时上下浮动，领先时变大，落后时流汗 💦
- [ ] 数字变化要滚动显示，不要直接跳到新数值

**各个画面**
1. **大厅**：左边是巨大的二维码和网址；右边是三个吉祥物站在台上，新玩家的名字像泡泡一样飞进对应阵营；顶部显示「87 / 120」，数字在滚动。**快满员时显示"最后 N 个名额！"，制造紧迫感**；满员时二维码上盖一个"满员"印章
2. **INTRO**：全屏阵营色的斜条纹扫过，中间是游戏图标和动词大字，配合 3-2-1 的缩放效果
3. **小游戏画面**：见第 5 节
4. **RESULT 与棋盘**：棋盘占画面下方 2/3；三个吉祥物沿抛物线一格一格跳过去，每次落地有挤压回弹；顶部显示排名条和本轮 MVP 卡片
5. **颁奖**：获胜阵营的吉祥物放大到画面中央，彩带不断落下；下方显示个人 MVP 前三的领奖台

**手机端**
- 整个背景是阵营色，顶部显示「你是 🐲 熔岩 · 勇敢的榴莲」
- 状态：等待中 → INTRO（动词大字）→ 游戏操作 → 本轮个人反馈（例如「你点了 47 下，阵营第 3 名 🔥」）
- 满员时：显示「名额已满 🙈 看大屏为你的朋友加油！」，**不订阅 Realtime**
- 按钮占满半个屏幕，点击时有波纹效果。Android 用 `navigator.vibrate` 震动
- 禁止双击缩放和长按选中文字（`touch-action: manipulation; user-select: none`）

---

## 9. 主持人面板与 bot 模式

大屏页面右下角有一个半透明面板，按 `H` 键显示或隐藏：
- 按钮：**开始游戏**、**暂停/继续**、**跳过当前阶段**、**重置游戏**
- 显示：在线人数、RPC 平均耗时、最近的错误
- 网址参数：
  - `?bots=60`：在大屏浏览器里生成 60 个 bot，**调用真实的 `join_game` 和 `submit_input`**。每个 bot 有随机的反应时间和水平
  - `?fast=1`：开发模式的短节奏
- **bot 模式同时也是现场的保底方案**：如果 WiFi 出问题，直接打开 bot 模式继续 demo

---

## 10. 项目结构

```
/                  手机端（扫码进入）
/screen            大屏（host）
src/
  supabase.ts      客户端
  scoring.ts       四个小游戏的计分函数 + 排名 + 棋盘移动（纯函数）
  scoring.test.ts  vitest 单元测试
  board.ts         棋盘格子定义
  questions.ts     少数派题库（15 道以上）
  names.ts         随机名字（形容词 × 食物）
  host/            大屏：阶段机、各个画面、bot、主持人面板
  phone/           手机端：各个游戏的操作界面
  sfx.ts           Web Audio 音效
supabase/migrations/001_init.sql
scripts/load-test.ts   用 Node 模拟 N 个 Realtime 客户端加 RPC 提交
```

---

## 11. 开发阶段（时间是指开场后的分钟数）

| 阶段 | 内容 | 截止时间 |
|---|---|---|
| **P0** | 数据库迁移和 RPC；手机加入并显示阵营；大屏大厅（名字泡泡）；阶段机加 Broadcast；⚡ 狂点冲刺加赛跑画面；棋盘跳格和星星；bot 模式；`scoring.ts` 的测试 | **约 30 分钟** |
| **P1** | 🎯 精准停止加飞镖雨；颁奖画面；音效；部署到 Vercel，用真实手机测试 | **约 40 分钟，然后停止加功能** |
| **P2** | 🤔 少数派；✊ 猜拳；陷阱和加速格；震屏、流汗等细节 | 只在还有时间时做 |
| 彩排 | 请旁边的 3–5 个人扫码完整玩一局；用 bot 模式跑一局；修复发现的问题 | 最后 15 分钟 |

如果 P2 没做完，流程就改成 `mash → stop → mash → stop → mash（决赛）`。

---

## 12. 测试计划

1. **单元测试**：`scoring.ts` 的边界情况，包括平票、某个阵营没有人、猜拳三方相同或三方不同、少数派多个选项并列最少、棋盘的陷阱和加速、星星的"经过也算"
2. **多玩家流程**：大屏打开 `?bots=60&fast=1`，再开 3 个无痕窗口加上你自己的手机当真人玩家
3. **负载测试**：`scripts/load-test.ts` 开 **120 个** Realtime 连接，模拟狂点频率调用 RPC。记录连接成功率、**广播送达率**（每次广播是否 120 个客户端都收到）、广播到达延迟、RPC 的 p95 耗时。另外再测一次第 121 个玩家加入时是否返回 `full`
4. **真实环境**：用自己的手机通过 4G 和场馆 WiFi 各测一次

---

## 13. 开场前检查清单

- [ ] 建好 Supabase 项目，**区域选新加坡**。Free 版就够用，因为人数上限是 120
- [ ] 在本地准备好 `.env`，填入 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`
- [ ] 安装 Supabase CLI 并完成 `supabase login`；Vercel CLI 也要登录
- [ ] 问 AV 工作人员：笔记本能否连接投影，**声音能否接到会场音响**
- [ ] 准备二维码：大屏上的二维码直接用前端生成，指向部署后的网址

## 14. Demo 流程（3 分钟）

1. **0:00**：一句话介绍「全场分三个阵营，用手机打派对游戏，只有 120 个名额，先到先得」，然后显示二维码。大约 30 秒内，人数和名字泡泡不断增加，直到满员
2. **0:30**：开始。5 轮 × 15 秒，你只需要在旁边喊气氛，不用解释规则
3. **2:00**：颁奖，获胜阵营欢呼
4. **2:20**：切换到一张架构图：「120 人同时在线，没有自己的游戏服务器；Postgres RPC 负责计分，Realtime Broadcast 负责同步；用 Claude Code 在 1 小时内做出来」

## 15. 风险与预案

| 风险 | 预案 |
|---|---|
| 广播被 Free 版每秒 100 条的限制丢弃 | 把 `max_players` 降到 90；同时手机端每秒调用一次 `get_state` 作为补充，漏掉的广播也能跟上 |
| 刷新页面或重复扫码占用多个名额 | `join_game` 按 localStorage 里的 player id 判断，同一台手机只占一个名额 |
| 场馆 WiFi 很慢 | 让大家用 4G；实在不行就用 bot 模式 demo |
| RPC 压力太大 | 狂点的提交间隔改成 1000ms |
| 有人刷数据 | 狂点每 500ms 的增量上限设为 15（大约等于每秒 30 次点击），超过的部分截断 |
| 大屏浏览器卡顿 | 粒子数量设上限，超过 300 支飞镖时合并显示 |
