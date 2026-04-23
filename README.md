# OneLink

订阅管理平台，支持激活码兑换和订阅管理。

## 功能概述

- **激活码兑换**：用户通过邮箱和激活码获取订阅服务
- **订阅管理**：管理用户订阅状态、套餐和有效期
- **人机验证**：集成 Cloudflare Turnstile 防止滥用
- **风控系统**：兑换风险检测和限流机制

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 15 |
| 前端 | React 19 |
| 样式 | Tailwind CSS 4 |
| ORM | Drizzle ORM |
| 数据库 | PostgreSQL (Supabase) |
| 人机验证 | Cloudflare Turnstile |
| UI 组件 | shadcn/ui |

## 环境要求

- Node.js >= 20
- PostgreSQL 数据库（推荐使用 Supabase）
- Cloudflare Turnstile Site Key

## 快速开始

### 1. 克隆项目

```bash
git clone git@github.com:joytianya/OneLink.git
cd OneLink
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

复制环境变量模板：

```bash
cp .env.example .env.local
```

编辑 `.env.local` 文件，配置以下变量：

```env
# 数据库连接
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres

# Supabase (可选)
NEXT_PUBLIC_SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[YOUR-ANON-KEY]

# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=[YOUR-SITE-KEY]
TURNSTILE_SECRET_KEY=[YOUR-SECRET-KEY]
```

### 4. 数据库迁移

生成并执行数据库迁移：

```bash
npm run db:generate
npm run db:migrate
```

或直接推送 schema：

```bash
npm run db:push
```

### 5. 启动开发服务

```bash
npm run dev
```

访问 http://localhost:3000 查看应用。

### 6. 数据库管理（可选）

启动 Drizzle Studio 查看数据库：

```bash
npm run db:studio
```

## 项目结构

```
OneLink/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # 首页
│   │   ├── layout.tsx          # 根布局
│   │   ├── globals.css         # 全局样式
│   │   ├── redeem/             # 激活码兑换页面
│   │   │   └── page.tsx
│   │   └── api/                # API 路由
│   │       └── redeem/
│   │           └── route.ts    # 兑换 API
│   ├── components/             # UI 组件
│   │   └ ui/                   # shadcn/ui 组件
│   └── lib/                    # 核心逻辑
│       ├── db/                 # 数据库
│       │   ├── schema/         # 数据模型定义
│       │   └── index.ts        # 数据库连接
│       ├── redeem/             # 兑换服务
│       ├── security/           # 安全相关
│       │   ├── turnstile.ts    # Turnstile 验证
│       │   └ redeem-risk-service.ts
│       └── rate-limit/         # 限流
├── drizzle/                    # 数据库迁移文件
├── drizzle.config.ts           # Drizzle 配置
├── next.config.ts              # Next.js 配置
├── tailwind.config.ts          # Tailwind 配置
└── package.json
```

### 数据模型

| 模型 | 说明 |
|------|------|
| users | 用户信息 |
| plans | 订阅套餐 |
| activation-codes | 激活码 |
| activation-code-batches | 激活码批次 |
| subscriptions | 用户订阅 |
| subscription-entitlements | 订阅权益 |
| upstream-accounts | 上游账号 |
| redemption-logs | 兑换记录 |
| admin-users | 管理员 |
| admin-audit-logs | 管理操作日志 |
| redeem-risk-attempts | 风控记录 |

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务（Turbopack） |
| `npm run build` | 构建生产版本 |
| `npm run start` | 启动生产服务 |
| `npm run lint` | 代码检查 |
| `npm run db:generate` | 生成迁移文件 |
| `npm run db:migrate` | 执行迁移 |
| `npm run db:push` | 直接推送 schema |
| `npm run db:studio` | 启动数据库管理界面 |

## 许可证

Private