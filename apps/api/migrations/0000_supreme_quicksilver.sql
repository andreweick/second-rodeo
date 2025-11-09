CREATE TABLE `audio` (
	`id` text PRIMARY KEY NOT NULL,
	`original_name` text NOT NULL,
	`description` text,
	`date_recorded` integer NOT NULL,
	`duration` integer NOT NULL,
	`artifact_key` text NOT NULL,
	`publish` integer DEFAULT true NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`link` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text,
	`domain` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`r2_key` text NOT NULL,
	`db_created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`db_updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bookmarks_tags` (
	`bookmark_id` text NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`bookmark_id`, `tag_id`),
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chatter` (
	`id` text PRIMARY KEY NOT NULL,
	`date_posted` integer NOT NULL,
	`year` integer NOT NULL,
	`month` text NOT NULL,
	`slug` text NOT NULL,
	`publish` integer DEFAULT true NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chatter_slug_unique` ON `chatter` (`slug`);--> statement-breakpoint
CREATE TABLE `chatter_tags` (
	`chatter_id` text NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`chatter_id`, `tag_id`),
	FOREIGN KEY (`chatter_id`) REFERENCES `chatter`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`venue_id` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`datetime` integer NOT NULL,
	`year` integer NOT NULL,
	`month` text NOT NULL,
	`slug` text NOT NULL,
	`publish` integer DEFAULT true NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkins_slug_unique` ON `checkins` (`slug`);--> statement-breakpoint
CREATE TABLE `films` (
	`id` text PRIMARY KEY NOT NULL,
	`year_watched` integer NOT NULL,
	`date_watched` integer NOT NULL,
	`month` text NOT NULL,
	`slug` text NOT NULL,
	`rewatch` integer DEFAULT false NOT NULL,
	`publish` integer DEFAULT true NOT NULL,
	`tmdb_id` text,
	`letterboxd_id` text,
	`r2_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `films_slug_unique` ON `films` (`slug`);--> statement-breakpoint
CREATE TABLE `memes` (
	`id` text PRIMARY KEY NOT NULL,
	`original_name` text NOT NULL,
	`cf_image_id` text NOT NULL,
	`title` text NOT NULL,
	`date_saved` integer NOT NULL,
	`source_url` text,
	`publish` integer DEFAULT true NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memes_tags` (
	`meme_id` text NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`meme_id`, `tag_id`),
	FOREIGN KEY (`meme_id`) REFERENCES `memes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `photographs` (
	`id` text PRIMARY KEY NOT NULL,
	`original_name` text NOT NULL,
	`cf_image_id` text NOT NULL,
	`date_taken` integer NOT NULL,
	`caption` text,
	`latitude` real,
	`longitude` real,
	`publish` integer DEFAULT true NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `photographs_tags` (
	`photograph_id` text NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`photograph_id`, `tag_id`),
	FOREIGN KEY (`photograph_id`) REFERENCES `photographs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`author` text NOT NULL,
	`date_added` integer NOT NULL,
	`year` integer NOT NULL,
	`month` text NOT NULL,
	`slug` text NOT NULL,
	`publish` integer DEFAULT true NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_slug_unique` ON `quotes` (`slug`);--> statement-breakpoint
CREATE TABLE `quotes_tags` (
	`quote_id` text NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`quote_id`, `tag_id`),
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `shakespeare` (
	`id` text PRIMARY KEY NOT NULL,
	`work_id` text NOT NULL,
	`act` integer NOT NULL,
	`scene` integer NOT NULL,
	`character_id` text NOT NULL,
	`word_count` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `topten` (
	`id` text PRIMARY KEY NOT NULL,
	`show` text NOT NULL,
	`date` text NOT NULL,
	`timestamp` integer NOT NULL,
	`year` integer NOT NULL,
	`month` text NOT NULL,
	`slug` text NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `topten_slug_unique` ON `topten` (`slug`);--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`original_name` text NOT NULL,
	`cf_stream_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`date_recorded` integer NOT NULL,
	`duration` integer NOT NULL,
	`publish` integer DEFAULT true NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
