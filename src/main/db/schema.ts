import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// ── Songs ─────────────────────────────────────────────────────────────────────
export const songs = sqliteTable('songs', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  title:          text('title').notNull(),
  artist:         text('artist').notNull().default(''),
  key:            text('key'),
  tempo:          text('tempo', { enum: ['slow', 'medium', 'fast'] }),
  ccliNumber:     text('ccli_number'),
  backgroundPath: text('background_path'),
  themeId:        integer('theme_id'),
  tags:           text('tags').notNull().default('[]'),
  createdAt:      text('created_at').notNull().default("(datetime('now'))"),
  updatedAt:      text('updated_at').notNull().default("(datetime('now'))")
})

// ── Sections ──────────────────────────────────────────────────────────────────
export const sections = sqliteTable('sections', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  songId:     integer('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
  type:       text('type', {
                enum: ['verse', 'chorus', 'bridge', 'pre-chorus', 'outro', 'intro', 'tag', 'interlude']
              }).notNull(),
  label:      text('label').notNull(),
  lyrics:     text('lyrics').notNull().default(''),
  orderIndex: integer('order_index').notNull().default(0)
})

// ── Service dates ─────────────────────────────────────────────────────────────
export const serviceDates = sqliteTable('service_dates', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  date:      text('date').notNull().unique(),
  label:     text('label').notNull().default('Regular Sunday'),
  status:    text('status', { enum: ['empty', 'in-progress', 'ready'] }).notNull().default('empty'),
  notes:     text('notes'),
  createdAt: text('created_at').notNull().default("(datetime('now'))"),
  updatedAt: text('updated_at').notNull().default("(datetime('now'))")
})

// ── Lineup items ──────────────────────────────────────────────────────────────
export const lineupItems = sqliteTable('lineup_items', {
  id:                     integer('id').primaryKey({ autoIncrement: true }),
  serviceDateId:          integer('service_date_id').notNull().references(() => serviceDates.id, { onDelete: 'cascade' }),
  songId:                 integer('song_id').references(() => songs.id),
  itemType:               text('item_type', { enum: ['song', 'countdown'] }).notNull().default('song'),
  orderIndex:             integer('order_index').notNull().default(0),
  selectedSections:       text('selected_sections').notNull().default('[]'),
  overrideThemeId:        integer('override_theme_id'),
  overrideBackgroundPath: text('override_background_path')
})

// ── Themes ────────────────────────────────────────────────────────────────────
export const themes = sqliteTable('themes', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  name:        text('name').notNull(),
  type:        text('type', { enum: ['global', 'seasonal', 'per-song'] }).notNull().default('global'),
  isDefault:   integer('is_default', { mode: 'boolean' }).notNull().default(false),
  seasonStart: text('season_start'),
  seasonEnd:   text('season_end'),
  settings:    text('settings').notNull().default('{}'),
  createdAt:   text('created_at').notNull().default("(datetime('now'))")
})

// ── Song usage log ────────────────────────────────────────────────────────────
export const songUsage = sqliteTable('song_usage', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  songId:        integer('song_id').notNull().references(() => songs.id),
  serviceDateId: integer('service_date_id').notNull().references(() => serviceDates.id),
  usedAt:        text('used_at').notNull().default("(datetime('now'))")
})