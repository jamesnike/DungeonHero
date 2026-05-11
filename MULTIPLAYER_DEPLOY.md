# Multiplayer 部署 / 测试指南

DungeonHero 双人异步模式的本地测试 + Vercel 上线步骤。

---

## 后端架构一览

| 组件 | 用途 | 谁负责 |
|---|---|---|
| Supabase Postgres | 房间、传牌、玩家档案三张表 | `supabase/migrations/20260510_multiplayer_rooms.sql` |
| Supabase Auth (Anonymous) | 给每个玩家发匿名 JWT | Dashboard 一键开关 |
| Supabase Realtime | `transfers` 表 INSERT 推送给对手 | 自动开启（migration 里 `alter publication`） |
| Vercel Serverless Functions | `/api/mp/{create-room,join-room,transfer,ack-transfer,resume}` | `api/mp/*.ts` |
| Vercel 静态托管 | Vite 构建出来的 SPA | `dist/public/` |
| Vite 客户端 | 通过 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 直连 Supabase Realtime | `client/src/lib/supabaseClient.ts` |
| Express dev server | 本地把 `api/*.ts` bridge 到 Express 路由（生产环境不走它）| `server/routes.ts` |

---

## 一次性 setup（5 步，10 分钟）

### 1. 拿 Supabase service-role key

打开 https://supabase.com/dashboard/project/wurqelcppmsbxxvccfpw/settings/api
，找到 **`service_role`**（legacy）或者任意一个 **secret** key。

> 这个 key **绝不能**进客户端 bundle。`api/mp/*.ts` 用它来 bypass RLS，写
> `rooms` / `transfers` / `player_profiles` 三张表。

### 2. 把 service-role key 填进 `.env`

打开项目根目录的 `.env`（已经替你创建好），把：

```
SUPABASE_SERVICE_ROLE_KEY=PASTE_SERVICE_ROLE_KEY_HERE
```

替换成实际值。其它 4 个 env 已经填好了（migration 已 apply、anon key 已 grab）。

### 3. 启用 Supabase Anonymous Sign-In

打开 https://supabase.com/dashboard/project/wurqelcppmsbxxvccfpw/auth/providers
，往下找 **Anonymous Sign-In** 这一项，**Enabled** 勾上 → Save。

> 这是必需的——`client/src/lib/supabaseClient.ts:ensureAnonymousSession()`
> 调 `signInAnonymously()` 给每个玩家发 JWT，不开会 422 报错。

### 4. 本地起 dev server，验证 endpoint 通

```bash
npm run dev
```

另开一个 terminal：

```bash
curl -X POST http://localhost:3000/api/mp/create-room \
  -H "Content-Type: application/json" -d '{}'
# 期望：HTTP 401 + {"error":"unauthorized"}
# 之前的 bug：会返回 HTML（因为 endpoint 没 mount 到 dev server）
# 现在已经在 server/routes.ts mount 了 5 个 mp endpoint
```

5 个都 ping 一下：

```bash
for path in create-room join-room transfer ack-transfer resume; do
  echo "--- /api/mp/$path ---"
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    "http://localhost:3000/api/mp/$path" \
    -H "Content-Type: application/json" -d '{}'
done
# 全部 401 = 通了；任何 404 / 200 + HTML = 没通
```

### 5. 浏览器跑端到端测试

#### 5a. 本机同浏览器双 tab

- 浏览器开 `http://localhost:3000` 两个 tab
- 都点 New Game → 「双人游戏」→ 在 Lobby 里：
  - Tab 1：Create room → 抄房间码
  - Tab 2：Join room → 输房间码
- 任何一边 waterfall 触发后，另一边的 deck 顶应该多出对方推过来的卡（绿色 prepend）

#### 5b. 手机 + 电脑同 WiFi

1. 找电脑 LAN IP：

   ```bash
   ipconfig getifaddr en0   # macOS WiFi；en1 / 别的看 ifconfig
   ```

2. 手机和电脑连同一个 WiFi
3. 手机浏览器访问 `http://<电脑IP>:3000`（dev server 已经 listen `0.0.0.0:3000`，不用改）
4. 手机 Create room、电脑 Join room（或反过来）
5. 各自打牌，验证传牌

> ⚠️ macOS 防火墙：如果手机连不上，「系统设置 → 网络 → 防火墙」临时关掉，或者放行 Node.js 进程。

---

## 部署到 Vercel

### 1. Vercel 项目 env 配置

`.env.local` 显示项目已经在 Vercel：`prj_P16FW6aUH6zkbF5ZwSde3YqWCRvP` (`dungeon-hero`)。

在 https://vercel.com/eric-shus-projects-bf8ee2df/dungeon-hero/settings/environment-variables
里加 5 个变量（**Production + Preview + Development 都勾上**）：

| 名字 | 值来源 |
|---|---|
| `SUPABASE_URL` | `https://wurqelcppmsbxxvccfpw.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | 同 step 1，**Sensitive** 打勾 |
| `SUPABASE_ANON_KEY` | `.env` 里 SUPABASE_ANON_KEY 的值 |
| `VITE_SUPABASE_URL` | 同 SUPABASE_URL |
| `VITE_SUPABASE_ANON_KEY` | 同 SUPABASE_ANON_KEY |

> Vercel 会把 `SUPABASE_*` 注入 serverless runtime；`VITE_*` 在 build 时被
> Vite inline 进 bundle。

### 2. Deploy

```bash
npx vercel deploy           # → preview URL
# 或
npx vercel deploy --prod    # → production URL
```

Vercel 会自动把 `api/**/*.ts` 当 serverless function 部署，包括 nested 的 `api/mp/*`。
（`api/mp/_shared.ts` 因为下划线前缀不会被当 function——这是 Vercel 约定，是 helper。）

### 3. 验证 prod endpoint

```bash
curl -X POST https://your-deploy.vercel.app/api/mp/create-room \
  -H "Content-Type: application/json" -d '{}'
# 期望同样 401
```

### 4. 把 prod 域名加进 Supabase 允许列表

https://supabase.com/dashboard/project/wurqelcppmsbxxvccfpw/auth/url-configuration

- **Site URL**：填 prod 域名（`https://dungeon-hero.vercel.app` 之类）
- **Redirect URLs**：把 `https://*.vercel.app/**` 也加进去（preview 域名走通用 wildcard）

> 不加这一步，Anonymous Sign-In 在 prod 浏览器里会被 CORS 挡。

---

## 数据模型速查

| Table | 关键列 | 谁写 | 谁读 |
|---|---|---|---|
| `rooms` | `code` (6 字符)、`player_a` / `player_b`、`shared_deck_full` (jsonb 36 卡)、`shared_deck_consumed` | `/api/mp/create-room`、`/api/mp/join-room` | RLS：仅 `player_a` 或 `player_b` |
| `transfers` | `seq`（per-room 单调递增）、`from_player` / `to_player`、`cards` (jsonb)、`shared_consumed`、`applied` | `/api/mp/transfer`、`/api/mp/ack-transfer` | RLS：仅房间参与方；Realtime 推 INSERT 给客户端 |
| `player_profiles` | `display_name` | `/api/mp/create-room` 时 upsert | RLS：自己 + 同房间对手 |

---

## 已知限制（按 plan）

- ❌ Boss 战暂不支持双人——任一方 deck 露出 Boss 时弹「Boss 战暂未支持双人，本场以单人结算」，underlying combat 走单人 reduce。已实现：`MultiplayerBossAlert.tsx`。
- ❌ 客户端构造 deck 然后 POST 给 server（信任客户端）。Phase 4 设计时取舍：朋友局优先 ship。后续要校验得加 Edge Function。
- ❌ 没有「断线 + peer 长时间不活跃」UI 提示——Realtime 自动重连，但没明确告诉用户「对方已下线」。

---

## 故障排查

| 症状 | 原因 | 修法 |
|---|---|---|
| Lobby 里点 Create / Join 报 `service_unavailable` | `SUPABASE_*` 三个 env 没设 | 检查 `.env` 或 Vercel env vars |
| Lobby 报 `errorAuthFailed` | Anonymous Sign-In 没开 | 见 setup step 3 |
| Lobby 报 `errorUnknown: HTTP 500` | service-role key 错、或表不存在 | 看 `npm run dev` console；或 Vercel function logs |
| 一切正常但 peer 收不到传牌 | Realtime 没把 `transfers` / `rooms` 加进 publication | migration 里 `alter publication supabase_realtime add table` 已做；如果手动跑了别的 SQL，去 Dashboard 看 Database → Publications |
| 同浏览器双 tab 测试不工作 | 不是 bug——双 tab 共享 localStorage 里的 `sb-...-auth-token`，Tab 2 会复用 Tab 1 的 user id，两边变成同一个 player_a。**测多人必须开两个不同浏览器**（Chrome 普通窗口 + Chrome 隐身窗口、或 Chrome + Safari）。 |

---

## 后续想做但还没做

- 房间过期清理（cron job 把 `status='ended' AND ended_at < now() - 24h` 的删掉）
- 服务端 Edge Function 校验「你 push 的卡是不是真的从你的 deck 来的」
- Lobby 历史记录（"重连到上一局"）
- 把 5 个 endpoint 拆成 RPC（Supabase Edge Functions），省掉 Vercel + Supabase 两套延迟
