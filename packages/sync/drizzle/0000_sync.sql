CREATE TABLE "sync_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "connector_key" text NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "schedule" text,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "secrets" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_run_id" uuid,
  "last_run_at" timestamp with time zone,
  "last_status" text,
  "last_error" text,
  "created_by_tenant_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_crosswalk" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "connection_id" uuid NOT NULL,
  "entity" text NOT NULL,
  "source_system" text NOT NULL,
  "external_id" text NOT NULL,
  "canonical_id" uuid NOT NULL,
  "row_hash" text NOT NULL,
  "last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "connection_id" uuid NOT NULL,
  "trigger" text NOT NULL,
  "dry_run" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "duration_ms" integer,
  "stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "cursor_before" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "cursor_after" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error" text,
  "log" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_record_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "connection_id" uuid NOT NULL,
  "run_id" uuid NOT NULL,
  "entity" text NOT NULL,
  "external_id" text NOT NULL,
  "canonical_id" uuid,
  "action" text NOT NULL,
  "dry_run" boolean DEFAULT false NOT NULL,
  "row_hash" text,
  "before" jsonb,
  "after" jsonb,
  "diff" jsonb,
  "message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sync_connections_tenant_idx" ON "sync_connections" ("tenant_id");
CREATE INDEX "sync_connections_connector_idx" ON "sync_connections" ("tenant_id", "connector_key");
CREATE UNIQUE INDEX "sync_connections_tenant_id_id_ux" ON "sync_connections" ("tenant_id", "id");
CREATE UNIQUE INDEX "sync_crosswalk_uniq" ON "sync_crosswalk" ("tenant_id", "connection_id", "entity", "external_id");
CREATE UNIQUE INDEX "sync_crosswalk_tenant_entity_canonical_owner_ux" ON "sync_crosswalk" ("tenant_id", "entity", "canonical_id");
CREATE INDEX "sync_runs_tenant_idx" ON "sync_runs" ("tenant_id");
CREATE INDEX "sync_runs_connection_idx" ON "sync_runs" ("tenant_id", "connection_id", "started_at");
CREATE UNIQUE INDEX "sync_runs_tenant_id_id_ux" ON "sync_runs" ("tenant_id", "id");
CREATE INDEX "sync_record_changes_tenant_idx" ON "sync_record_changes" ("tenant_id");
CREATE INDEX "sync_record_changes_run_idx" ON "sync_record_changes" ("tenant_id", "run_id");
CREATE INDEX "sync_record_changes_connection_run_idx" ON "sync_record_changes" ("tenant_id", "connection_id", "run_id");
CREATE INDEX "sync_record_changes_entity_action_idx" ON "sync_record_changes" ("tenant_id", "entity", "action");
CREATE INDEX "sync_record_changes_external_idx" ON "sync_record_changes" ("tenant_id", "connection_id", "entity", "external_id");
ALTER TABLE "sync_crosswalk" ADD CONSTRAINT "sync_crosswalk_tenant_connection_fk" FOREIGN KEY ("tenant_id", "connection_id") REFERENCES "sync_connections"("tenant_id", "id") ON DELETE cascade;
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_tenant_connection_fk" FOREIGN KEY ("tenant_id", "connection_id") REFERENCES "sync_connections"("tenant_id", "id") ON DELETE cascade;
ALTER TABLE "sync_record_changes" ADD CONSTRAINT "sync_record_changes_tenant_connection_fk" FOREIGN KEY ("tenant_id", "connection_id") REFERENCES "sync_connections"("tenant_id", "id") ON DELETE cascade;
ALTER TABLE "sync_record_changes" ADD CONSTRAINT "sync_record_changes_tenant_run_fk" FOREIGN KEY ("tenant_id", "run_id") REFERENCES "sync_runs"("tenant_id", "id") ON DELETE cascade;
