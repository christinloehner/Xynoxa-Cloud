/*
 * Copyright (C) 2025 Christin Löhner
 */

import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  text,
  integer,
  bigint,
  vector,
  unique,
  uniqueIndex,
  bigserial
} from "drizzle-orm/pg-core";
import { jsonb, index } from "drizzle-orm/pg-core";


export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: varchar("role", { length: 32 }).notNull().default("member"),
  emailVerified: boolean("email_verified").notNull().default(false),
  disabled: boolean("disabled").notNull().default(false),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  recoveryCodes: text("recovery_codes").array(),
  sessionVersion: integer("session_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const tenantMembers = pgTable("tenant_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 32 }).notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 255 }),
  avatarUrl: text("avatar_url"),
  avatarStoragePath: text("avatar_storage_path"),
  avatarMime: varchar("avatar_mime", { length: 64 }),
  locale: varchar("locale", { length: 16 }).default("de"),
  bio: text("bio"),
  publicProfile: boolean("public_profile").notNull().default(false),
  profileUrl: varchar("profile_url", { length: 64 }),
  showEmail: boolean("show_email").notNull().default(false),
  showBirthDate: boolean("show_birth_date").notNull().default(false),
  showBirthPlace: boolean("show_birth_place").notNull().default(false),
  showPhone: boolean("show_phone").notNull().default(false),
  showAddress: boolean("show_address").notNull().default(false),
  showOccupation: boolean("show_occupation").notNull().default(false),
  showCity: boolean("show_city").notNull().default(false),
  searchAutoReindex: boolean("search_auto_reindex").notNull().default(true),
  firstName: varchar("first_name", { length: 128 }),
  lastName: varchar("last_name", { length: 128 }),
  pronouns: varchar("pronouns", { length: 64 }),
  phone: varchar("phone", { length: 64 }),
  street: varchar("street", { length: 255 }),
  houseNumber: varchar("house_number", { length: 32 }),
  postalCode: varchar("postal_code", { length: 32 }),
  city: varchar("city", { length: 255 }),
  birthDate: timestamp("birth_date", { withTimezone: false }),
  birthPlace: varchar("birth_place", { length: 255 }),
  occupation: varchar("occupation", { length: 255 }),
  websites: text("websites").array(),
  xUrl: varchar("x_url", { length: 255 }),
  fediverseUrl: varchar("fediverse_url", { length: 255 }),
  instagramUrl: varchar("instagram_url", { length: 255 }),
  youtubeUrl: varchar("youtube_url", { length: 255 }),
  twitchUrl: varchar("twitch_url", { length: 255 })
}, (t) => ({
  profileUrlUnique: uniqueIndex("user_profiles_profile_url_unique").on(t.profileUrl)
}));

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }), // Groups might still have an 'owner' (creator) but it doesn't imply special rights other than creation.
  createdAt: timestamp("created_at").defaultNow().notNull()
});

// Flat membership - just user <-> group link
export const groupMembers = pgTable(
  "group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .references(() => groups.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull()
  },
  (t) => ({
    unq: unique().on(t.groupId, t.userId)
  })
);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 128 }).notNull(),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const passwordResets = pgTable("password_resets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const uploadSessions = pgTable("upload_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mime: varchar("mime", { length: 128 }),
  size: bigint("size", { mode: "number" }),
  totalChunks: integer("total_chunks").notNull(),
  isVault: boolean("is_vault").default(false),
  iv: text("iv"),
  originalName: text("original_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }) // Optional: Target file for update
});

export const groupFolders = pgTable("group_folders", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const groupFolderAccess = pgTable("group_folder_access", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupFolderId: uuid("group_folder_id")
    .notNull()
    .references(() => groupFolders.id, { onDelete: "cascade" }),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  canWrite: boolean("can_write").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  unq: unique().on(t.groupFolderId, t.groupId)
}));

export const folders = pgTable("folders", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .references(() => users.id, { onDelete: "cascade" }), // Nullable for Group Folders
  groupFolderId: uuid("group_folder_id")
    .references(() => groupFolders.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"), // self-ref FK optional
  name: varchar("name", { length: 255 }).notNull(),
  isVault: boolean("is_vault").default(false),
  envelopeCipher: text("envelope_cipher"),
  envelopeIv: text("envelope_iv"),
  envelopeSalt: varchar("envelope_salt", { length: 64 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const files = pgTable("files", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .references(() => users.id, { onDelete: "cascade" }), // Nullable for Group Folders
  groupFolderId: uuid("group_folder_id")
    .references(() => groupFolders.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  size: varchar("size", { length: 64 }),
  mime: varchar("mime", { length: 128 }),
  hash: varchar("hash", { length: 128 }),
  storagePath: text("storage_path"),
  iv: text("iv"),
  originalName: text("original_name"),
  isDeleted: boolean("is_deleted").default(false),
  isVault: boolean("is_vault").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const fileVersions = pgTable("file_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  fileId: uuid("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  size: varchar("size", { length: 64 }),
  mime: varchar("mime", { length: 128 }),
  hash: varchar("hash", { length: 128 }),
  storagePath: text("storage_path"),
  iv: text("iv"),
  originalName: text("original_name"),
  isSnapshot: boolean("is_snapshot").notNull().default(true),
  // Self-reference breaks TS inference when used inline; FK is enforced in migration.
  baseVersionId: uuid("base_version_id"),
  deltaStrategy: varchar("delta_strategy", { length: 32 }),
  deltaSize: integer("delta_size"),
  chunkCount: integer("chunk_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const chunks = pgTable("chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  hash: varchar("hash", { length: 128 }).notNull().unique(),
  size: integer("size").notNull(),
  compressedSize: integer("compressed_size").notNull(),
  storagePath: text("storage_path").notNull(),
  refCount: integer("ref_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const fileVersionChunks = pgTable("file_version_chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  versionId: uuid("version_id").notNull().references(() => fileVersions.id, { onDelete: "cascade" }),
  chunkId: uuid("chunk_id").notNull().references(() => chunks.id, { onDelete: "cascade" }),
  idx: integer("idx").notNull()
}, (t) => ({
  versionIdx: index("fvc_version_idx").on(t.versionId, t.idx)
}));

export const fileDeltas = pgTable("file_deltas", {
  id: uuid("id").defaultRandom().primaryKey(),
  versionId: uuid("version_id").notNull().references(() => fileVersions.id, { onDelete: "cascade" }).unique(),
  baseVersionId: uuid("base_version_id").notNull().references(() => fileVersions.id, { onDelete: "cascade" }),
  strategy: varchar("strategy", { length: 32 }).notNull(),
  patch: text("patch").notNull(),
  patchSize: integer("patch_size"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  href: text("href"),
  meta: jsonb("meta"),
  level: varchar("level", { length: 32 }).notNull().default("info"),
  readAt: timestamp("read_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  userCreatedIdx: index("notifications_user_created_idx").on(t.userId, t.createdAt),
  unreadIdx: index("notifications_unread_idx").on(t.userId, t.readAt)
}));

export const shares = pgTable("shares", {
  id: uuid("id").defaultRandom().primaryKey(),
  fileId: uuid("file_id")
    .references(() => files.id, { onDelete: "cascade" }),
  noteId: uuid("note_id")
    .references(() => notes.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id")
    .references(() => folders.id, { onDelete: "cascade" }),
  bookmarkId: uuid("bookmark_id")
    .references(() => bookmarks.id, { onDelete: "cascade" }),
  taskId: uuid("task_id")
    .references(() => tasks.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  passwordHash: varchar("password_hash", { length: 255 }),
  internal: boolean("internal").default(false).notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const shareRecipients = pgTable("share_recipients", {
  id: uuid("id").defaultRandom().primaryKey(),
  shareId: uuid("share_id")
    .notNull()
    .references(() => shares.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  shareUserUnique: uniqueIndex("share_recipient_user_unq").on(t.shareId, t.userId),
  shareGroupUnique: uniqueIndex("share_recipient_group_unq").on(t.shareId, t.groupId)
}));

export const notes = pgTable("notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  isVault: boolean("is_vault").default(false),
  ciphertext: text("ciphertext"),
  iv: text("iv"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// Module: Bookmarks (mod_bookmarks)
export const bookmarks = pgTable("mod_bookmarks", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  faviconUrl: text("favicon_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

// Module: Projects (mod_projects)
export const projects = pgTable("mod_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").references(() => groups.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 32 }).default("active").notNull(),
  visibility: varchar("visibility", { length: 32 }).default("private").notNull(),
  tags: text("tags").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  ownerIdx: index("mod_projects_owner_idx").on(t.ownerId),
  groupIdx: index("mod_projects_group_idx").on(t.groupId),
  statusIdx: index("mod_projects_status_idx").on(t.status)
}));

export const projectMembers = pgTable("mod_project_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 32 }).default("member").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  uniqueMember: uniqueIndex("mod_project_member_unq").on(t.projectId, t.userId),
  projectIdx: index("mod_project_member_project_idx").on(t.projectId)
}));

export const projectSections = pgTable("mod_project_sections", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  color: varchar("color", { length: 32 }),
  position: integer("position").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  projectIdx: index("mod_project_sections_project_idx").on(t.projectId),
  positionIdx: index("mod_project_sections_position_idx").on(t.projectId, t.position)
}));

export const projectMilestones = pgTable("mod_project_milestones", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  status: varchar("status", { length: 32 }).default("open").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  projectIdx: index("mod_project_milestones_project_idx").on(t.projectId),
  statusIdx: index("mod_project_milestones_status_idx").on(t.status)
}));

export const projectTasks = pgTable("mod_project_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  milestoneId: uuid("milestone_id").references(() => projectMilestones.id, { onDelete: "set null" }),
  sectionId: uuid("section_id").references(() => projectSections.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  priority: varchar("priority", { length: 16 }).default("medium").notNull(),
  status: varchar("status", { length: 32 }).default("open").notNull(),
  tags: text("tags").array(),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
  startAt: timestamp("start_at", { withTimezone: true }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  estimateHours: integer("estimate_hours"),
  order: integer("order").default(0).notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  projectIdx: index("mod_project_tasks_project_idx").on(t.projectId),
  sectionIdx: index("mod_project_tasks_section_idx").on(t.sectionId),
  assigneeIdx: index("mod_project_tasks_assignee_idx").on(t.assigneeId),
  statusIdx: index("mod_project_tasks_status_idx").on(t.status),
  dueIdx: index("mod_project_tasks_due_idx").on(t.dueAt)
}));

export const projectTaskComments = pgTable("mod_project_task_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => projectTasks.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  taskIdx: index("mod_project_task_comments_task_idx").on(t.taskId),
  parentIdx: index("mod_project_task_comments_parent_idx").on(t.parentId)
}));

export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
});

export const entityTags = pgTable("entity_tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  tagId: uuid("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
  entityId: uuid("entity_id").notNull(),
  entityType: varchar("entity_type", { length: 32 }).notNull(),
  fileId: uuid("file_id").references(() => files.id, { onDelete: "cascade" }),
  noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
  bookmarkId: uuid("bookmark_id").references(() => bookmarks.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  location: varchar("location", { length: 255 }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  recurrence: varchar("recurrence", { length: 64 }),
  icalUid: varchar("ical_uid", { length: 255 }),
  source: varchar("source", { length: 64 }).default("app"),
  externalId: varchar("external_id", { length: 255 }),
  externalCalendarId: varchar("external_calendar_id", { length: 255 }),
  externalSource: varchar("external_source", { length: 32 }),
  externalUpdatedAt: timestamp("external_updated_at", { withTimezone: true }),
  externalEtag: varchar("external_etag", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 32 }).default("todo").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
  icalUid: varchar("ical_uid", { length: 255 }),
  source: varchar("source", { length: 64 }).default("app"),
  externalId: varchar("external_id", { length: 255 }),
  externalSource: varchar("external_source", { length: 32 }),
  externalUpdatedAt: timestamp("external_updated_at", { withTimezone: true }),
  externalEtag: varchar("external_etag", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const extractedTexts = pgTable("extracted_texts", {
  id: uuid("id").defaultRandom().primaryKey(),
  fileId: uuid("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  content: text("content"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const embeddings = pgTable("embeddings", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").references(() => files.id, { onDelete: "cascade" }),
  noteId: uuid("note_id").references(() => notes.id, { onDelete: "cascade" }),
  bookmarkId: uuid("bookmark_id").references(() => bookmarks.id, { onDelete: "cascade" }),
  eventId: uuid("event_id").references(() => calendarEvents.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  vector: vector("vector", { dimensions: 384 }).notNull(), // all-MiniLM-L6-v2 embedding size
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});


export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  tokenHash: varchar("token_hash", { length: 255 }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const calendarProviderAccounts = pgTable("calendar_provider_accounts", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 32 }).notNull().default("google"),
  calendarId: varchar("calendar_id", { length: 255 }).notNull().default("primary"),
  defaultCalendarId: varchar("default_calendar_id", { length: 255 }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  syncToken: text("sync_token"),
  channelId: text("channel_id"),
  resourceId: text("resource_id"),
  channelExpiresAt: timestamp("channel_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

export const calendarGoogleCalendars = pgTable("calendar_google_calendars", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  calendarId: varchar("calendar_id", { length: 255 }).notNull(),
  summary: varchar("summary", { length: 255 }),
  timezone: varchar("timezone", { length: 128 }),
  isPrimary: boolean("is_primary").notNull().default(false),
  isSelected: boolean("is_selected").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  color: varchar("color", { length: 32 }),
  syncToken: text("sync_token"),
  channelId: text("channel_id"),
  resourceId: text("resource_id"),
  channelExpiresAt: timestamp("channel_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  uniqCalendar: uniqueIndex("calendar_google_cal_uniq").on(t.userId, t.calendarId)
}));

// Settings for system-wide configuration
export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value").notNull(), // JSON stringified value
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});


export const syncJournal = pgTable("sync_journal", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  entityType: varchar("entity_type", { length: 32 }).notNull(), // 'file', 'folder'
  entityId: uuid("entity_id").notNull(),
  action: varchar("action", { length: 32 }).notNull(), // 'create', 'update', 'move', 'delete'
  versionId: uuid("version_id"),
  baseVersionId: uuid("base_version_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

/**
 * Module Management Table
 * 
 * Stores information about installed/activated modules in Xynoxa Cloud.
 * Modules are auto-discovered from the /src/modules directory.
 */
export const modules = pgTable("modules", {
  id: uuid("id").defaultRandom().primaryKey(),
  moduleId: varchar("module_id", { length: 128 }).notNull().unique(), // e.g., "bookmarks", "test-modul"
  name: varchar("name", { length: 255 }).notNull(), // Display name
  description: text("description"),
  version: varchar("version", { length: 32 }).notNull(), // Semantic version
  author: varchar("author", { length: 255 }),
  logoUrl: text("logo_url"), // Optional logo/icon URL
  status: varchar("status", { length: 32 }).notNull().default("inactive"), // 'inactive', 'active', 'error'
  installError: text("install_error"), // Error message if installation failed
  installedAt: timestamp("installed_at", { withTimezone: true }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});
