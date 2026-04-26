# Project TODO - Outbound Mail OS

## Database Schema Migration
- [x] Migrate Prisma models to Drizzle ORM: senderProfiles, senderAssets, leads, websiteAnalyses, icpMatches, uspMatches, emailSequences, replyAnalyses, leadStates
- [x] Generate and apply database migrations

## Backend - tRPC Routers & Business Logic
- [x] Sender profile CRUD (create/update/get with assets)
- [x] Sender asset upload (file upload to S3)
- [x] Sender asset text extraction (PDF/image parsing via LLM)
- [x] Lead CRUD (create, list, get with relations, bulk import)
- [x] Website scraping service (cheerio-based scraper)
- [x] Website analysis via LLM (analyze scraped content)
- [x] ICP matching via LLM (generate buyer profile)
- [x] USP matching via LLM (select best selling points)
- [x] Email generation engine (cold, warm, followup, reply emails)
- [x] Reply analysis via LLM (classify reply type, recommend next action)
- [x] Lead state machine (track workflow state transitions)
- [x] Full workflow orchestration (create lead → scrape → analyze → generate email)
- [x] Regenerate email endpoint
- [x] Mark email as sent / update state
- [x] Generate follow-up email
- [x] Analyze reply and generate response
- [x] Load lead with full timeline
- [x] Role-based access control (owner = admin)

## Frontend - Dashboard UI
- [x] Dark theme professional B2B SaaS design
- [x] DashboardLayout with sidebar navigation
- [x] Onboarding flow for sender profile setup
- [x] Lead management page (list view)
- [x] Lead list search and filter (by company/email/status)
- [x] Lead detail / workflow page (timeline view)
- [x] Lead input form (single + bulk import)
- [x] Thinking flow visualization (AI reasoning cards)
- [x] Email display with copy/regenerate/send actions
- [x] Explicit response status chooser UI (Has Reply / No Reply buttons)
- [x] Reply input and analysis
- [x] Sender profile settings page

## Testing
- [x] Auth guard and admin access tests (9 tests passing)
- [x] Core business logic tests with mocked dependencies (auth guards, admin access, protected routes)

## GPT API Integration
- [x] Configure OpenAI API Key as environment secret
- [x] Create dedicated GPT service module (server/services/gpt.ts)
- [x] Replace built-in LLM calls with GPT-5.5 in llm-engine.ts
- [x] Enhance prompts for GPT-level reasoning (chain-of-thought, structured output)
- [x] Add frontend indicator showing GPT-powered status
- [x] Test and verify GPT integration works end-to-end

## V2 Feature Improvements
- [x] Configure Snov.io API credentials (client_id + client_secret)
- [x] Create Snov.io API service module (auth, domain search, email finder)
- [x] Add Snov.io settings page for users to bind their own API keys (integrated in EmailSettings)
- [x] Batch workflow: bulk generate outreach emails for multiple leads at once
- [x] Batch workflow UI: progress indicator, batch action buttons
- [x] Multi-channel email sending (SMTP for all providers, replaces Gmail-only)
- [x] One-click send and bulk send with user confirmation
- [x] 48-hour auto follow-up UI: track sent time, generate follow-up from Automation page
- [x] Follow-up confirmation dialog: notify user before batch sending follow-ups
- [x] Server-side scheduled job for 48-hour auto follow-up detection (every 30 min)
- [x] Auto-create notifications when leads become follow-up due
- [x] Auto reply detection via IMAP (every 15 min, supports all providers)
- [x] Reply notification: alert user immediately when reply detected
- [x] Database schema updates: add sent_at, gmail_message_id, gmail_thread_id, notifications table
- [x] Automation settings page for configuring follow-up intervals and notifications

## V3 Multi-Channel Email & Automation
- [x] SMTP email service (nodemailer - supports ALL email providers)
- [x] Email account settings page (SMTP host/port/user/password config)
- [x] Snov.io campaign integration (add prospects to Snov.io lists/campaigns)
- [x] Snov.io reply tracking via API (get-emails-replies)
- [x] Database: email_accounts table for storing SMTP configs per user
- [x] Batch email sending with one-click confirmation
- [x] Server-side cron for 48-hour auto follow-up detection and notification
- [x] Auto reply detection via IMAP check (all providers supported)
- [x] Notification system for reply alerts
- [x] Email sending channel selector UI (SMTP/Snov.io with provider presets)
- [x] Sending status tracking with visual progression bar (draft/sent/delivered/replied)

## V3.1 IMAP & Notification Hardening
- [x] Add custom IMAP host/port/TLS fields to emailAccounts table for provider-agnostic config
- [x] Fix IMAP search logic: search per-lead individually for reliability
- [x] Improve reply notification dedup using leadId + type composite check
- [x] Add scheduler health telemetry (error counter, last check timestamps, healthy flag)
- [x] Add integration tests for scheduler health + SMTP presets + email verification (29 tests passing)

## V3.2 Automation Settings & Status Tracking
- [x] Database: automationSettings table (followUpHours, maxFollowUpRounds, toggles)
- [x] Backend: automationSettings CRUD functions in db.ts
- [x] Backend: automation.getSettings / automation.updateSettings tRPC routes
- [x] Frontend: Automation settings panel (follow-up interval, max rounds, toggles, send delay)
- [x] Frontend: EmailStatusBar component showing draft→sent→delivered→replied progression
- [x] Frontend: Enhanced Leads list with email status indicators and filter counts
- [x] Backend: Scheduler uses dynamic notification text instead of hardcoded 48h
- [x] All 29 vitest tests passing

## V4 自动跟进 + 用户反馈系统
- [x] DB: automationSettings 表新增 autoSendFollowUp 字段（true=自动发送，false=生成后询问）
- [x] DB: feedbacks 表（id, userId, content, rating, status, aiAnalysis, createdAt）
- [x] Backend: scheduler 增强 - 自动生成跟进邮件内容（调用 LLM）
- [x] Backend: scheduler 增强 - autoSendFollowUp=true 时自动发送，false 时创建待确认通知
- [x] Backend: feedback.submit / feedback.list / feedback.analyze tRPC 路由
- [x] Backend: AI 分析反馈可行性，有价值推送管理员通知，无价值自动归档
- [x] Frontend: Automation 页面新增"自动发送跟进邮件"权限开关
- [x] Frontend: 侧边栏新增"意见反馈"入口
- [x] Frontend: 用户反馈页面（评分 + 文字 + 提交历史）
- [x] Frontend: 管理后台新增反馈分析面板（查看 AI 分析结果、标记状态）

## V4 补充（小缺口）
- [x] Backend: feedback 路由命名已实现为 myList/adminList/adminDelete + 异步 AI 分析（无需独立 analyze 路由）
- [x] Frontend/Admin: 管理后台反馈面板添加手动标记状态按鈕（valuable/archived）
