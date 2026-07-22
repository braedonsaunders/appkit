CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"category" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link_path" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_critical" boolean DEFAULT false NOT NULL,
	"source_job_id" text,
	"read_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_notification_policy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"digest_mode" text DEFAULT 'off' NOT NULL,
	"digest_hour_utc" integer DEFAULT 7 NOT NULL,
	"quiet_hours" jsonb DEFAULT 'null'::jsonb,
	"scan_enabled" boolean DEFAULT true NOT NULL,
	"scan_cron" text DEFAULT '0 6 * * *' NOT NULL,
	"scan_timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "tenant_notification_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"role_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"group_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"escalation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "webpush_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_uniq" ON "notification_preferences" USING btree ("tenant_id","user_id","category","channel");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("tenant_id","user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "notifications_tenant_idx" ON "notifications" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("tenant_id","user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_source_job_user_ux" ON "notifications" USING btree ("tenant_id","source_job_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_notification_policy_uniq" ON "tenant_notification_policy" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_notification_settings_category_ux" ON "tenant_notification_settings" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE INDEX "webpush_subscriptions_user_idx" ON "webpush_subscriptions" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webpush_subscriptions_endpoint_ux" ON "webpush_subscriptions" USING btree ("endpoint");
