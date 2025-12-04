-- Migration: Add Telegram support
CREATE TABLE `telegram_subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` text NOT NULL,
	`username` text,
	`first_name` text,
	`timezone` text DEFAULT 'America/Mexico_City' NOT NULL,
	`language` text DEFAULT 'es' NOT NULL,
	`active` integer DEFAULT true,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	`last_notified` text
);

CREATE UNIQUE INDEX `telegram_subscribers_chat_id_unique` ON `telegram_subscribers` (`chat_id`);

CREATE TABLE `telegram_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subscriber_id` integer,
	`ekadasi_id` integer,
	`type` text NOT NULL,
	`sent_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`subscriber_id`) REFERENCES `telegram_subscribers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ekadasi_id`) REFERENCES `ekadasis`(`id`) ON UPDATE no action ON DELETE no action
);
