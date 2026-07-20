CREATE TABLE "sync_connections" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"tenant_id" uuid NOT NULL,"connector_key" text NOT NULL,"name" text NOT NULL,"enabled" boolean DEFAULT true NOT NULL,"config" jsonb DEFAULT '{}'::jsonb NOT NULL,"sealed_secrets" jsonb DEFAULT '{}'::jsonb NOT NULL,"cursor" jsonb,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
--> statement-breakpoint
CREATE TABLE "sync_runs" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"tenant_id" uuid NOT NULL,"connection_id" uuid NOT NULL REFERENCES "sync_connections"("id") ON DELETE cascade,"status" text NOT NULL,"pulled" integer DEFAULT 0 NOT NULL,"applied" integer DEFAULT 0 NOT NULL,"failed" integer DEFAULT 0 NOT NULL,"archived" integer DEFAULT 0 NOT NULL,"cursor" jsonb,"error" text,"started_at" timestamp with time zone DEFAULT now() NOT NULL,"completed_at" timestamp with time zone);
--> statement-breakpoint
CREATE TABLE "sync_crosswalk" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"tenant_id" uuid NOT NULL,"connection_id" uuid NOT NULL REFERENCES "sync_connections"("id") ON DELETE cascade,"entity" text NOT NULL,"external_id" text NOT NULL,"target_id" text NOT NULL,"source_hash" text,"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,"archived_at" timestamp with time zone);
--> statement-breakpoint
CREATE INDEX "sync_connections_tenant_idx" ON "sync_connections" ("tenant_id");
CREATE UNIQUE INDEX "sync_connections_tenant_name_ux" ON "sync_connections" ("tenant_id","name");
CREATE INDEX "sync_runs_connection_idx" ON "sync_runs" ("tenant_id","connection_id","started_at");
CREATE UNIQUE INDEX "sync_crosswalk_external_ux" ON "sync_crosswalk" ("connection_id","entity","external_id");
CREATE INDEX "sync_crosswalk_target_idx" ON "sync_crosswalk" ("tenant_id","entity","target_id");
