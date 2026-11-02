# Supabase 连接说明（已配置好，可以直接用）

## 项目信息
- 项目：`party-blitz`（组织 Albert，**Free** 版）
- 区域：Southeast Asia (Singapore) `ap-southeast-1`
- Project ref：`rflnldonfclzdybthcny`
- Dashboard：https://supabase.com/dashboard/project/rflnldonfclzdybthcny
- SQL Editor：https://supabase.com/dashboard/project/rflnldonfclzdybthcny/sql/new

## 本地凭证
`app/.env` 已经填好（这个文件在 `.gitignore` 里）：
```
VITE_SUPABASE_URL=https://rflnldonfclzdybthcny.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key，sb_publishable_ 开头>
```
- 只有 **publishable key**。它本来就是给浏览器公开使用的，安全性由 RLS 和 RPC 保证
- **没有**保存 secret key 和数据库密码：前端用不到。数据库密码是建项目时随机生成的，没有记录下来；如果需要用 CLI 的 `db push`，就去 Dashboard → Settings → Database 重置

## 数据库现状
`supabase/migrations/001_init.sql` 已经执行到云端，内容和 `DESIGN.md §7` 一致：
- 4 张表：`games`、`players`、`rounds`、`inputs`，都开启了 RLS 但没有 policy，所以 anon 不能直接读写
- 玩家 RPC：`join_game`、`submit_input`、`get_state`
- 大屏 RPC（需要 `p_key`）：`create_game`、`start_round`、`round_inputs`、`round_live`、`set_game_state`
- 和 DESIGN.md 的一处差别：`get_state` 多返回了一个 `players` 数组，大厅画名字泡泡要用

**修改 schema 的方法**：在 SQL Editor 里粘贴 `create or replace function ...` 执行，同时更新 `001_init.sql`，保持一致。Supabase CLI 没有安装，本机也没有 Docker。

## 验证
```bash
npm run smoke
```
这个命令会在云端新建一局测试游戏（上限 4 人），然后跑一遍完整流程：加入、满员、重复加入、Broadcast 广播、host key 校验、狂点截断、收卷、超时提交、写回状态。2026-11-02 实测 20 项全部通过。

## 实测延迟（从本机到新加坡区域）
| 操作 | 耗时 |
|---|---|
| `join_game` | 55–115ms |
| `submit_input` | 30–60ms |
| `get_state` / `round_live` | 约 50ms |
| Broadcast（host → 手机） | 约 20ms |

## 客户端写法速查
```ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

// 手机
const { data } = await supabase.rpc('join_game', { p_game, p_player }); // {faction, nickname, server_now} | {full, server_now}
supabase.channel(`game:${p_game}`).on('broadcast', { event: 'round' }, ({ payload }) => {}).subscribe();

// 大屏
const hostKey = crypto.randomUUID().replaceAll('-', '');                  // 至少 8 个字符
const { data: { game_id } } = await supabase.rpc('create_game', { p_key: hostKey });
const ch = supabase.channel(`game:${game_id}`); ch.subscribe();
await ch.send({ type: 'broadcast', event: 'round', payload: { /* DESIGN.md §7 */ } });
```

## 注意
- 冒烟测试每跑一次都会在数据库里留下一局测试数据，可以不管；正式 demo 用新建的一局
- Free 版 Realtime 上限：200 个连接、每秒 100 条消息。Broadcast 是否按接收者数量计费还没有验证，见 README §6
