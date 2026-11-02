# PARTY BLITZ ⚡ 三阵营派对：设计（v1）

> 全场扫码，自动分成三个阵营。每局 15 秒小游戏，大屏上三个吉祥物在派对棋盘上赛跑。
> 技术栈：Supabase（Postgres + RPC + Realtime Broadcast）+ Vite/React/TS。游戏里不接 AI，用 Claude Code 构建。

---

## 0. 硬约束（所有设计都围绕这几条）

| 约束 | 对应做法 |
|---|---|
| 只有大约 1 小时开发时间 | 按 P0 → P1 → P2 分阶段做，第 40 分钟停止加功能，开始彩排。每一步都做成"能跑的最小版本" |
| Supabase Free 版：**200 个并发 Realtime 连接**；每秒消息数 100，但按 **60 秒滚动平均**计算（见 §6） | 真正的瓶颈是连接数。**玩家上限 120**（`games.max_players`，可调），留 80 个连接余量。满员的人进入**观众模式**（只轮询 RPC，不建 Realtime 连接）。手机端输入走 RPC（HTTP）；Realtime 只做大屏 → 手机的低频广播 |
| 全场共用场馆 WiFi，出口是同一个 IP；Supabase 匿名登录每个 IP 每小时只有 30 次（已查文档） | **不用 Supabase Auth**。玩家身份用 `localStorage` 里的 uuid |
| 名字会显示在大屏上 | 名字**由服务端在 `join_game` 里随机生成**（形容词 + 食物），客户端不能传名字。没有"换一个"按钮 |
| 节奏要快 | 每轮固定 15 秒，自动推进。所有计时以**服务端时间戳**为准，不依赖广播到达的时刻 |

---

## 1. 整体流程

```
大厅（扫码加入，名字飞进阵营；60–90 秒）
  → 第 1 轮 ⚡ 狂点冲刺
  → 第 2 轮 🎯 精准停止
  → 第 3 轮 🤔 少数派
  → 第 4 轮 ✊ 阵营猜拳
  → 第 5 轮 ⚡ 狂点冲刺（决赛：前进格数 ×2）
  → 颁奖（获胜阵营 + 个人 MVP 前三）
```
游戏本体 5 × 15s + 颁奖 15s ≈ **1.5 分钟**，加上大厅约 3 分钟。
P2 没做完时流程改成 `mash → stop → mash → stop → mash（决赛）`。

---

## 2. 阵营

| id | 名称 | 吉祥物 | 主色 | 亮色 | 深色 |
|---|---|---|---|---|---|
| 0 | 熔岩 | 🐲 | `#FF4D3D` | `#FFB199` | `#8A1A10` |
| 1 | 深海 | 🐙 | `#2F7BFF` | `#9CC3FF` | `#0F2E73` |
| 2 | 森林 | 🦊 | `#22C55E` | `#A7F3C0` | `#0E5A2B` |

- 分配方式：`faction = nextval('join_seq') % 3`，三个阵营人数差最多 1
- **阵营得分永远按人均计算**（分母是阵营**全部**成员数，不是提交人数），所以人数不均也公平，也没法靠"少交卷"刷分

---

## 3. 每轮 15 秒的时间分配

```
0s ── 2s ─────────────── 12s ─ 13s ──── 15s
│INTRO│        PLAY (10s)      │收卷│ 结果动画 │
```
- **INTRO（2s）**：大屏和手机同时显示一个动词大字：「狂点！」「停在中间！」「选人少的！」「出拳！」
- **PLAY（10s）**：玩游戏
- **收卷（1s）**：大屏显示「时间到！」，等迟到的提交进来（服务端宽限期也是 1s）。结束时大屏读取全部输入、计分、广播 `result`
- **结果动画（2s）**：阵营排名 → 棋子跳格 → 本轮 MVP。可以和下一轮 INTRO 重叠
- 开发模式 `?fast=1`：缩短为 1s / 4s / 0.5s / 1s

**时间同步（以服务端时间为准）**
1. `join_game` 返回 `server_now`。手机算出 `offset = server_now - Date.now()`，之后所有倒计时都用 `Date.now() + offset`
2. 大屏调用 `start_round` 时，服务端写入 `starts_at`（= now + intro）和 `ends_at`（= starts_at + play），并返回
3. 大屏广播 `round`，带上 `starts_at`、`ends_at`。手机不管这条广播什么时候到，都按这两个时间戳切换阶段和倒数
4. 服务端在 `ends_at + 1s` 之内仍接受提交

---

## 4. 棋盘

- 一条赛道，共 **20 格**，从第 0 格出发。三个棋子可以停在同一格（并排显示）。**P0 先做直线赛道**（一排格子），蜿蜒赛道放 P2
- 每轮按阵营排名前进：**第 1 名 3 格，第 2 名 2 格，第 3 名 1 格**；并列时取较高的格数。决赛轮翻倍
- 特殊格子，**只在停在上面时触发，不连锁**（触发后落到的格子不再触发）：
  - ⭐ 星星格：第 3、7、11、15 格，再前进 1 格
  - 🚀 加速格：第 5、13 格，再前进 2 格
  - 💥 陷阱格：第 9、17 格，后退 2 格
- 到第 20 格封顶（冲线，撒彩带），不会超出赛道
- **胜负：位置最远的阵营获胜**；位置相同算并列冠军。规则只有这一句，观众一眼能看懂

> v0 里"星星多者胜"的规则去掉了：星星数和位置几乎总是一致，但偶尔不一致时大屏上领先的棋子反而没赢，观众会看不懂；而且"经过也算、后退算不算"这类边界会多出不少测试和代码

---

## 5. 小游戏规格

所有输入都通过 `submit_input(round_id, player_id, value)` 提交（见 §7）。

### ⚡ 狂点冲刺 `mash`
- **手机**：半屏大小的按钮，在本地累计点击次数，**每 1000ms 提交一次累计值**（首次提交的时机随机错开 0–1000ms，避免全场同步请求），PLAY 结束时再强制提交一次。大屏每 250ms 汇总一次，120 人错开提交后画面依然是连续的
- **服务端**：`value = greatest(旧值, 新值)`，重复提交也不会出错（幂等）。反作弊：`value` 不能超过 `30 × 已进行秒数 + 10`（每秒 30 次点击是人类上限）
- **阵营得分**：总点击数 ÷ 阵营人数
- **个人 MVP**：点击次数最多的 3 个人
- **大屏**：三个吉祥物在跑道上赛跑，位置 = 阵营人均点击数 ÷ 当前最高值。脚下的尘土粒子随速度增加。领先者换人时**震屏**并闪出"超车！"；结束时冲线撒彩带

### 🎯 精准停止 `stop`
- **手机**：一个指针在条形区域来回摆动（速度会逐渐加快）。每人只能点一次，**在本地算出偏差** `|pos - 0.5| * 2`（0 表示正中，1 表示最边上），然后只提交这个偏差值
- **阵营得分**：`1 - 人均偏差`，没提交的人按偏差 1 计算
- **个人 MVP**：偏差最小的 3 个人
- **大屏**：一个大靶子，每收到一个提交，就有一支飞镖从屏幕外射到对应的环上。颜色代表阵营，靶心附近的飞镖显示名字。最后，最准的那支飞镖放大，并显示名字

### 🤔 少数派 `minority`
- **题目**：从预设题库（6 道就够，一局只用 1 道）里随机抽一道三选一的题，例如「早餐：kaya toast / nasi lemak / 不吃」
- **手机**：三个大按钮，可以改选，以最后一次为准
- **判定**：**按全场所有人**的统计找出选的人最少的选项（不是按阵营内部统计）。多个选项并列最少时都算对；没人提交的选项不参与比较
- **阵营得分**：阵营里选对的成员 ÷ 阵营人数
- **个人 MVP**：从选对的人里，按最早提交的时间取前 3 名
- **大屏**：三根透明管子，每个答案变成一颗阵营颜色的小球掉进去叠起来。PLAY 阶段**不显示数字**，揭晓时人最少的那根管子爆出彩带

### ✊ 阵营猜拳 `rps`
- **手机**：✊ ✋ ✌️ 三个按钮，投票给自己阵营的出拳
- **阵营出拳** = 阵营内得票最多的选项（平票时按 ✊ → ✋ → ✌️ 的顺序选；阵营没人投票时也按这个顺序取 ✊）
- **阵营得分** = 击败的阵营数（0–2）。三方出同一种拳，或者三种拳都有，都算全部平局
- **个人 MVP**：从获胜阵营中，按最早投票的时间取 3 人
- **大屏**：PLAY 阶段显示三个阵营各自的实时投票条。RESULT 阶段三只巨大的拳头从三个方向砸向中间，赢家的拳头把输家砸扁

### 排名规则（所有小游戏通用）
按阵营得分从高到低排名。并列判定：`|a - b| <= 0.01 × max(a, b)`（猜拳是整数分，只有相等才并列）。某个阵营一个人都没有时得分记 0。

---

## 6. 架构

```
           ┌──────────── 手机（玩家）──────────────┐
           │ join_game RPC（一次，拿到名字和 server_now）│
           │ submit_input RPC（低频）  ──HTTP──┐   │
           │ get_state RPC（每 2s 兜底轮询）     │   │
           │ 订阅 channel game:{id}（只收不发）│   │
           └──────────────▲────────────────────┼───┘
                          │ Broadcast：每轮 2 条
┌─────────────────────────┴───────┐     ┌──────▼──────────────┐
│ 大屏（唯一裁判，host，带 host_key） │     │ Supabase Postgres    │
│ · 驱动阶段计时器                    │◀───▶│ games / players /    │
│ · start_round / set_game_state RPC  │ RPC │ rounds / inputs      │
│ · 每 250ms 调用 round_live RPC      │     └─────────────────────┘
│ · 收卷后读取全部 inputs，            │
│   用纯函数计分，写回 games.state     │
│ · ?bots=N 模拟玩家                   │
└─────────────────────────────────┘
```

**Realtime 配额（已查文档和源码，见 README §4）**
- 连接数：最多 120 台手机 + 1 个大屏 = 121，低于 Free 版的 200。**这是唯一真正的硬限制**
- 消息计数：一次广播 = 1 条发送 + 每个订阅者 1 条接收。120 人时一次广播算 **121 条**
- 每秒 100 条的限制按 **60 秒滚动平均**计算（服务端 5 秒一桶、12 桶取平均），也就是每分钟预算 6000 条。本设计每轮广播 2 次，每分钟最多 4 轮 → 8 × 121 ≈ **970 条/分钟，约 16 条/秒**，余量 6 倍
- 超限的后果是连接被断开（supabase-js 会自动重连）。所以**不要**再加每秒一次的进度广播；大厅阶段也不广播，人数由大屏通过 RPC 读取
- 手机端绝对不订阅 Postgres Changes，也不发送 Broadcast

**RPC 负载估算（120 人）**
- 狂点：120 人 × 每秒 1 次 = 120 请求/秒，持续 10 秒。每次是一行 upsert
- 兜底轮询：120 人 × 每 2 秒 1 次 = 60 请求/秒，只读一行
- 大屏：每秒 4 次 `round_live`
- Free 版是 Nano 实例（共享 CPU），这个量级应该没问题但**没实测**。负载测试（§12）要看 RPC 的 p95；超过 300ms 就把狂点提交间隔改成 2000ms

**手机端的健壮性**
- 页面回到前台（`visibilitychange`）或 Realtime 重连后，立刻调用 `get_state` 对齐状态
- `status = playing` 期间每 2s 轮询一次 `get_state` 兜底：漏掉一条广播最多晚 2 秒跟上
- 请求 Screen Wake Lock（`navigator.wakeLock`），避免大厅等待时锁屏断线；失败就忽略
- 观众模式（满员后）：不建 Realtime 连接，每 3s 轮询 `get_state`，显示三阵营实时位置和「为 🐲 加油！」

---

## 7. 数据模型与 RPC

```sql
create sequence join_seq;

create table games (
  id          uuid primary key default gen_random_uuid(),
  host_key    text not null,                   -- 随机串，大屏 URL 里带 ?key=，host RPC 都要校验
  status      text not null default 'lobby',   -- lobby | playing | finished
  max_players int  not null default 120,
  round_idx   int  not null default -1,
  state       jsonb not null default '{}'::jsonb, -- 棋子位置 / MVP 积分 / 最近一轮结果，由 host 写入
  created_at  timestamptz default now()
);

create table players (
  id        uuid primary key,                  -- 客户端生成，存在 localStorage
  game_id   uuid references games(id),
  nickname  text not null,                     -- 服务端生成
  faction   smallint not null check (faction between 0 and 2),
  joined_at timestamptz default now()
);

create table rounds (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid references games(id),
  idx       int not null,
  kind      text not null,                     -- mash | stop | minority | rps
  options   jsonb,                             -- 少数派题目等
  starts_at timestamptz not null,              -- PLAY 开始（服务端时间）
  ends_at   timestamptz not null,              -- PLAY 结束
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

-- 四张表全部 enable row level security，不建任何 policy：anon 不能直接读写
-- 所有 RPC 都是 security definer，grant execute to anon
```

**玩家 RPC**
- `join_game(p_game uuid, p_player uuid) → {faction, nickname, server_now} | {full: true, server_now}`
  - 如果 `p_player` 已经存在，返回原来的阵营和名字（刷新页面或重新扫码不会换阵营，也不占新名额）
  - 人数达到 `max_players` 时返回 `{full: true}`。用 `pg_advisory_xact_lock(hashtext(p_game::text))` 保证并发加入时不会超限
  - 否则 `nextval('join_seq') % 3` 分配阵营，名字从 SQL 里的两个数组随机拼出（形容词 × 食物，各 20 个左右），加入后名字不变
  - bot 也通过这个 RPC 加入，会占用名额，所以正式 demo 前要**重置游戏**（新建一行 games）
- `submit_input(p_round uuid, p_player uuid, p_value float8) → void`
  - `now() > ends_at + 1s` 时拒绝；`now() < starts_at` 时也拒绝
  - `kind = mash`：`value = least(greatest(old, new), 30 × extract(epoch from now() - starts_at) + 10)`；其他游戏覆盖旧值。保留最早的 `first_at`
- `get_state(p_game uuid) → {status, round_idx, round: {id, kind, options, starts_at, ends_at} | null, counts: [n0, n1, n2], state, server_now}`
  - 手机进入页面、重连、以及每 2s 兜底时调用；观众模式每 3s 调用

**大屏 RPC（都要带 `p_key`，和 `games.host_key` 不一致就报错）**
- `create_game(p_key text) → {game_id}`：新建一局（主持人面板的"重置游戏"也是它）
- `start_round(p_game, p_key, p_idx, p_kind, p_options, p_intro_ms, p_play_ms) → {round_id, starts_at, ends_at}`：插入 rounds 一行并把 `games.status` 设为 playing、`round_idx` 设为 p_idx
- `round_inputs(p_round, p_key) → [{player_id, nickname, faction, value, first_at}]`：收卷后读一次，交给 `scoring.ts`
- `round_live(p_round, p_key) → [{faction, n, sum}]`：每 250ms 调用，画实时动画。人均 = sum ÷ 阵营人数（人数来自 `get_state.counts`）
- `set_game_state(p_game, p_key, p_status, p_state jsonb) → void`：写回棋子位置、MVP、最近一轮结果；颁奖时把 status 设为 finished

计分**在大屏用 TypeScript 纯函数完成**（`src/scoring.ts`，有单元测试），结果写回 `games.state`，手机兜底轮询时也能从 `state` 里拿到最近一轮结果。

**Realtime 频道 `game:{id}` 的事件**（只有大屏发送）
```ts
// 每轮只发两次。手机按 starts_at / ends_at（服务端时间）切换阶段
{ type: 'round',  round_idx, round_id, kind, options?, starts_at, ends_at }
{ type: 'result', round_idx, ranks: [r0, r1, r2], scores, moves, positions, mvp: [{nick, faction, value}] }
{ type: 'final',  winner, positions, mvp_top3 }
// 大厅阶段不广播。大屏的人数通过 get_state 读取
```
频道是公开频道，任何拿到 anon key 的人都能往里发消息。这个风险接受（现场是开发者，而且骗不到分数，计分只看数据库）。

---

## 8. 视觉设计（大屏）

**风格**：明亮、扁平、粗描边、圆角，像派对游戏一样夸张，每个元素都会弹跳。
- 舞台固定为 **1920×1080**，按比例缩放适配任何屏幕。深紫色背景 `#1B1033`，加上缓慢移动的彩色光斑
- 字体（Google Fonts）：中文用 **ZCOOL KuaiLe**，数字和英文用 **Baloo 2**
- 动画：**GSAP**（弹跳、跳格、震屏；3.13 起全部插件免费）+ **canvas-confetti** + Canvas 2D 粒子（尘土、飞镖、小球）
- 音效：**Web Audio API 现场合成**，不使用任何素材文件。需要的音效：加入的"啵"、倒计时滴答、开始号角、点击、超车、飞镖击中、跳格落地、星星、陷阱、胜利。浏览器要求先有用户手势才能出声，主持人点"开始游戏"那一下就是手势，在那里初始化 AudioContext

**画面要做到的效果（每个画面都要检查一遍）**
- [ ] 元素出现时先放大到 1.2 倍再回弹到 1（`back.out`）
- [ ] 每个重要时刻都有"一大字 + 一音效 + 一粒子效果"
- [ ] 领先者换人或踩到陷阱时，震屏 300ms
- [ ] 大屏上要出现**玩家自己的名字**：加入大厅时、飞镖上、本轮 MVP
- [ ] 吉祥物一直在动：待机时上下浮动，领先时变大，落后时流汗 💦
- [ ] 数字变化要滚动显示，不要直接跳到新数值

**各个画面**
1. **大厅**：左边是巨大的二维码（占画面高度一半以上）和一个**短网址**（主持人会念出来）；右边是三个吉祥物站在台上，新玩家的名字像泡泡一样飞进对应阵营；顶部显示「87 / 120」，数字在滚动。快满员时显示"最后 N 个名额！"；满员时二维码上盖一个"满员"印章，并提示「没抢到的打开同一个网址可以围观」
2. **INTRO**：全屏阵营色的斜条纹扫过，中间是游戏图标和动词大字，配合 3-2-1 的缩放效果
3. **小游戏画面**：见 §5
4. **RESULT 与棋盘**：棋盘占画面下方 2/3；三个吉祥物沿抛物线一格一格跳过去，每次落地有挤压回弹；顶部显示排名条和本轮 MVP 卡片
5. **颁奖**：获胜阵营的吉祥物放大到画面中央，彩带不断落下；下方显示个人 MVP 前三的领奖台

**手机端**
- 整个背景是阵营色，顶部显示「你是 🐲 熔岩 · 勇敢的榴莲」
- 状态：等待中 → INTRO（动词大字）→ 游戏操作 → 本轮个人反馈：显示自己的成绩（本地就有）和阵营本轮排名（来自 `result`）；如果自己在 MVP 前三，整屏闪金色「全场前三 🏆」
- 满员时：观众模式，显示「名额已满 🙈 看大屏为你的朋友加油！」和三阵营实时位置
- 按钮占满半个屏幕，点击时有波纹效果。Android 用 `navigator.vibrate` 震动
- 禁止双击缩放和长按选中文字（`touch-action: manipulation; user-select: none`）

---

## 9. 主持人面板与 bot 模式

大屏地址：`/screen?g=<game_id>&key=<host_key>`。首次打开没有参数时，调用 `create_game` 新建一局并把参数写进地址栏。

右下角有一个半透明面板，按 `H` 键显示或隐藏：
- 按钮：**开始游戏**、**暂停/继续**、**跳过当前阶段**、**重置游戏**（新建一局、换二维码）
- 显示：在线人数、RPC 平均耗时、最近的错误
- 网址参数：
  - `?bots=60`：在大屏浏览器里生成 60 个 bot，**调用真实的 `join_game` 和 `submit_input`**。每个 bot 有随机的反应时间和水平。bot 不订阅 Realtime（由大屏直接通知它们），所以不占连接数
  - `?fast=1`：开发模式的短节奏
- **bot 模式同时也是现场的保底方案**：如果 WiFi 出问题，直接开 bot 模式继续 demo
- 大屏标签页必须保持在前台：浏览器会对后台标签页的计时器限速

---

## 10. 项目结构

```
/                  手机端（扫码进入，?g=<game_id>）
/screen            大屏（host）
src/
  supabase.ts      客户端
  time.ts          服务端时间偏移（offset）和倒计时
  scoring.ts       四个小游戏的计分函数 + 排名 + 棋盘移动（纯函数）
  scoring.test.ts  vitest 单元测试
  board.ts         棋盘格子定义
  questions.ts     少数派题库（6 道）
  host/            大屏：阶段机、各个画面、bot、主持人面板
  phone/           手机端：各个游戏的操作界面、观众模式
  sfx.ts           Web Audio 音效
supabase/migrations/001_init.sql
scripts/load-test.ts   用 Node 模拟 N 个 Realtime 客户端加 RPC 提交
```

---

## 11. 开发阶段（时间是指开场后的分钟数）

| 阶段 | 内容 | 截止 |
|---|---|---|
| **P-1** | `npm create vite` 脚手架 + 两个空路由 + `vercel --prod` 部署一次，确认手机能打开公网地址；Supabase 项目已建好、`.env` 已填 | **5 分钟** |
| **P0** 竖切一刀 | 迁移和全部 RPC；手机加入并显示阵营和名字；大屏大厅（二维码 + 名字泡泡 + 人数）；阶段机 + `round`/`result` 广播 + 时间同步；⚡ 狂点冲刺（手机按钮 + 大屏赛跑）；RESULT 画面：排名条 + **直线**棋盘跳格；`?bots=N`；`scoring.ts` 里 mash + 排名 + 棋盘的测试 | **30 分钟** |
| **P1** | 🎯 精准停止 + 飞镖雨；颁奖画面；音效；观众模式；再部署一次，用真实手机走一遍 | **40 分钟，然后停止加功能** |
| **P2** | 🤔 少数派；✊ 猜拳；蜿蜒赛道；震屏、流汗等细节 | 只在还有时间时做 |
| 彩排 | 请旁边 3–5 个人扫码完整玩一局；用 `?bots=100` 跑一局看大屏会不会卡；修问题；最后 `vercel --prod` | **最后 15 分钟** |

每个阶段结束都要 `vercel --prod` 一次（约 1 分钟），不要等到最后才部署。

---

## 12. 测试计划

1. **单元测试**（`scoring.ts`）：排名平票、某个阵营没有人、棋盘特殊格子不连锁、20 格封顶、决赛翻倍；P2 做了再补：猜拳三方相同或三方不同、少数派多个选项并列最少
2. **多玩家流程**：大屏打开 `?bots=60&fast=1`，再开 3 个无痕窗口加上自己的手机当真人玩家
3. **负载测试**（P0 完成后在另一个会话里做）：`scripts/load-test.ts` 开 **120 个** Realtime 连接，按狂点频率调用 RPC。记录：连接成功率、**每次广播的送达率**（120 个客户端是否都收到）、广播到达延迟 p50/p95、RPC p50/p95 和错误率。再加入第 121 个玩家，确认返回 `full`
4. **真实环境**：自己的手机通过 4G 和场馆 WiFi 各走一遍；锁屏 30 秒再解锁，确认能自动跟上

---

## 13. 开场前检查清单

- [ ] 建好 Supabase 项目，**区域选新加坡**。Free 版够用（上限 120）；如果想让全场都能玩，见 README §6 的 Pro 选项
- [ ] 本地 `.env` 里有 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`
- [ ] Supabase CLI 已 `supabase login` 并 link 到项目；Vercel CLI 已登录，项目名想好（网址越短越好）
- [ ] 问 AV 工作人员：笔记本能否连接投影，**声音能否接到会场音响**
- [ ] 大屏二维码用前端生成，指向部署后的网址加 `?g=<game_id>`

## 14. Demo 流程（约 3.5 分钟）

1. **0:00**：一句话介绍「全场分三个阵营，用手机打派对游戏，120 个名额先到先得，没抢到也能围观」，显示二维码并**念出短网址**。大厅留 **60–90 秒**（扫码、加载页面、名字飞进来，大屏本身就是节目）
2. **1:30**：开始。5 轮 × 15 秒，你只需要喊气氛，不用解释规则
3. **2:50**：颁奖，获胜阵营欢呼
4. **3:10**：切一张架构图：「120 人同时在线，没有自己的游戏服务器；Postgres RPC 负责输入和计分，Realtime Broadcast 负责同步；用 Claude Code 在 1 小时内做出来」

## 15. 风险与预案

| 风险 | 预案 |
|---|---|
| 某条广播没送到（手机锁屏、WiFi 抖动） | 手机每 2s 轮询 `get_state` 兜底，最多晚 2 秒跟上；回到前台时立即对齐 |
| 刷新页面或重复扫码占用多个名额 | `join_game` 按 localStorage 里的 player id 判断，同一台手机只占一个名额 |
| 场馆 WiFi 很慢 | 让大家用 4G；实在不行就用 bot 模式 demo |
| RPC p95 超过 300ms | 狂点提交间隔改成 2000ms；兜底轮询改成 4s |
| 有人伪造请求刷分 | 狂点总数封顶 `30 × 秒数 + 10`；名字由服务端生成；host RPC 要 `host_key` |
| 大屏浏览器卡顿 | 粒子数量设上限，超过 300 支飞镖时合并显示；彩排时用 `?bots=100` 看帧率 |
| 没抢到名额的人觉得无聊 | 观众模式能看到实时比分；主持人口头说「下一局换你们」（时间允许就再开一局） |
