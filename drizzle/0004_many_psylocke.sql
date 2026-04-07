ALTER TABLE `email_accounts` ADD `imapHost` varchar(255);--> statement-breakpoint
ALTER TABLE `email_accounts` ADD `imapPort` int;--> statement-breakpoint
ALTER TABLE `email_accounts` ADD `imapSecure` boolean DEFAULT true NOT NULL;