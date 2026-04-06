CREATE TABLE `email_sequences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`leadId` int NOT NULL,
	`emailType` varchar(64) NOT NULL,
	`subject` text,
	`body` text,
	`strategyType` varchar(128),
	`stageNumber` int NOT NULL DEFAULT 0,
	`ctaType` varchar(128),
	`version` varchar(64),
	`thinkingSummary` json,
	`status` varchar(64) NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_sequences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `icp_matches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`leadId` int NOT NULL,
	`icpName` varchar(255),
	`buyerRoles` json,
	`painPoints` json,
	`triggers` json,
	`decisionStyle` text,
	`salesAngles` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `icp_matches_id` PRIMARY KEY(`id`),
	CONSTRAINT `icp_matches_leadId_unique` UNIQUE(`leadId`)
);
--> statement-breakpoint
CREATE TABLE `lead_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`leadId` int NOT NULL,
	`currentState` varchar(64) NOT NULL DEFAULT 'input_ready',
	`currentRound` int NOT NULL DEFAULT 0,
	`lastEmailType` varchar(64),
	`hasReply` boolean NOT NULL DEFAULT false,
	`replyPastedAt` timestamp,
	`nextAction` text,
	`nextCheckAt` timestamp,
	`lastReportNote` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lead_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `lead_states_leadId_unique` UNIQUE(`leadId`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`email` varchar(320) NOT NULL,
	`website` varchar(500) NOT NULL,
	`companyName` varchar(255),
	`contactName` varchar(255),
	`country` varchar(128),
	`leadRole` varchar(128),
	`linkedinUrl` varchar(500),
	`importBatchId` varchar(64),
	`source` varchar(64) NOT NULL DEFAULT 'manual',
	`status` varchar(64) NOT NULL DEFAULT 'new',
	`replyStatus` varchar(64) NOT NULL DEFAULT 'not_checked',
	`statusColor` varchar(32) NOT NULL DEFAULT 'slate',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reply_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`leadId` int NOT NULL,
	`originalReply` text,
	`replyType` varchar(64),
	`explicitNeeds` json,
	`hiddenConcerns` json,
	`recommendedNextAction` text,
	`thinkingSummary` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reply_analyses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sender_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`senderProfileId` int NOT NULL,
	`fileName` varchar(500) NOT NULL,
	`mimeType` varchar(128),
	`fileSize` int,
	`fileUrl` varchar(1000) NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`extractedText` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sender_assets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sender_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyName` varchar(255) NOT NULL,
	`website` varchar(500) DEFAULT '',
	`mainProducts` text,
	`coreAdvantages` text,
	`certifications` text,
	`moqLeadTime` text,
	`samplePolicy` text,
	`customization` text,
	`onboardingComplete` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sender_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `usp_matches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`leadId` int NOT NULL,
	`primaryUsp` text,
	`secondaryUsp` text,
	`whyFit` text,
	`proofPoints` json,
	`emailAngle` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `usp_matches_id` PRIMARY KEY(`id`),
	CONSTRAINT `usp_matches_leadId_unique` UNIQUE(`leadId`)
);
--> statement-breakpoint
CREATE TABLE `website_analyses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`leadId` int NOT NULL,
	`industry` varchar(255),
	`businessModel` varchar(128),
	`productFocus` text,
	`marketPosition` text,
	`websiteSignals` json,
	`purchaseIntentScore` int,
	`triggerEvents` json,
	`rawSummary` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `website_analyses_id` PRIMARY KEY(`id`),
	CONSTRAINT `website_analyses_leadId_unique` UNIQUE(`leadId`)
);
