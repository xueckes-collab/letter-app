CREATE TABLE `automation_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`followUpHours` int NOT NULL DEFAULT 48,
	`maxFollowUpRounds` int NOT NULL DEFAULT 9,
	`autoFollowUpEnabled` boolean NOT NULL DEFAULT true,
	`replyCheckEnabled` boolean NOT NULL DEFAULT true,
	`notifyOnReply` boolean NOT NULL DEFAULT true,
	`notifyOnFollowUpDue` boolean NOT NULL DEFAULT true,
	`sendDelaySeconds` int NOT NULL DEFAULT 5,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `automation_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `automation_settings_userId_unique` UNIQUE(`userId`)
);
