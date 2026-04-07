CREATE TABLE `email_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` varchar(64) NOT NULL,
	`label` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`smtpHost` varchar(255),
	`smtpPort` int,
	`smtpUser` varchar(320),
	`smtpPass` varchar(500),
	`smtpSecure` boolean NOT NULL DEFAULT true,
	`snovioClientId` varchar(255),
	`snovioClientSecret` varchar(255),
	`isDefault` boolean NOT NULL DEFAULT false,
	`isVerified` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_accounts_id` PRIMARY KEY(`id`)
);
