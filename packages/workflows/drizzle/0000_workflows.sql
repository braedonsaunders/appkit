CREATE TABLE "workflow_definitions" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"tenant_id" uuid NOT NULL,"key" text NOT NULL,"name" text NOT NULL,"subject_type" text NOT NULL,"graph" jsonb NOT NULL,"status" text DEFAULT 'draft' NOT NULL,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
--> statement-breakpoint
CREATE TABLE "workflow_runs" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"tenant_id" uuid NOT NULL,"workflow_key" text NOT NULL,"subject_type" text NOT NULL,"subject_id" text NOT NULL,"status" text DEFAULT 'running' NOT NULL,"context" jsonb DEFAULT '{}'::jsonb NOT NULL,"error" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"updated_at" timestamp with time zone DEFAULT now() NOT NULL);
--> statement-breakpoint
CREATE TABLE "workflow_gates" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"tenant_id" uuid NOT NULL,"run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE cascade,"gate_key" text NOT NULL,"assignee_id" text NOT NULL,"quorum" text NOT NULL,"status" text DEFAULT 'pending' NOT NULL,"gate" jsonb NOT NULL,"decided_at" timestamp with time zone);
--> statement-breakpoint
CREATE TABLE "workflow_action_executions" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,"tenant_id" uuid NOT NULL,"run_id" uuid NOT NULL REFERENCES "workflow_runs"("id") ON DELETE cascade,"action_key" text NOT NULL,"status" text DEFAULT 'running' NOT NULL,"output" jsonb,"error" text,"created_at" timestamp with time zone DEFAULT now() NOT NULL,"completed_at" timestamp with time zone);
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_definitions_tenant_key_ux" ON "workflow_definitions" ("tenant_id","key");
CREATE INDEX "workflow_definitions_subject_idx" ON "workflow_definitions" ("tenant_id","subject_type");
CREATE INDEX "workflow_runs_subject_idx" ON "workflow_runs" ("tenant_id","subject_type","subject_id");
CREATE INDEX "workflow_runs_status_idx" ON "workflow_runs" ("tenant_id","status");
CREATE UNIQUE INDEX "workflow_gates_run_key_assignee_ux" ON "workflow_gates" ("run_id","gate_key","assignee_id");
CREATE INDEX "workflow_gates_assignee_idx" ON "workflow_gates" ("tenant_id","assignee_id","status");
CREATE UNIQUE INDEX "workflow_action_executions_run_key_ux" ON "workflow_action_executions" ("run_id","action_key");
