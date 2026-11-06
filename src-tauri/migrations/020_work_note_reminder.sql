-- Scheduling receipts are durable domain state, independent of the notes list and search index.
CREATE TABLE IF NOT EXISTS work_note_reminder (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    config TEXT NOT NULL DEFAULT '{}',
    state TEXT NOT NULL DEFAULT '{}'
);
INSERT OR IGNORE INTO work_note_reminder(id) VALUES (1);
