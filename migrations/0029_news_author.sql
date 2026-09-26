-- Migration number: 0029  News author field

ALTER TABLE news ADD COLUMN author_name TEXT NOT NULL DEFAULT 'System';
