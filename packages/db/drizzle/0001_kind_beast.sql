CREATE TYPE "public"."tenant_user_status" AS ENUM('active', 'invited', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."permission_override_effect" AS ENUM('grant', 'deny');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'suspended', 'archived');--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ALTER COLUMN "effect" SET DATA TYPE permission_override_effect USING "effect"::text::permission_override_effect;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "locale_override" text;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "status" "tenant_user_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "invited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "invited_by" uuid;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "joined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "is_built_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "status" "tenant_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "default_locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "enabled_locales" jsonb DEFAULT '["en"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_users_tenant_id_id_key" ON "tenant_users" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_tenant_id_id_key" ON "roles" USING btree ("tenant_id","id");--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_tenant_member_fk" FOREIGN KEY ("tenant_id","tenant_user_id") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_tenant_role_fk" FOREIGN KEY ("tenant_id","role_id") REFERENCES "public"."roles"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_tenant_member_fk" FOREIGN KEY ("tenant_id","tenant_user_id") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_users_tenant_idx" ON "tenant_users" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenant_users_user_idx" ON "tenant_users" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignments_tenant_member_role_key" ON "role_assignments" USING btree ("tenant_id","tenant_user_id","role_id");--> statement-breakpoint
CREATE INDEX "role_assignments_tenant_idx" ON "role_assignments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "role_assignments_member_idx" ON "role_assignments" USING btree ("tenant_user_id");--> statement-breakpoint
CREATE INDEX "role_assignments_role_idx" ON "role_assignments" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "roles_tenant_idx" ON "roles" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_permission_overrides_member_permission_key" ON "user_permission_overrides" USING btree ("tenant_user_id","permission");--> statement-breakpoint
CREATE INDEX "user_permission_overrides_tenant_idx" ON "user_permission_overrides" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "user_permission_overrides_member_idx" ON "user_permission_overrides" USING btree ("tenant_user_id");
