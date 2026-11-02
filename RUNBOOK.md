# 上台主持手册（RUNBOOK）

给台上主持人用。每一步都按 `app/src/host/` 里已提交的代码核对过。

## 一次性设置：主持口令（只做一次）

只有知道口令的人能新开一局。口令**不写进代码仓库**。

1. 在 Supabase 的 SQL Editor 里执行一次，把 `<口令>` 换成你自己的：
   ```sql
   insert into host_admin (secret) values ('<口令>') on conflict do nothing;
   ```
2. 本机跑 bot 脚本、冒烟测试或负载测试时，还要在 `app/.env` 里加一行（这个文件不会提交）：
   ```
   PB_HOST_ADMIN=<口令>
   ```

## 0. 开场前（提前 10 分钟）

1. 笔记本接好大屏，**接上网**（场馆 WiFi，备一个手机热点）。
2. 用 Chrome 打开：
   ```
   https://party-blitz.vercel.app/?screen=1
   ```
   - **这台笔记本第一次打开时**，会出现 `Host passphrase` 输入框。输入口令，点 **Create game** 或按回车。口令会记在这台笔记本的浏览器里，以后不用再输。
   - 口令错误时，页面会只显示 "Hosts only. Scan the QR code on stage to play."，不再出现输入框。这时按 `Cmd + Option + J` 打开控制台，执行下面这行，再刷新页面重新输入：
     ```js
     localStorage.removeItem('pb:admin')
     ```
   - 没有口令的人打开这个地址，看到的也是这句 "Hosts only"，无法开局。
   - 口令正确后会自动新建一局，地址栏变成 `/?screen=1&g=<game_id>`。
   - host key 只存在**这个标签页**的 sessionStorage 里，地址栏里看不到。
   - **整场都用这一个标签页，不要关掉它，也不要把地址复制到新标签页或新窗口。** 新标签页拿不到 host key，会显示 "Missing host key"。
3. 进全屏：点大厅右上角的 **⛶ Fullscreen** 按钮，或者面板里同名的按钮。也可以在 macOS 上按 `Ctrl + Cmd + F`（Windows 上按 `F11`）。
4. **Host panel 默认是收起的**，只在左下角显示一个 ⚙ 圆按钮。按 `H` 或点 ⚙ 展开，点面板右上角的 **—** 或再按 `H` 收起。展开后确认这几项：
   - `Channel` 显示绿色的 `SUBSCRIBED`。在此之前开始按钮是灰的，显示 `Waiting for channel (...)`。
   - `Players` 是 0，`Phase` 是 `lobby`。
5. **点一下屏幕或按一下键盘**，这样声音才会解锁（浏览器要求先有一次交互）。按 `H` 本身也算。
6. **选轮次预设**：面板里有三个按钮，只在大厅阶段出现，默认选中 **All games (7)**。按钮下面那一行是**实际会玩的轮次**，例如 `7 rounds: stop → quiz → react → minority → hold → rps → mash (last ×2)`，以这一行为准。选择会记在这个标签页里，刷新后还在。
7. 想先自己试一遍：拿手机扫码加入，看名字是否飞进大屏的阵营卡片。正式开始前按第 5 节**重置**，换一局干净的。

## 1. 大厅：扫码（60–90 秒）

1. 按 `H` **把面板收起来**，让观众只看到二维码。收起后左下角只剩一个半透明的 ⚙。
2. 大屏左边是二维码，下面是短网址 `party-blitz.vercel.app`。右边三张阵营卡片会实时冒出玩家名字，顶部是 `人数 / 120`。
3. 可以这样说：
   > "Grab your phone and scan the QR code. You'll be thrown into one of three factions: Lava, Ocean or Forest. 120 spots, first come first served. If it says full, keep the page open and cheer as a spectator."
4. 念一遍短网址。剩最后 10 个名额时，大屏会显示 `Last N spots!`。满员后二维码上会盖 `FULL` 章。
5. 留 **60–90 秒**，等名字基本不再增加。

## 2. 开始比赛（自动进行，每轮约 15 秒）

1. 按 `H` 展开面板，点 **Start game**，再按 `H` 收起。
2. **只需要点这一次。** 后面的轮次会自动一轮接一轮地跑，每轮约 15 秒：2 秒介绍、10 秒比赛、1.2 秒收卷、1.8 秒结果和棋盘移动。
3. **轮次预设**（开始前在面板里选，见第 0 节第 6 步）。每套预设里每种小游戏**最多出现一次**，最后一轮固定是 `mash` 决赛，前进格数 ×2：

   | 预设 | 轮次 |
   |---|---|
   | **All games (7)**（默认） | `stop` → `quiz` → `react` → `minority` → `hold` → `rps` → `mash` |
   | **Classic 5** | `stop` → `minority` → `rps` → `quiz` → `mash` |
   | **Random 6** | 从其余 6 种里随机抽 5 种（不重复），最后固定是 `mash` |

   每个小游戏的大字和你可以喊的话：

   | 小游戏 | 大屏大字 | 你可以喊 |
   |---|---|---|
   | ⚡ Tap Frenzy `mash` | `MASH!` | "Mash! Mash! Both thumbs!" |
   | 🎯 Perfect Stop `stop` | `STOP IN THE MIDDLE!` | "One tap only. Stop it dead centre!" |
   | 🤔 Minority Wins `minority` | `PICK THE MINORITY!` | "Don't pick the popular answer. Think about what everyone else will pick!" |
   | ✊ Faction RPS `rps` | `THROW!` | "Vote your faction's hand. The bars go dark for the last 3 seconds!" |
   | 🧠 Quiz `quiz` | `QUIZ!` | "One answer, no changing. Fast and right wins MVP!" |
   | ⏱️ Hold `hold` | `HOLD FOR 5 SECONDS!` | "Press, count to five in your head, let go. No peeking!" |
   | 🟢 React `react` | `TAP ON GREEN!` | "Wait for it… wait for it… don't jump the gun!" |
   | 最后一轮 | 加上 `FINAL ×2` | "Final round, double points! Everything you've got!" |

4. 你只需要喊气氛，不用讲规则，大屏和手机上都有提示。结果画面出来时可以念一下领先的阵营。
5. **比赛中也能加入**：比赛中大屏**左上角**一直有一个小二维码，写着 `Scan to join late`。迟到的人扫码后会等到下一轮开始再加入。可以提一句：
   > "Just arrived? Scan the little QR code in the corner, you'll join from the next round."
6. 某个阶段卡住时，按 `H`，点 **Skip phase**：
   - 在介绍、比赛或收卷阶段点，会直接结算这一轮。
   - 在结果画面点，会直接进入下一轮。

## 3. 颁奖

1. 最后一轮结束后会自动进入颁奖画面：`<阵营> WINS!`、获胜吉祥物、三个阵营的格数，还有 MVP 前三名，彩带会一直撒。
2. 可以这样说：
   > "Congratulations, [faction]! And our MVPs: [three names on screen]."
3. 颁奖画面会一直停着，结果已写进数据库，刷新后仍然显示这个画面。

## 4. 架构收尾

1. 在**同一个标签页**里打开：
   ```
   https://party-blitz.vercel.app/arch.html
   ```
   比赛已经结束，离开大屏页面不影响什么。
2. 可以这样说：
   > "120 phones online at the same time, and we run no game server of our own. Postgres RPCs take every input and enforce the rules, Realtime Broadcast keeps everyone in sync, and the browser on this screen is the referee. Built in one hour with Claude Code."
3. 投票页：`https://party-blitz.vercel.app/vote.html`

## 5. 出问题时

**大屏刷新了，或者浏览器卡死后刷新**
- 在**同一个标签页**里刷新就行。大屏会从数据库恢复棋盘位置和 MVP 积分，回到大厅画面，底部显示 `Game in progress – press H and continue from round N`。
- 按 `H`，点 **Continue: round N**，从下一轮继续。刷新时正在进行的那一轮会重新玩一遍，之前完成的轮次不受影响。
- 手机端不用做任何事。
- 如果刷新时比赛已经结束，会直接显示颁奖画面。

**大屏标签页被关掉了，或者显示 "Missing host key"**
- 这一局已经无法再控制了。重新打开 `https://party-blitz.vercel.app/?screen=1` 开一局新的，请大家**重新扫码**。

**场馆 WiFi 挂了，玩家连不上**
- bot 也走真实的 Supabase 请求，所以**笔记本本身必须能上网**：先把笔记本切到手机热点。
- 然后在大屏标签页打开：
  ```
  https://party-blitz.vercel.app/?screen=1&bots=100
  ```
  这会新开一局，大屏里自动跑 100 个 bot，它们会正常加入阵营、狂点、停针。面板里的 `Bots` 一行显示加入进度，等它接近 `100/100` 再点 Start game。
- 可以这样说："The Wi-Fi gave up, so here are 100 bots playing exactly the same game through Supabase."
- 注意：bot 和真人共用 120 个名额。

**要换一局干净的（排练后、或想再玩一局）**
- 按 `H`，点 **Reset game**，再点 **Confirm reset (new game + QR)**。会新建一局，二维码也会换掉。
- 旧那局的手机不会自动跳过去，请大家**重新扫码**。
- 如果当前地址里带着 `bots=100`，重置后的新局也会带 bot。想要不带 bot 的干净一局，直接打开 `https://party-blitz.vercel.app/?screen=1`。

**面板里出现红色的错误提示**
- 偶尔一条通常没关系：大屏会自动重试，失败时用最近一次的数据继续，阶段不会卡住。
- 一直卡在同一个阶段时，用 **Skip phase**。

## 附：快速参考

| 操作 | 方法 |
|---|---|
| 展开或收起面板 | 按 `H`，或点左下角的 ⚙ / 面板上的 **—** |
| 全屏 | 大厅右上角或面板里的 **⛶ Fullscreen** |
| 选轮次 | 大厅阶段面板里的 **All games (7) / Classic 5 / Random 6** |
| 口令输错了 | 控制台执行 `localStorage.removeItem('pb:admin')`，然后刷新 |
| 开始 / 继续 | 面板里的 **Start game** 或 **Continue: round N**，频道变成 `SUBSCRIBED` 后才能点 |
| 跳过卡住的阶段 | **Skip phase** |
| 新开一局 | **Reset game**，然后 **Confirm reset** |
| bot 演示 | `/?screen=1&bots=100` |
| 快节奏排练 | `/?screen=1&fast=1`，介绍 1 秒、比赛 4 秒 |
