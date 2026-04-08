# Letter App - AI-Powered Email Outreach Platform

一个智能邮件外联平台，集成 AI 生成、自动化工作流和用户反馈系统，帮助团队高效进行冷邮件外联和客户跟进。

## 🚀 快速开始

### 在线访问
**[点击这里进入应用](https://letter-app-kohl-mu.vercel.app)**

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
- **认证** - Manus OAuth
- **AI** - OpenAI API
- **邮件** - Snov.io SMTP
- **部署** - Vercel + Railway

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
├── vercel.json            # Vercel 部署配置
└── package.json
```

## 🔧 环境变量

创建 `.env.local` 文件（本地开发）或在 Vercel 中配置：

```env
# 数据库
DATABASE_URL=mysql://user:password@host:port/dbname

# OAuth
VITE_APP_ID=your_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://login.manus.im

# AI
OPENAI_API_KEY=sk-...

# 邮件
SNOVIO_CLIENT_ID=your_client_id
SNOVIO_CLIENT_SECRET=your_client_secret

# 其他
JWT_SECRET=your_jwt_secret
NODE_ENV=production
```

## 📦 部署

### Vercel 部署（已配置）
应用已部署到 Vercel，每次推送到 `main` 分支时自动部署。

**部署地址：** https://letter-app-kohl-mu.vercel.app

### 本地部署
```bash
# 构建
pnpm build

# 启动生产服务器
NODE_ENV=production node server/index.js
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
- 🚀 [在线应用](https://letter-app-kohl-mu.vercel.app)
- 📖 [GitHub 仓库](https://github.com/xueckes-collab/letter-app)
- 🔧 [部署配置](./vercel.json)
