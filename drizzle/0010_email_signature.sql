ALTER TABLE `sender_profiles` ADD `emailSignature` text;--> statement-breakpoint
ALTER TABLE `sender_profiles` ADD `emailFontSize` int DEFAULT 14;--> statement-breakpoint
ALTER TABLE `sender_profiles` ADD `emailFontFamily` varchar(100) DEFAULT 'Arial, sans-serif';
