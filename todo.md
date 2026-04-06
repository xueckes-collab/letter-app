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
- [x] Replace built-in LLM calls with GPT-4o in llm-engine.ts
- [x] Enhance prompts for GPT-level reasoning (chain-of-thought, structured output)
- [x] Add frontend indicator showing GPT-powered status
- [x] Test and verify GPT integration works end-to-end
