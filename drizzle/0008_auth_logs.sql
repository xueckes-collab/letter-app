CREATE TABLE `auth_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`email` varchar(320) NOT NULL,
	`eventType` enum('register_success','register_fail','login_success','login_fail') NOT NULL,
	`errorMessage` varchar(500),
	`ipAddress` varchar(64),
	`userAgent` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_logs_id` PRIMARY KEY(`id`)
);
