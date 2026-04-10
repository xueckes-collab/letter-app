ALTER TABLE `email_accounts` ADD `gmailAccessToken` text;--> statement-breakpoint
ALTER TABLE `email_accounts` ADD `gmailRefreshToken` text;--> statement-breakpoint
ALTER TABLE `email_accounts` ADD `gmailTokenExpiry` timestamp;
