CREATE TABLE IF NOT EXISTS user_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  trigger_point text NOT NULL,
  subject_type text,
  endpoint_slug text,
  source text NOT NULL,
  cron text,
  timezone text NOT NULL DEFAULT 'UTC',
  next_run_at timestamptz,
  last_run_at timestamptz,
  timeout_ms integer NOT NULL DEFAULT 2000,
  unit_budget integer NOT NULL DEFAULT 1000,
  sort_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);
CREATE INDEX IF NOT EXISTS user_scripts_trigger_idx ON user_scripts (tenant_id, trigger_point, subject_type, is_active);
CREATE INDEX IF NOT EXISTS user_scripts_schedule_idx ON user_scripts (tenant_id, kind, is_active, next_run_at);
CREATE UNIQUE INDEX IF NOT EXISTS user_scripts_endpoint_slug_ux ON user_scripts (tenant_id, endpoint_slug);

CREATE TABLE IF NOT EXISTS script_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  script_id uuid NOT NULL REFERENCES user_scripts(id) ON DELETE CASCADE,
  target_type text,
  target_id text,
  status text NOT NULL,
  logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  returned jsonb,
  changes jsonb,
  units integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS script_runs_script_at_idx ON script_runs (tenant_id, script_id, at);
