CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`leadId` int,
	`type` varchar(64) NOT NULL,
	`title` varchar(500) NOT NULL,
	`message` text,
	`isRead` boolean NOT NULL DEFAULT false,
	`actionUrl` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `email_sequences` ADD `sentAt` timestamp;--> statement-breakpoint
ALTER TABLE `email_sequences` ADD `gmailMessageId` varchar(255);--> statement-breakpoint
ALTER TABLE `email_sequences` ADD `gmailThreadId` varchar(255);--> statement-breakpoint
ALTER TABLE `lead_states` ADD `lastSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `lead_states` ADD `followUpDueAt` timestamp;--> statement-breakpoint
ALTER TABLE `lead_states` ADD `autoFollowUpEnabled` boolean DEFAULT true NOT NULL;