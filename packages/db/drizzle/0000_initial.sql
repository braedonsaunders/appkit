CREATE TYPE "public"."domain_event_outbox_status" AS ENUM('pending', 'publishing', 'published');--> statement-breakpoint
CREATE TABLE "tenant_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"scope" jsonb DEFAULT '{"type":"tenant"}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permission_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tenant_user_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"effect" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_ip" text,
	"actor_user_agent" text,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"action" text NOT NULL,
	"summary" text,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_event_effects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"effect_key" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_event_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"dedup_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "domain_event_outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"api_key_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "domain_event_effects" ADD CONSTRAINT "domain_event_effects_tenant_event_fk" FOREIGN KEY ("tenant_id","event_id") REFERENCES "public"."domain_event_outbox"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_users_tenant_user_key" ON "tenant_users" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_tenant_key_key" ON "roles" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_event_effects_event_effect_ux" ON "domain_event_effects" USING btree ("tenant_id","event_id","effect_key");--> statement-breakpoint
CREATE INDEX "domain_event_effects_event_idx" ON "domain_event_effects" USING btree ("tenant_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_event_outbox_tenant_id_id_ux" ON "domain_event_outbox" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "domain_event_outbox_dedup_key" ON "domain_event_outbox" USING btree ("tenant_id","dedup_key");--> statement-breakpoint
CREATE INDEX "domain_event_outbox_status_available_idx" ON "domain_event_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "domain_event_outbox_status_claimed_idx" ON "domain_event_outbox" USING btree ("status","claimed_at");--> statement-breakpoint
CREATE INDEX "domain_event_outbox_tenant_subject_idx" ON "domain_event_outbox" USING btree ("tenant_id","subject_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "api_idempotency_key_scope" ON "api_idempotency_keys" USING btree ("api_key_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys" USING btree ("key_hash");