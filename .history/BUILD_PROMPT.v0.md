# 开场后直接粘贴给 Claude Code 的 prompt

---

请阅读本目录的 `DESIGN.md`，然后实现「PARTY BLITZ 三阵营派对」。时间只有大约 1 小时，按下面的顺序做，**每完成一个阶段都要能跑起来**，不要一次写完才运行。

**技术栈**：Vite + React + TypeScript，`@supabase/supabase-js`，GSAP，canvas-confetti，qrcode，vitest。路由只有两个：`/`（手机端）和 `/screen`（大屏）。环境变量 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 已经写在 `.env` 里。

**必须遵守的约束**（详见 DESIGN.md 第 0 节和第 6 节）：
- 不使用 Supabase Auth。玩家 id 是存在 localStorage 里的 uuid
- 手机端只调用 RPC，只订阅 `game:{id}` 的 Broadcast；**不发送 Broadcast，也不订阅 Postgres Changes**
- 大屏是唯一的裁判：负责驱动阶段计时器，计分用 `src/scoring.ts` 里的纯函数
- 名字只能随机生成，不能自己输入
- 玩家上限 120（`games.max_players`）。满员的人看到提示页，**不建立 Realtime 连接**
- 每轮只广播两次（`round` 和 `result`），大厅阶段不广播
- anon 角色只能执行 RPC（`security definer`），不能直接读写表

**P0（先做到能跑）**
1. `supabase/migrations/001_init.sql`：建表、sequence、四个 RPC，以及权限设置。写好之后告诉我怎么执行（可以用 `supabase db push`，或者在 SQL editor 里粘贴）
2. `src/scoring.ts` 和 `scoring.test.ts`：实现四个小游戏的计分、排名、棋盘移动（⭐ 经过也算，💥 陷阱，🚀 加速，决赛翻倍），并覆盖 DESIGN.md 第 12 节列出的边界情况。运行 `vitest` 确认全部通过
3. 手机端：加入游戏 → 全屏阵营色 → 等待 → 根据 Broadcast 切换到对应的游戏界面（先做狂点冲刺）
4. 大屏：大厅（二维码 + 名字泡泡 + 人数滚动）→ 15 秒阶段机（intro 2s / play 10s / result 3s）→ 狂点冲刺赛跑画面 → 棋盘跳格
5. 主持人面板（按 `H` 键显示）和 `?bots=N`、`?fast=1` 参数

完成 P0 后停下来，告诉我怎么验证。

**P1**：🎯 精准停止和飞镖雨、颁奖画面、`src/sfx.ts` 音效、部署到 Vercel。

**P2**：🤔 少数派、✊ 阵营猜拳、震屏和流汗等细节。

**视觉要求**：严格按 DESIGN.md 第 8 节来做。舞台固定 1920×1080 并按比例缩放；每个重要时刻都要有"一大字 + 一音效 + 一粒子效果"；元素出现时要弹跳；大屏上要出现玩家自己的名字。

---

## 备用：负载测试（P0 完成后在另一个会话里执行）

请写 `scripts/load-test.ts`：用 Node 开 N 个（默认 120）supabase-js 客户端。每个客户端先调用 `join_game`，再订阅 `game:{id}`；收到 `kind=mash` 的 `round` 后，等 `intro_ms`，然后每 500ms 调用一次 `submit_input`。最后输出：连接成功数、**每次广播的送达率**（收到的客户端数 ÷ N）、广播到达延迟的 p50 和 p95、RPC 的 p50、p95 和错误率。再额外加入第 121 个玩家，确认返回 `{full: true}`。
