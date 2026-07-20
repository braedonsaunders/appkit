CREATE TABLE "insight_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"query" jsonb NOT NULL,
	"visualization" text DEFAULT 'table' NOT NULL,
	"visualization_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_dashboard_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"layout" jsonb DEFAULT '{"widgets":[]}'::jsonb NOT NULL,
	"source_role" text,
	"is_customized" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "insight_cards_tenant_owner_idx" ON "insight_cards" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "insight_cards_tenant_status_idx" ON "insight_cards" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "user_dashboard_layouts_tenant_user_key" ON "user_dashboard_layouts" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "user_dashboard_layouts_tenant_idx" ON "user_dashboard_layouts" USING btree ("tenant_id");