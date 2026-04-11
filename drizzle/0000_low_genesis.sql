CREATE TYPE "public"."auth_event_type" AS ENUM('register_success', 'register_fail', 'login_success', 'login_fail');--> statement-breakpoint
CREATE TYPE "public"."feedback_status" AS ENUM('pending', 'analyzed', 'valuable', 'archived');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "ai_prompt_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"promptKey" varchar(100) NOT NULL,
	"promptText" text NOT NULL,
	"description" varchar(500),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_prompt_settings_promptKey_unique" UNIQUE("promptKey")
);
--> statement-breakpoint
CREATE TABLE "auth_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"email" varchar(320) NOT NULL,
	"eventType" "auth_event_type" NOT NULL,
	"errorMessage" varchar(500),
	"ipAddress" varchar(64),
	"userAgent" varchar(512),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"followUpHours" integer DEFAULT 48 NOT NULL,
	"maxFollowUpRounds" integer DEFAULT 9 NOT NULL,
	"autoFollowUpEnabled" boolean DEFAULT true NOT NULL,
	"replyCheckEnabled" boolean DEFAULT true NOT NULL,
	"notifyOnReply" boolean DEFAULT true NOT NULL,
	"notifyOnFollowUpDue" boolean DEFAULT true NOT NULL,
	"sendDelaySeconds" integer DEFAULT 5 NOT NULL,
	"autoSendFollowUp" boolean DEFAULT false NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "automation_settings_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "email_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"provider" varchar(64) NOT NULL,
	"label" varchar(255) NOT NULL,
	"email" varchar(320) NOT NULL,
	"smtpHost" varchar(255),
	"smtpPort" integer,
	"smtpUser" varchar(320),
	"smtpPass" varchar(500),
	"smtpSecure" boolean DEFAULT true NOT NULL,
	"imapHost" varchar(255),
	"imapPort" integer,
	"imapSecure" boolean DEFAULT true NOT NULL,
	"snovioClientId" varchar(255),
	"snovioClientSecret" varchar(255),
	"gmailAccessToken" text,
	"gmailRefreshToken" text,
	"gmailTokenExpiry" timestamp,
	"isDefault" boolean DEFAULT false NOT NULL,
	"isVerified" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"leadId" integer NOT NULL,
	"emailType" varchar(64) NOT NULL,
	"subject" text,
	"body" text,
	"strategyType" varchar(128),
	"stageNumber" integer DEFAULT 0 NOT NULL,
	"ctaType" varchar(128),
	"version" varchar(64),
	"thinkingSummary" json,
	"status" varchar(64) DEFAULT 'draft' NOT NULL,
	"sentAt" timestamp,
	"gmailMessageId" varchar(255),
	"gmailThreadId" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedbacks" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"rating" integer NOT NULL,
	"content" text NOT NULL,
	"category" varchar(64) DEFAULT 'general',
	"status" "feedback_status" DEFAULT 'pending' NOT NULL,
	"aiAnalysis" text,
	"aiScore" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "icp_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"leadId" integer NOT NULL,
	"icpName" varchar(255),
	"buyerRoles" json,
	"painPoints" json,
	"triggers" json,
	"decisionStyle" text,
	"salesAngles" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "icp_matches_leadId_unique" UNIQUE("leadId")
);
--> statement-breakpoint
CREATE TABLE "lead_states" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"leadId" integer NOT NULL,
	"currentState" varchar(64) DEFAULT 'input_ready' NOT NULL,
	"currentRound" integer DEFAULT 0 NOT NULL,
	"lastEmailType" varchar(64),
	"hasReply" boolean DEFAULT false NOT NULL,
	"replyPastedAt" timestamp,
	"nextAction" text,
	"nextCheckAt" timestamp,
	"lastReportNote" text,
	"lastSentAt" timestamp,
	"followUpDueAt" timestamp,
	"autoFollowUpEnabled" boolean DEFAULT true NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_states_leadId_unique" UNIQUE("leadId")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"email" varchar(320) NOT NULL,
	"website" varchar(500) NOT NULL,
	"companyName" varchar(255),
	"contactName" varchar(255),
	"country" varchar(128),
	"leadRole" varchar(128),
	"linkedinUrl" varchar(500),
	"importBatchId" varchar(64),
	"source" varchar(64) DEFAULT 'manual' NOT NULL,
	"status" varchar(64) DEFAULT 'new' NOT NULL,
	"replyStatus" varchar(64) DEFAULT 'not_checked' NOT NULL,
	"statusColor" varchar(32) DEFAULT 'slate' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"leadId" integer,
	"type" varchar(64) NOT NULL,
	"title" varchar(500) NOT NULL,
	"message" text,
	"isRead" boolean DEFAULT false NOT NULL,
	"actionUrl" varchar(500),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reply_analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"leadId" integer NOT NULL,
	"originalReply" text,
	"replyType" varchar(64),
	"explicitNeeds" json,
	"hiddenConcerns" json,
	"recommendedNextAction" text,
	"thinkingSummary" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sender_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"senderProfileId" integer NOT NULL,
	"fileName" varchar(500) NOT NULL,
	"mimeType" varchar(128),
	"fileSize" integer,
	"fileUrl" varchar(1000) NOT NULL,
	"fileKey" varchar(500) NOT NULL,
	"extractedText" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sender_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"companyName" varchar(255) NOT NULL,
	"website" varchar(500) DEFAULT '',
	"mainProducts" text,
	"coreAdvantages" text,
	"certifications" text,
	"moqLeadTime" text,
	"samplePolicy" text,
	"customization" text,
	"onboardingComplete" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"emailSignature" text,
	"emailFontSize" integer DEFAULT 14,
	"emailFontFamily" varchar(100) DEFAULT 'Arial, sans-serif',
	"signatureLogoUrl" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64),
	"name" text,
	"email" varchar(320),
	"passwordHash" varchar(255),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "usp_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"leadId" integer NOT NULL,
	"primaryUsp" text,
	"secondaryUsp" text,
	"whyFit" text,
	"proofPoints" json,
	"emailAngle" json,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usp_matches_leadId_unique" UNIQUE("leadId")
);
--> statement-breakpoint
CREATE TABLE "website_analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"leadId" integer NOT NULL,
	"industry" varchar(255),
	"businessModel" varchar(128),
	"productFocus" text,
	"marketPosition" text,
	"websiteSignals" json,
	"purchaseIntentScore" integer,
	"triggerEvents" json,
	"rawSummary" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "website_analyses_leadId_unique" UNIQUE("leadId")
);
