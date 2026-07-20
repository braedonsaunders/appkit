CREATE TABLE "integrations" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"tenant_id" uuid NOT NULL,"name" text NOT NULL,"enabled" boolean DEFAULT true NOT NULL,"trigger_key" text NOT NULL,"destination_key" text NOT NULL,"config" jsonb DEFAULT '{}'::jsonb NOT NULL,"sealed_secrets" jsonb DEFAULT '{}'::jsonb NOT NULL,"once_per_record" boolean DEFAULT false NOT NULL,"status" text DEFAULT 'ready' NOT NULL,"last_error" text,"last_run_at" timestamp with time zone,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
--> statement-breakpoint
CREATE TABLE "integration_delivery_ledger" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"tenant_id" uuid NOT NULL,"integration_id" uuid NOT NULL REFERENCES "integrations"("id") ON DELETE cascade,"trigger_key" text NOT NULL,"subject_id" text NOT NULL,"destination_key" text NOT NULL,"external_ref" text,"status" text NOT NULL,"detail" jsonb,"created_at" timestamp with time zone DEFAULT now() NOT NULL);
--> statement-breakpoint
CREATE INDEX "integrations_trigger_idx" ON "integrations" ("tenant_id","trigger_key","enabled");
CREATE UNIQUE INDEX "integrations_tenant_name_ux" ON "integrations" ("tenant_id","name");
CREATE INDEX "integration_delivery_subject_idx" ON "integration_delivery_ledger" ("tenant_id","integration_id","trigger_key","subject_id");
