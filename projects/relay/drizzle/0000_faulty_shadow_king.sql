CREATE TABLE `ticket_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`ticket_id` text NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_workspace_ticket` ON `ticket_events` (`workspace_id`,`ticket_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`number` integer NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`requester_name` text NOT NULL,
	`requester_email` text NOT NULL,
	`category` text NOT NULL,
	`status` text NOT NULL,
	`priority` text NOT NULL,
	`owner` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`due_at` text NOT NULL,
	`resolved_at` text,
	`version` integer DEFAULT 1 NOT NULL,
	`last_operation` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_workspace_number` ON `tickets` (`workspace_id`,`number`);--> statement-breakpoint
CREATE INDEX `tickets_workspace_updated` ON `tickets` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
