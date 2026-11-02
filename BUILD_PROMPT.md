# 开场后直接粘贴给 Claude Code 的 prompt（v2）

---

请阅读本目录的 `DESIGN.md`，然后实现「PARTY BLITZ 三阵营派对」。时间只有大约 1 小时，按下面的顺序做，**每完成一个阶段都要能跑起来**，不要一次写完才运行。遇到设计文档没写清楚的地方，选最简单的做法并继续，不要停下来问我。

**技术栈**：Vite + React + TypeScript，`@supabase/supabase-js`，GSAP，canvas-confetti，qrcode，vitest。**不装路由库**：单入口，`location.search` 里有 `screen=1` 就渲染大屏，否则渲染手机端。手机地址 `/?g=<game_id>`，大屏地址 `/?screen=1&g=<game_id>&key=<host_key>`。环境变量 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 已经写在 `.env` 里，部署方式是本地 `npm run build` 后把 `dist/` 推上去。

**必须遵守的约束**（详见 DESIGN.md §0、§6、§7）：
- **所有界面文字一律英文**（按钮、大字、提示、随机名字、主持人面板、错误信息）。阵营叫 Lava / Ocean / Forest，动词大字是 "MASH!" / "STOP IN THE MIDDLE!" / "PICK THE MINORITY!" / "THROW!"
- 不使用 Supabase Auth。玩家 id 是存在 localStorage 里的 uuid（读写 `try/catch`）
- 名字由 `join_game` 在服务端随机生成（形容词 + 食物 + `#两位数`），客户端不传名字
- 手机端只调用 RPC，只订阅 `game:{id}` 的 Broadcast；**不发送 Broadcast，也不订阅 Postgres Changes**
- 所有倒计时以服务端时间为准：`src/time.ts` 用 RPC 返回的 `server_now` 和半个 RTT 算 offset，大屏和手机共用；`round` 广播带 `starts_at`/`ends_at`
- 大屏的阶段机用 `requestAnimationFrame` 比较服务端时间切换阶段，不用 `setTimeout` 链；host RPC 失败重试 2 次，仍失败就用最近一次 `round_live` 的数据继续，**阶段机不能卡住**
- 大屏是唯一的裁判：调用 `create_game`/`list_players`/`start_round`/`round_live`/`set_game_state`（都要带 `host_key`），计分用 `src/scoring.ts` 里的纯函数。打开后立刻用 `history.replaceState` 把 `key` 从地址栏移到 `sessionStorage`；带 `g` 重新打开时先 `get_state`，playing 状态就从 `state.positions` 恢复
- 狂点按钮用 `pointerdown` 计数，每 1000ms 提交一次累计值（首次随机错开），结束时强制提交一次；所有 `submit_input` 失败重试 3 次
- 手机全程轮询 `get_state`（大厅 3s、比赛 2s）；`visibilitychange` 回前台时 `get_state` 并重建频道
- 玩家上限 120（`games.max_players`）。满员的人进入观众模式，**不建立 Realtime 连接**
- 每轮只广播两次（`round` 和 `result`），大厅阶段不广播。所有带名字的 payload 都附 `player_id`
- 四张表都 enable RLS 且不建 policy；anon 只能执行 `security definer` 的 RPC。迁移必须可以反复执行（`if not exists` / `create or replace`）。遇到 `Could not find the function ... in the schema cache` 就执行 `notify pgrst, 'reload schema'` 再重试
- 大屏"开始游戏"按钮在频道 `SUBSCRIBED` 之前是灰的；开始前先发一条测试广播

**P-1（5 分钟内）**
1. 脚手架、单入口两个占位组件、`npm run build`、部署一次。告诉我公网地址，我用手机打开 `/`、用笔记本打开 `/?screen=1` 确认

**P0（做完就是一场完整的 demo）**
1. `supabase/migrations/001_init.sql`：建表（`players` 主键是 `(game_id, id)`）、sequence、RLS、全部 RPC（玩家：`join_game`、`submit_input`、`get_state`；大屏：`create_game`、`list_players`、`start_round`、`round_live`、`set_game_state`），`submit_input` 按 `kind` 校验范围。写好之后告诉我怎么执行
2. `src/scoring.ts` 和 `scoring.test.ts`：狂点计分、竞争排名（1% 容差，1,1,3 式）、棋盘移动（特殊格子只在停下时触发且不连锁，20 格封顶，全平局各走 1 格，决赛翻倍）。运行 `vitest` 确认通过
3. `src/schedule.ts = ['mash', 'mash', 'mash']`，最后一项是决赛
4. 手机端：加入游戏 → 全屏阵营色 + 名字 → 等待 → 收到 `round` 后按服务端时间戳切换到狂点界面 → 收到 `result` 后显示自己的成绩和阵营排名 → 收到 `final` 显示结果
5. 大屏：无 `g` 时 `create_game` 并把参数写进地址栏 → 大厅（二维码 + 新玩家名字列表 + 人数，每 1s `list_players`）→ 15 秒阶段机（intro 2s / play 10s / 收卷 1.2s / 结果 1.8s）→ 狂点冲刺赛跑画面（每 250ms `round_live`）→ 排名条 + **直线**棋盘位置更新 → 三轮后**极简颁奖**（赢家吉祥物放大 + 彩带 + MVP 三个名字），`set_game_state` 写 `status = finished`
6. 主持人面板（按 `H`：开始、跳过阶段、重置）和 `?bots=N`、`?fast=1` 参数。bot 走真实的 `join_game`/`submit_input`，但不订阅 Realtime

完成 P0 后停下来，告诉我怎么验证，然后 build + 部署。

**P1**：🎯 精准停止和飞镖雨；`schedule` 换成 `['mash','stop','mash','stop','mash']`；名字泡泡飞入、数字滚动、棋子抛物线跳格；`src/sfx.ts` 三个音效（滴答、号角、胜利，首次 `pointerdown`/`keydown` 解锁 AudioContext）；观众模式；再部署。

**P2**：🤔 少数派、✊ 阵营猜拳（连同它们的计分测试，猜拳最后 3 秒遮住投票条）、蜿蜒赛道、震屏和流汗等细节。

**视觉要求**：严格按 DESIGN.md §8 来做。舞台固定 1920×1080 并按比例缩放；每个重要时刻都要有"一大字 + 一粒子效果"；元素出现时要弹跳；大屏上要出现玩家自己的名字；手机端 `body` 按 §8 禁掉缩放、橡皮筋和长按。

---

## 备用：负载测试（P0 完成后在另一个会话里执行）

请写 `scripts/load-test.ts`：用 Node 开 N 个（默认 120）supabase-js 客户端。每个客户端先调用 `join_game`，再订阅 `game:{id}`；收到 `kind=mash` 的 `round` 后，按 `starts_at` 开始，每 1000ms 调用一次 `submit_input`，到 `ends_at` 停止。最后输出：连接成功数、**每次广播的送达率**（收到的客户端数 ÷ N）、广播到达延迟的 p50 和 p95、RPC 的 p50、p95 和错误率。再额外加入第 121 个玩家，确认返回 `{full: true}`。结束时 `removeAllChannels()` 并 `process.exit(0)`，不要留下连接。
