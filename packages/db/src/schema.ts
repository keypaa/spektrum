// @spektrum/db — full Drizzle schema (spec §4).
// Auth tables come from auth-schema.ts; everything below is ours.
import { relations, sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  uuid,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { citext } from "./citext";
import { users } from "./auth-schema";

export * from "./auth-schema";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const documentKindEnum = pgEnum("document_kind", [
  "tex",
  "bib",
  "img",
  "csv",
  "other",
]);

export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "editor",
  "viewer",
]);

export const renderStatusEnum = pgEnum("render_status", ["queued", "ok", "error"]);

export const chatRoleEnum = pgEnum("chat_role", [
  "user",
  "assistant",
  "system",
  "tool",
]);

export const titleSourceEnum = pgEnum("title_source", [
  "fallback",
  "llm",
  "manual",
]);

// ---------------------------------------------------------------------------
// Invites + admin audit (closed-signup security, spec §10)
// ---------------------------------------------------------------------------

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  // unique: the concurrency guard that makes a second redemption impossible
  acceptedUserId: text("accepted_user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const adminActions = pgTable("admin_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  targetId: text("target_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  reason: text("reason"),
  ip: text("ip"), // inet
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ---------------------------------------------------------------------------
// Projects / folders / documents
// ---------------------------------------------------------------------------

export const folders = pgTable("folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    folderId: uuid("folder_id").references(() => folders.id, {
      onDelete: "set null",
    }),
    mainDocumentId: uuid("main_document_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // partial index: active projects per owner (spec §4)
    index("projects_owner_active_idx")
      .on(table.ownerId)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    kind: documentKindEnum("kind").notNull().default("other"),
    // <= 512 KB lives here; larger/binary lives in S3 via blob_key
    content: text("content"),
    blobKey: text("blob_key"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("documents_project_path_key").on(table.projectId, table.path),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("viewer"),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.userId] })],
);

// ---------------------------------------------------------------------------
// Snapshots, PDF renders, chat, preferences, usage
// ---------------------------------------------------------------------------

export const snapshots = pgTable("snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const pdfRenders = pgTable(
  "pdf_renders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    revisionHash: text("revision_hash").notNull(),
    pdfKey: text("pdf_key"),
    synctexKey: text("synctex_key"),
    status: renderStatusEnum("status").notNull().default("queued"),
    log: text("log"),
    diagnostics: jsonb("diagnostics"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("pdf_renders_project_revision_key").on(
      table.projectId,
      table.revisionHash,
    ),
  ],
);

export const chatThreads = pgTable("chat_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  titleSource: titleSourceEnum("title_source").notNull().default("fallback"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => chatThreads.id, { onDelete: "cascade" }),
  role: chatRoleEnum("role").notNull(),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // the §9.6 settings object, stored as jsonb
  settings: jsonb("settings").notNull(),
});

export const llmUsage = pgTable("llm_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costEstimate: text("cost_estimate"),
  requestId: text("request_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  folder: one(folders, {
    fields: [projects.folderId],
    references: [folders.id],
  }),
  documents: many(documents),
  members: many(projectMembers),
  renders: many(pdfRenders),
  threads: many(chatThreads),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  project: one(projects, {
    fields: [documents.projectId],
    references: [projects.id],
  }),
  snapshots: many(snapshots),
}));

export const chatThreadsRelations = relations(
  chatThreads,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [chatThreads.projectId],
      references: [projects.id],
    }),
    user: one(users, {
      fields: [chatThreads.userId],
      references: [users.id],
    }),
    messages: many(chatMessages),
  }),
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  thread: one(chatThreads, {
    fields: [chatMessages.threadId],
    references: [chatThreads.id],
  }),
}));
