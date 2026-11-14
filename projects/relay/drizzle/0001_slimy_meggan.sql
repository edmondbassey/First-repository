CREATE TABLE `incident_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`ticket_id` text NOT NULL,
	`check_key` text NOT NULL,
	`checked` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	`last_operation` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `incident_check_ticket_key` ON `incident_checks` (`ticket_id`,`check_key`);--> statement-breakpoint
CREATE INDEX `incident_checks_workspace` ON `incident_checks` (`workspace_id`,`ticket_id`);--> statement-breakpoint
ALTER TABLE `tickets` ADD `incident_kind` text DEFAULT 'webhook' NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `service` text DEFAULT 'Delivery gateway' NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `environment` text DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `impact` text DEFAULT 'single account' NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `request_id` text DEFAULT '' NOT NULL;