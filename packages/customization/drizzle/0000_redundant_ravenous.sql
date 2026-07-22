CREATE TABLE "form_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"record_type" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"allowed_roles" jsonb,
	"layout" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "list_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"record_type" text NOT NULL,
	"name" text NOT NULL,
	"scope" text NOT NULL,
	"owner_id" uuid,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "user_form_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"record_type" text NOT NULL,
	"layout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "user_list_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"record_type" text NOT NULL,
	"view_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE UNIQUE INDEX "form_layouts_tenant_type_name_ux" ON "form_layouts" USING btree ("tenant_id","record_type","name");--> statement-breakpoint
CREATE INDEX "form_layouts_tenant_type_idx" ON "form_layouts" USING btree ("tenant_id","record_type","is_default");--> statement-breakpoint
CREATE UNIQUE INDEX "list_views_tenant_scope_type_name_ux" ON "list_views" USING btree ("tenant_id","scope","record_type","name");--> statement-breakpoint
CREATE INDEX "list_views_tenant_type_idx" ON "list_views" USING btree ("tenant_id","record_type","scope");--> statement-breakpoint
CREATE UNIQUE INDEX "user_form_preferences_tenant_user_type_ux" ON "user_form_preferences" USING btree ("tenant_id","user_id","record_type");--> statement-breakpoint
CREATE UNIQUE INDEX "user_list_preferences_tenant_user_type_ux" ON "user_list_preferences" USING btree ("tenant_id","user_id","record_type");