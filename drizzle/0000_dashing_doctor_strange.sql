CREATE TABLE `ekadasis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`timezone` text NOT NULL,
	`fasting_starts` text,
	`paran_start` text NOT NULL,
	`paran_end` text NOT NULL,
	`paran_date` text NOT NULL,
	`is_dvadasi` integer DEFAULT false,
	`notes` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP'
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subscriber_id` integer,
	`ekadasi_id` integer,
	`type` text NOT NULL,
	`sent_at` text DEFAULT 'CURRENT_TIMESTAMP',
	FOREIGN KEY (`subscriber_id`) REFERENCES `subscribers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ekadasi_id`) REFERENCES `ekadasis`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phone` text NOT NULL,
	`timezone` text DEFAULT 'America/Mexico_City' NOT NULL,
	`active` integer DEFAULT true,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP',
	`last_notified` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscribers_phone_unique` ON `subscribers` (`phone`);