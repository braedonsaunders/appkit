CREATE TABLE "tenant_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" text,
  "trigger_key" text,
  "destination_key" text,
  "enabled" boolean DEFAULT false NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "secrets" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "last_error" text,
  "last_run_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "integration_export_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "automation_id" uuid NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" uuid NOT NULL,
  "external_system" text NOT NULL,
  "external_ref" text,
  "status" text NOT NULL,
  "detail" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "integration_export_log_tenant_automation_fk" FOREIGN KEY ("tenant_id","automation_id") REFERENCES "tenant_integrations"("tenant_id","id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "tenant_integrations_tenant_idx" ON "tenant_integrations" ("tenant_id");
CREATE INDEX "tenant_integrations_trigger_idx" ON "tenant_integrations" ("tenant_id","trigger_key");
CREATE UNIQUE INDEX "tenant_integrations_tenant_id_id_ux" ON "tenant_integrations" ("tenant_id","id");
CREATE INDEX "integration_export_log_subject_idx" ON "integration_export_log" ("tenant_id","subject_type","subject_id");
CREATE INDEX "integration_export_log_automation_idx" ON "integration_export_log" ("tenant_id","automation_id");
