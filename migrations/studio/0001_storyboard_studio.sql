CREATE TABLE IF NOT EXISTS studio_projects (
	 id TEXT PRIMARY KEY,
	 owner_id TEXT NOT NULL,
	 title TEXT NOT NULL,
	 data_json TEXT NOT NULL CHECK (json_valid(data_json)),
	 created_at TEXT NOT NULL,
	 updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS studio_projects_owner_updated
	ON studio_projects (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS studio_assets (
	 id TEXT PRIMARY KEY,
	 project_id TEXT NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
	 owner_id TEXT NOT NULL,
	 object_key TEXT NOT NULL UNIQUE,
	 content_type TEXT NOT NULL,
	 asset_type TEXT NOT NULL CHECK (asset_type IN ('reference', 'generated')),
	 byte_size INTEGER NOT NULL,
	 created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS studio_assets_project_owner
	ON studio_assets (project_id, owner_id);

CREATE TABLE IF NOT EXISTS studio_generation_events (
	 id TEXT PRIMARY KEY,
	 owner_id TEXT NOT NULL,
	 project_id TEXT NOT NULL,
	 scene_id TEXT NOT NULL,
	 created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS studio_generation_events_owner_date
	ON studio_generation_events (owner_id, created_at DESC);
