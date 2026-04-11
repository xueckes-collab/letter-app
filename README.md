# Letter App - AI-Powered Email Outreach Platform

一个智能邮件外联平台，集成 AI 生成、自动化工作流和用户反馈系统，帮助团队高效进行冷邮件外联和客户跟进。

## 🚀 快速开始


### 本地开发
```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 运行测试
pnpm test

# 构建生产版本
pnpm build
```

## ✨ 核心功能

### 📧 邮件管理
- **AI 生成邮件** - 基于客户信息自动生成个性化开发信
- **批量发送** - 支持批量导入和发送，自动控制发送速率
- **Snov.io 集成** - 通过 Snov.io SMTP 发送邮件，支持自动跟进

### 🤖 自动化工作流
- **自动生成跟进邮件** - Scheduler 自动检测需要跟进的客户，生成个性化跟进邮件
- **智能发送权限** - 支持两种模式：
  - **自动发送** - 生成后立即自动发送
  - **确认发送** - 生成后通知用户，用户确认后一键发送
- **自动化设置面板** - 配置跟进间隔（24h-7天）、最大轮数、通知偏好等

### 📊 状态追踪
- **邮件状态进度条** - 可视化展示邮件状态：draft → sent → delivered → replied
- **客户列表状态列** - 快速查看每个客户的邮件发送状态
- **详细日志** - 记录每封邮件的发送时间、状态变更历史

### 💬 用户反馈系统
- **反馈收集** - 用户可提交评分、分类、文字反馈
- **AI 分析** - 自动分析反馈可行性（0-100 分）
- **管理后台** - 查看分析结果、手动标记状态（valuable/archived）
- **智能通知** - 高价值反馈自动通知管理员

### 👥 客户管理
- **客户导入** - 支持 CSV 批量导入
- **客户详情** - 记录邮件历史、回复内容、跟进状态
- **自动化追踪** - 自动记录邮件发送、回复、跟进状态变更

## 🛠 技术栈

- **前端** - React 19 + Tailwind CSS 4 + Vite
- **后端** - Node.js + Express 4 + tRPC 11
- **数据库** - MySQL (via Drizzle ORM)
- **认证** - 自托管 JWT（邮箱+密码）
- **AI** - OpenAI API
- **邮件** - Snov.io SMTP
- **部署** - Render

## 📋 项目结构

```
letter-app/
├── client/                 # React 前端
│   ├── src/
│   │   ├── pages/         # 页面组件
│   │   ├── components/    # 可复用组件
│   │   ├── lib/           # 工具函数
│   │   └── App.tsx        # 路由配置
│   └── index.html
├── server/                # Node.js 后端
│   ├── routers.ts         # tRPC 路由定义
│   ├── db.ts              # 数据库查询函数
│   ├── services/          # 业务逻辑
│   │   ├── llm-engine.ts  # AI 邮件生成
│   │   ├── email-sender.ts # 邮件发送
│   │   └── scheduler.ts   # 自动化任务调度
│   └── _core/             # 框架核心
├── drizzle/               # 数据库 schema 和迁移
└── package.json
```

## 🔧 环境变量

创建 `.env` 文件（本地开发）或在 Render 中配置：

```env
# 数据库（必填）
DATABASE_URL=mysql://user:password@host:port/dbname

# 认证（必填）- 生成命令: openssl rand -base64 32
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# AI（必填）
OPENAI_API_KEY=sk-...

# 邮件查找（可选）
SNOVIO_CLIENT_ID=your_client_id
SNOVIO_CLIENT_SECRET=your_client_secret

# 文件存储（可选，支持 Cloudflare R2 / AWS S3）
S3_ENDPOINT=https://your-account.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET=letter-app
S3_PUBLIC_URL=https://pub-xxx.r2.dev

# 应用配置
NODE_ENV=production
VITE_APP_TITLE=Letter App
```

> ⚠️ 已移除的 Manus 专属变量（不再需要）：`VITE_APP_ID`、`OAUTH_SERVER_URL`、`VITE_OAUTH_PORTAL_URL`、`BUILT_IN_FORGE_API_URL`、`BUILT_IN_FORGE_API_KEY`、`OWNER_OPEN_ID`、`OWNER_NAME`

## 📦 部署

### Render 部署（推荐）
1. 在 Render 创建 Web Service，连接 GitHub 仓库
2. Build Command: `pnpm install && pnpm build`
3. Start Command: `node dist/index.js`
4. 配置所有环境变量（见上方列表）

**当前部署地址：** https://letter-app-1fmm.onrender.com


### 本地开发
```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build

# 启动生产服务器
NODE_ENV=production node dist/index.js
```

## 🧪 测试

```bash
# 运行所有测试
pnpm test

# 监听模式
pnpm test --watch

# 生成覆盖率报告
pnpm test --coverage
```

## 📝 API 文档

所有 API 通过 tRPC 提供，自动生成 TypeScript 类型。

### 主要路由

#### 邮件管理
- `email.generate` - 生成邮件
- `email.batchGenerate` - 批量生成
- `email.send` - 发送邮件
- `email.batchSend` - 批量发送

#### 自动化
- `automation.getSettings` - 获取自动化设置
- `automation.updateSettings` - 更新设置
- `automation.generateFollowUps` - 生成跟进邮件

#### 反馈
- `feedback.submit` - 提交反馈
- `feedback.myList` - 用户反馈列表
- `feedback.adminList` - 管理后台反馈列表
- `feedback.adminDelete` - 删除反馈

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT

## 📞 支持

- 📧 反馈功能 - 在应用内提交反馈
- 🐛 Bug 报告 - 提交 GitHub Issue
- 💡 功能建议 - 通过反馈系统提交

---

**快速链接：**
- 🚀 [在线应用](https://letter-app-1fmm.onrender.com)
- 📖 [GitHub 仓库](https://github.com/xueckes-collab/letter-app)

<!-- trigger redeploy: fix signatureLogoUrl migration -->
