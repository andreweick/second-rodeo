import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ============================================================================
// Content Tables
// ============================================================================

// 1. Chatter (Social Posts)
export const chatter = sqliteTable("chatter", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD format
  datePosted: integer("date_posted", { mode: "timestamp" }).notNull(),
  year: integer("year").notNull(),
  month: text("month").notNull(), // YYYY-MM format
  slug: text("slug").notNull().unique(),
  publish: integer("publish", { mode: "boolean" }).notNull().default(true),
  r2Key: text("r2_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`).$onUpdate(() => sql`(unixepoch())`),
});

// 2. Quotes
export const quotes = sqliteTable("quotes", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  author: text("author").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD format
  dateAdded: integer("date_added", { mode: "timestamp" }).notNull(),
  year: integer("year").notNull(),
  month: text("month").notNull(), // YYYY-MM format
  slug: text("slug").notNull().unique(),
  publish: integer("publish", { mode: "boolean" }).notNull().default(true),
  r2Key: text("r2_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`).$onUpdate(() => sql`(unixepoch())`),
});

// 3. Films
export const films = sqliteTable("films", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  year: integer("year").notNull(), // Film release year
  yearWatched: integer("year_watched").notNull(),
  dateWatched: integer("date_watched", { mode: "timestamp" }).notNull(),
  date: text("date").notNull(), // YYYY-MM-DD format
  month: text("month").notNull(), // YYYY-MM format
  slug: text("slug").notNull().unique(),
  rewatch: integer("rewatch", { mode: "boolean" }).notNull().default(false),
  rewatchCount: integer("rewatch_count").notNull().default(0),
  publish: integer("publish", { mode: "boolean" }).notNull().default(true),
  tmdbId: text("tmdb_id"),
  posterUrl: text("poster_url"),
  letterboxdId: text("letterboxd_id"),
  letterboxdUri: text("letterboxd_uri"),
  r2Key: text("r2_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`).$onUpdate(() => sql`(unixepoch())`),
});

// 4. Checkins
export const checkins = sqliteTable("checkins", {
  id: text("id").primaryKey(),
  venueId: text("venue_id").notNull(),
  venueName: text("venue_name").notNull(),
  foursquareUrl: text("foursquare_url"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  formattedAddress: text("formatted_address"),
  street: text("street"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country"),
  neighborhood: text("neighborhood"),
  date: text("date").notNull(), // YYYY-MM-DD format
  time: text("time").notNull(), // HH:MM:SS format
  datetime: integer("datetime", { mode: "timestamp" }).notNull(),
  year: integer("year").notNull(),
  month: text("month").notNull(), // YYYY-MM format
  slug: text("slug").notNull().unique(),
  publish: integer("publish", { mode: "boolean" }).notNull().default(true),
  r2Key: text("r2_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`).$onUpdate(() => sql`(unixepoch())`),
});

// 5. Shakespeare Works
export const shakespeare = sqliteTable("shakespeare", {
  id: text("id").primaryKey(),
  workId: text("work_id").notNull(),
  workTitle: text("work_title").notNull(),
  genreCode: text("genre_code").notNull(),
  genreName: text("genre_name").notNull(),
  act: integer("act").notNull(),
  scene: integer("scene").notNull(),
  paragraphId: integer("paragraph_id").notNull(),
  paragraphNum: integer("paragraph_num").notNull(),
  characterId: text("character_id").notNull(),
  characterName: text("character_name").notNull(),
  isStageDirection: integer("is_stage_direction", { mode: "boolean" }).notNull(),
  charCount: integer("char_count").notNull(),
  wordCount: integer("word_count").notNull(),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  r2Key: text("r2_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`).$onUpdate(() => sql`(unixepoch())`),
});

// 6. Top Ten Lists
export const topten = sqliteTable("topten", {
  id: text("id").primaryKey(),
  show: text("show").notNull(),
  date: text("date").notNull(),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  year: integer("year").notNull(),
  month: text("month").notNull(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  itemCount: integer("item_count").notNull().default(10),
  sourceUrl: text("source_url"),
  r2Key: text("r2_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`).$onUpdate(() => sql`(unixepoch())`),
});

// 7. Photographs
export const photographs = sqliteTable("photographs", {
  id: text("id").primaryKey(),
  originalName: text("original_name").notNull(),
  cfImageId: text("cf_image_id").notNull(),
  dateTaken: integer("date_taken", { mode: "timestamp" }).notNull(),
  caption: text("caption"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  publish: integer("publish", { mode: "boolean" }).notNull().default(true),
  r2Key: text("r2_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`).$onUpdate(() => sql`(unixepoch())`),
});

// 8. Personal Videos
export const videos = sqliteTable("videos", {
  id: text("id").primaryKey(),
  originalName: text("original_name").notNull(),
  cfStreamId: text("cf_stream_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  dateRecorded: integer("date_recorded", { mode: "timestamp" }).notNull(),
  duration: integer("duration").notNull(), // seconds
  publish: integer("publish", { mode: "boolean" }).notNull().default(true),
  r2Key: text("r2_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`).$onUpdate(() => sql`(unixepoch())`),
});

// 9. Memes
export const memes = sqliteTable("memes", {
  id: text("id").primaryKey(),
  originalName: text("original_name").notNull(),
  cfImageId: text("cf_image_id").notNull(),
  title: text("title").notNull(),
  dateSaved: integer("date_saved", { mode: "timestamp" }).notNull(),
  sourceUrl: text("source_url"),
  publish: integer("publish", { mode: "boolean" }).notNull().default(true),
  r2Key: text("r2_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`).$onUpdate(() => sql`(unixepoch())`),
});

// 10. Audio
export const audio = sqliteTable("audio", {
  id: text("id").primaryKey(),
  originalName: text("original_name").notNull(),
  description: text("description"),
  dateRecorded: integer("date_recorded", { mode: "timestamp" }).notNull(),
  duration: integer("duration").notNull(), // seconds
  artifactKey: text("artifact_key").notNull(), // R2 path to audio file
  publish: integer("publish", { mode: "boolean" }).notNull().default(true),
  r2Key: text("r2_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`).$onUpdate(() => sql`(unixepoch())`),
});

// 11. Bookmarks (Raindrop.io)
export const bookmarks = sqliteTable("bookmarks", {
  id: text("id").primaryKey(), // Raindrop.io ID
  link: text("link").notNull(),
  title: text("title").notNull(),
  excerpt: text("excerpt"),
  domain: text("domain").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  r2Key: text("r2_key").notNull(),
  dbCreatedAt: integer("db_created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  dbUpdatedAt: integer("db_updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`).$onUpdate(() => sql`(unixepoch())`),
});

// ============================================================================
// Tags Infrastructure
// ============================================================================

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

// Junction tables for many-to-many relationships
export const chatterTags = sqliteTable("chatter_tags", {
  chatterId: text("chatter_id").notNull().references(() => chatter.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.chatterId, table.tagId] }),
}));

export const quotesTags = sqliteTable("quotes_tags", {
  quoteId: text("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.quoteId, table.tagId] }),
}));

export const photographsTags = sqliteTable("photographs_tags", {
  photographId: text("photograph_id").notNull().references(() => photographs.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.photographId, table.tagId] }),
}));

export const memesTags = sqliteTable("memes_tags", {
  memeId: text("meme_id").notNull().references(() => memes.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.memeId, table.tagId] }),
}));

export const bookmarksTags = sqliteTable("bookmarks_tags", {
  bookmarkId: text("bookmark_id").notNull().references(() => bookmarks.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.bookmarkId, table.tagId] }),
}));

// ============================================================================
// TypeScript Type Exports
// ============================================================================

// Chatter
export type Chatter = typeof chatter.$inferSelect;
export type NewChatter = typeof chatter.$inferInsert;

// Quotes
export type Quote = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;

// Films
export type Film = typeof films.$inferSelect;
export type NewFilm = typeof films.$inferInsert;

// Checkins
export type Checkin = typeof checkins.$inferSelect;
export type NewCheckin = typeof checkins.$inferInsert;

// Shakespeare
export type ShakespeareParagraph = typeof shakespeare.$inferSelect;
export type NewShakespeareParagraph = typeof shakespeare.$inferInsert;

// Top Ten
export type TopTen = typeof topten.$inferSelect;
export type NewTopTen = typeof topten.$inferInsert;

// Photographs
export type Photograph = typeof photographs.$inferSelect;
export type NewPhotograph = typeof photographs.$inferInsert;

// Videos
export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;

// Memes
export type Meme = typeof memes.$inferSelect;
export type NewMeme = typeof memes.$inferInsert;

// Audio
export type Audio = typeof audio.$inferSelect;
export type NewAudio = typeof audio.$inferInsert;

// Bookmarks
export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;

// Tags
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

// Junction tables
export type ChatterTag = typeof chatterTags.$inferSelect;
export type NewChatterTag = typeof chatterTags.$inferInsert;

export type QuoteTag = typeof quotesTags.$inferSelect;
export type NewQuoteTag = typeof quotesTags.$inferInsert;

export type PhotographTag = typeof photographsTags.$inferSelect;
export type NewPhotographTag = typeof photographsTags.$inferInsert;

export type MemeTag = typeof memesTags.$inferSelect;
export type NewMemeTag = typeof memesTags.$inferInsert;

export type BookmarkTag = typeof bookmarksTags.$inferSelect;
export type NewBookmarkTag = typeof bookmarksTags.$inferInsert;
