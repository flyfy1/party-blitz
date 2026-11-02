# 开场后直接粘贴给 Claude Code 的 prompt（v1）

---

请阅读本目录的 `DESIGN.md`，然后实现「PARTY BLITZ 三阵营派对」。时间只有大约 1 小时，按下面的顺序做，**每完成一个阶段都要能跑起来**，不要一次写完才运行。遇到设计文档没写清楚的地方，选最简单的做法并继续，不要停下来问我。

**技术栈**：Vite + React + TypeScript，`@supabase/supabase-js`，GSAP，canvas-confetti，qrcode，vitest。路由只有两个：`/`（手机端，`?g=<game_id>`）和 `/screen`（大屏，`?g=<game_id>&key=<host_key>`）。环境变量 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 已经写在 `.env` 里。

**必须遵守的约束**（详见 DESIGN.md §0、§6、§7）：
- 不使用 Supabase Auth。玩家 id 是存在 localStorage 里的 uuid
- 名字由 `join_game` 在服务端随机生成，客户端不传名字
- 手机端只调用 RPC，只订阅 `game:{id}` 的 Broadcast；**不发送 Broadcast，也不订阅 Postgres Changes**
- 所有倒计时以服务端时间为准：`join_game` 返回 `server_now`，手机算出 offset；`round` 广播带 `starts_at`/`ends_at`
- 大屏是唯一的裁判：驱动阶段计时器，调用 `start_round`/`round_inputs`/`set_game_state`（都要带 `host_key`），计分用 `src/scoring.ts` 里的纯函数
- 狂点每 1000ms 提交一次累计值（首次随机错开），结束时强制提交一次
- 手机在 playing 期间每 2s 调用 `get_state` 兜底；回到前台时也调用
- 玩家上限 120（`games.max_players`）。满员的人进入观众模式，**不建立 Realtime 连接**
- 每轮只广播两次（`round` 和 `result`），大厅阶段不广播
- 四张表都 enable RLS 且不建 policy；anon 只能执行 `security definer` 的 RPC

**P-1（5 分钟内）**
1. 脚手架、两个空路由、`vercel --prod` 部署一次。告诉我公网地址，我用手机确认能打开

**P0（先做到能跑）**
1. `supabase/migrations/001_init.sql`：建表、sequence、RLS、全部 RPC（玩家：`join_game`、`submit_input`、`get_state`；大屏：`create_game`、`start_round`、`round_inputs`、`round_live`、`set_game_state`）。写好之后告诉我怎么执行（`supabase db push`，或者在 SQL editor 里粘贴）
2. `src/scoring.ts` 和 `scoring.test.ts`：先实现狂点计分、通用排名（1% 并列）、棋盘移动（特殊格子只在停下时触发且不连锁，20 格封顶，决赛翻倍）。运行 `vitest` 确认通过
3. 手机端：加入游戏 → 全屏阵营色 + 名字 → 等待 → 收到 `round` 后按服务端时间戳切换到狂点界面 → 收到 `result` 后显示自己的成绩和阵营排名
4. 大屏：无参数打开时 `create_game` 并把 `g`/`key` 写进地址栏 → 大厅（二维码 + 名字泡泡 + 人数滚动）→ 15 秒阶段机（intro 2s / play 10s / 收卷 1s / 结果 2s）→ 狂点冲刺赛跑画面 → 排名条 + **直线**棋盘跳格
5. 主持人面板（按 `H`）和 `?bots=N`、`?fast=1` 参数。bot 走真实的 `join_game`/`submit_input`，但不订阅 Realtime

完成 P0 后停下来，告诉我怎么验证，然后 `vercel --prod`。

**P1**：🎯 精准停止和飞镖雨、颁奖画面、`src/sfx.ts` 音效（在"开始游戏"的点击里初始化 AudioContext）、观众模式、再部署。

**P2**：🤔 少数派、✊ 阵营猜拳（连同它们的计分测试）、蜿蜒赛道、震屏和流汗等细节。

**视觉要求**：严格按 DESIGN.md §8 来做。舞台固定 1920×1080 并按比例缩放；每个重要时刻都要有"一大字 + 一音效 + 一粒子效果"；元素出现时要弹跳；大屏上要出现玩家自己的名字。

---

## 备用：负载测试（P0 完成后在另一个会话里执行）

请写 `scripts/load-test.ts`：用 Node 开 N 个（默认 120）supabase-js 客户端。每个客户端先调用 `join_game`，再订阅 `game:{id}`；收到 `kind=mash` 的 `round` 后，按 `starts_at` 开始，每 1000ms 调用一次 `submit_input`，到 `ends_at` 停止。最后输出：连接成功数、**每次广播的送达率**（收到的客户端数 ÷ N）、广播到达延迟的 p50 和 p95、RPC 的 p50、p95 和错误率。再额外加入第 121 个玩家，确认返回 `{full: true}`。
