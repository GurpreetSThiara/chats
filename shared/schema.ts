import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  status: varchar("status").default("Available"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Workspaces table
export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  imageUrl: varchar("image_url"),
  ownerId: varchar("owner_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Workspace members table
export const workspaceMembers = pgTable("workspace_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role").notNull().default("member"), // admin, member, guest
  joinedAt: timestamp("joined_at").defaultNow(),
});

// Channels table
export const channels = pgTable("channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  type: varchar("type").notNull().default("public"), // public, private
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  createdById: varchar("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Channel members table (for private channels)
export const channelMembers = pgTable("channel_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at").defaultNow(),
});

// Messages table
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  content: text("content").notNull(),
  channelId: varchar("channel_id").references(() => channels.id, { onDelete: "cascade" }),
  directMessageId: varchar("direct_message_id").references(() => directMessages.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  parentMessageId: varchar("parent_message_id").references(() => messages.id), // for threads
  fileUrls: text("file_urls").array().default([]),
  mentions: varchar("mentions").array().default([]),
  reactions: jsonb("reactions").default({}),
  isPinned: boolean("is_pinned").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Direct messages table
export const directMessages = pgTable("direct_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  participants: varchar("participants").array().notNull(), // array of user IDs
  isGroup: boolean("is_group").default(false),
  name: varchar("name"), // for group DMs
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  workspaceMembers: many(workspaceMembers),
  channelMembers: many(channelMembers),
  sentMessages: many(messages),
  ownedWorkspaces: many(workspaces),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, {
    fields: [workspaces.ownerId],
    references: [users.id],
  }),
  members: many(workspaceMembers),
  channels: many(channels),
  directMessages: many(directMessages),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [workspaceMembers.userId],
    references: [users.id],
  }),
}));

export const channelsRelations = relations(channels, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [channels.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [channels.createdById],
    references: [users.id],
  }),
  members: many(channelMembers),
  messages: many(messages),
}));

export const channelMembersRelations = relations(channelMembers, ({ one }) => ({
  channel: one(channels, {
    fields: [channelMembers.channelId],
    references: [channels.id],
  }),
  user: one(users, {
    fields: [channelMembers.userId],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.id],
  }),
  directMessage: one(directMessages, {
    fields: [messages.directMessageId],
    references: [directMessages.id],
  }),
  parentMessage: one(messages, {
    fields: [messages.parentMessageId],
    references: [messages.id],
  }),
  replies: many(messages),
}));

export const directMessagesRelations = relations(directMessages, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [directMessages.workspaceId],
    references: [workspaces.id],
  }),
  messages: many(messages),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertChannelSchema = createInsertSchema(channels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDirectMessageSchema = createInsertSchema(directMessages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkspaceMemberSchema = createInsertSchema(workspaceMembers).omit({
  id: true,
  joinedAt: true,
});

export const insertChannelMemberSchema = createInsertSchema(channelMembers).omit({
  id: true,
  joinedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Workspace = typeof workspaces.$inferSelect;
export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type Channel = typeof channels.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertDirectMessage = z.infer<typeof insertDirectMessageSchema>;
export type DirectMessage = typeof directMessages.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type ChannelMember = typeof channelMembers.$inferSelect;
