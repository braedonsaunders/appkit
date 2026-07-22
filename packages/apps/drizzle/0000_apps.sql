CREATE TABLE IF NOT EXISTS apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, key text NOT NULL, name text NOT NULL,
  description text, icon_key text NOT NULL DEFAULT 'box', status text NOT NULL DEFAULT 'installed', active_version_id uuid,
  granted_permissions jsonb NOT NULL DEFAULT '[]'::jsonb, show_in_nav boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0, provisioned_objects jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, updated_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS apps_tenant_key_ux ON apps (tenant_id, key);
CREATE INDEX IF NOT EXISTS apps_tenant_status_idx ON apps (tenant_id, status);

CREATE TABLE IF NOT EXISTS app_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  version text NOT NULL, manifest jsonb NOT NULL, status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, updated_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS app_versions_app_version_ux ON app_versions (app_id, version);
CREATE INDEX IF NOT EXISTS app_versions_tenant_app_idx ON app_versions (tenant_id, app_id);

CREATE TABLE IF NOT EXISTS app_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES app_versions(id) ON DELETE CASCADE, path text NOT NULL, kind text NOT NULL,
  content_type text NOT NULL DEFAULT 'text/plain', content text NOT NULL DEFAULT '', is_binary boolean NOT NULL DEFAULT false,
  size integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, updated_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS app_files_version_path_ux ON app_files (version_id, path);
CREATE INDEX IF NOT EXISTS app_files_version_kind_idx ON app_files (version_id, kind);

CREATE TABLE IF NOT EXISTS app_storage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  namespace text NOT NULL DEFAULT 'default', key text NOT NULL, value jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, updated_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS app_storage_app_namespace_key_ux ON app_storage (app_id, namespace, key);
CREATE INDEX IF NOT EXISTS app_storage_tenant_app_idx ON app_storage (tenant_id, app_id);

CREATE TABLE IF NOT EXISTS app_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, app_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  version_id uuid REFERENCES app_versions(id) ON DELETE SET NULL, endpoint text NOT NULL, status text NOT NULL,
  units integer NOT NULL DEFAULT 0, logs jsonb NOT NULL DEFAULT '[]'::jsonb, error_message text,
  duration_ms integer NOT NULL DEFAULT 0, actor_id uuid, at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_runs_tenant_app_at_idx ON app_runs (tenant_id, app_id, at);

CREATE TABLE IF NOT EXISTS app_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publisher_tenant_id uuid NOT NULL, key text NOT NULL, name text NOT NULL,
  description text, icon_key text NOT NULL DEFAULT 'box', version text NOT NULL, manifest jsonb NOT NULL,
  files jsonb NOT NULL DEFAULT '[]'::jsonb, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, updated_by uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS app_listings_key_ux ON app_listings (key);
CREATE INDEX IF NOT EXISTS app_listings_active_name_idx ON app_listings (is_active, name);
