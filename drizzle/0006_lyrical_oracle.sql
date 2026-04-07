CREATE TABLE `feedbacks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`rating` int NOT NULL,
	`content` text NOT NULL,
	`category` varchar(64) DEFAULT 'general',
	`status` enum('pending','analyzed','valuable','archived') NOT NULL DEFAULT 'pending',
	`aiAnalysis` text,
	`aiScore` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `feedbacks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `automation_settings` ADD `autoSendFollowUp` boolean DEFAULT false NOT NULL;