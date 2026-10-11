import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Intentionally no source FK: deleting a source must leave recoverable list references. */
export const savedVodPlaylists = sqliteTable('saved_vod_playlists', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    revision: integer('revision').notNull(),
    entryCount: integer('entry_count').notNull(),
    document: text('document').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
});

export const SAVED_VOD_PLAYLISTS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS saved_vod_playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    entry_count INTEGER NOT NULL CHECK (entry_count >= 0),
    document TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)`;
