import {
  users,
  workspaces,
  channels,
  messages,
  directMessages,
  workspaceMembers,
  channelMembers,
  workspaceInvites,
  notifications,
  type User,
  type InsertUser,
  type InsertWorkspace,
  type Workspace,
  type InsertChannel,
  type Channel,
  type InsertMessage,
  type Message,
  type InsertDirectMessage,
  type DirectMessage,
  type WorkspaceMember,
  type ChannelMember,
  type InsertWorkspaceInvite,
  type WorkspaceInvite,
  type InsertNotification,
  type Notification,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, desc, ilike, inArray, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

export type ThreadNode = {
  message: Message;
  sender: User;
  replies: ThreadNode[];
};

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  upsertUser(user: { id: string; email: string; firstName: string; lastName: string; profileImageUrl?: string | null }): Promise<User>;
  
  // Workspace operations
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getUserWorkspaces(userId: string): Promise<Workspace[]>;
  getWorkspaceMembers(workspaceId: string): Promise<(WorkspaceMember & { user: User })[]>;
  addWorkspaceMember(data: { workspaceId: string; userId: string; role?: string }): Promise<WorkspaceMember>;
  
  // Channel operations
  createChannel(channel: InsertChannel): Promise<Channel>;
  getChannel(id: string): Promise<Channel | undefined>;
  getWorkspaceChannels(workspaceId: string, userId: string): Promise<Channel[]>;
  addChannelMember(data: { channelId: string; userId: string }): Promise<ChannelMember>;
  
  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getMessage(id: string): Promise<Message | undefined>;
  getChannelMessages(channelId: string, limit?: number, before?: string): Promise<(Message & { sender: User; repliesCount?: number })[]>;
  getDirectMessages(directMessageId: string, limit?: number, before?: string): Promise<(Message & { sender: User; repliesCount?: number })[]>;
  searchMessages(workspaceId: string, query: string): Promise<(Message & { sender: User; channel?: Channel })[]>;
  getThreadTree(rootMessageId: string, maxDepth?: number): Promise<ThreadNode | undefined>;
  
  // Direct message operations
  createDirectMessage(dm: InsertDirectMessage): Promise<DirectMessage>;
  getOrCreateDirectMessage(participants: string[], workspaceId: string): Promise<DirectMessage>;
  getUserDirectMessages(userId: string, workspaceId: string): Promise<(DirectMessage & { otherParticipants: User[] })[]>;
  getDirectMessageById(id: string): Promise<DirectMessage | undefined>;
  
  // Membership helper operations
  getWorkspaceMemberUserIds(workspaceId: string): Promise<string[]>;
  getChannelMemberUserIds(channelId: string): Promise<string[]>;
  
  // Reaction operations
  addReaction(messageId: string, userId: string, emoji: string): Promise<void>;
  removeReaction(messageId: string, userId: string, emoji: string): Promise<void>;

  // Invite operations
  createWorkspaceInvite(invite: InsertWorkspaceInvite): Promise<WorkspaceInvite>;
  getUserInvites(userId: string, email: string): Promise<WorkspaceInvite[]>;
  getInvite(id: string): Promise<WorkspaceInvite | undefined>;
  updateInviteStatus(id: string, status: string): Promise<WorkspaceInvite | undefined>;

  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: string): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getDirectMessageById(id: string): Promise<DirectMessage | undefined> {
    const [dm] = await db.select().from(directMessages).where(eq(directMessages.id, id));
    return dm;
  }

  async getMessage(id: string): Promise<Message | undefined> {
    const [msg] = await db.select().from(messages).where(eq(messages.id, id));
    return msg;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(userData: InsertUser): Promise<User> {
    // Hash password before storing
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        password: hashedPassword,
      })
      .returning();
    return user;
  }

  async upsertUser(userData: { id: string; email: string; firstName: string; lastName: string; profileImageUrl?: string | null }): Promise<User> {
    // Try by id first
    const existingById = await this.getUser(userData.id);
    if (existingById) {
      const [updated] = await db
        .update(users)
        .set({
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl ?? existingById.profileImageUrl ?? null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userData.id))
        .returning();
      return updated;
    }

    // If not found, we need to insert a new user. Our schema requires a password, so generate a random one.
    const randomPassword = `oauth:${Math.random().toString(36).slice(2)}:${Date.now()}`;
    const hashedPassword = await bcrypt.hash(randomPassword, 10);
    const [inserted] = await db
      .insert(users)
      .values({
        id: userData.id,
        email: userData.email,
        password: hashedPassword,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl ?? null,
      })
      .returning();
    return inserted;
  }

  // Workspace operations
  async createWorkspace(workspace: InsertWorkspace): Promise<Workspace> {
    console.log('Storage: Creating workspace with data:', workspace);
    try {
      const [newWorkspace] = await db
        .insert(workspaces)
        .values(workspace)
        .returning();
      
      console.log('Storage: Created workspace:', newWorkspace);
      
      // Add the owner as an admin member
      const [member] = await db.insert(workspaceMembers).values({
        workspaceId: newWorkspace.id,
        userId: workspace.ownerId,
        role: "admin",
      }).returning();
      
      console.log('Storage: Added workspace member:', member);

      // Create a general channel
      const [channel] = await db.insert(channels).values({
        name: "general",
        description: "General discussion for the team",
        type: "public",
        workspaceId: newWorkspace.id,
        createdById: workspace.ownerId,
      }).returning();
      
      console.log('Storage: Created general channel:', channel);

      return newWorkspace;
    } catch (error) {
      console.error('Storage: Error creating workspace:', error);
      throw error;
    }
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    return workspace;
  }

  async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    const result = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        description: workspaces.description,
        imageUrl: workspaces.imageUrl,
        ownerId: workspaces.ownerId,
        createdAt: workspaces.createdAt,
        updatedAt: workspaces.updatedAt,
      })
      .from(workspaces)
      .innerJoin(workspaceMembers, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId));
    
    return result;
  }

  async getWorkspaceMembers(workspaceId: string): Promise<(WorkspaceMember & { user: User })[]> {
    const result = await db
      .select()
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, workspaceId));
    
    return result.map(row => ({
      ...row.workspace_members,
      user: row.users,
    }));
  }

  async addWorkspaceMember(data: { workspaceId: string; userId: string; role?: string }): Promise<WorkspaceMember> {
    try {
      const [member] = await db
        .insert(workspaceMembers)
        .values({
          workspaceId: data.workspaceId,
          userId: data.userId,
          role: data.role || "member",
        })
        .returning();
      return member;
    } catch (err) {
      // On unique violation (duplicate membership), fetch and return existing membership
      const [existing] = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, data.workspaceId), eq(workspaceMembers.userId, data.userId)));
      if (existing) return existing;
      throw err;
    }
  }

  // Channel operations
  async createChannel(channel: InsertChannel): Promise<Channel> {
    const [newChannel] = await db
      .insert(channels)
      .values(channel)
      .returning();
    return newChannel;
  }

  async getChannel(id: string): Promise<Channel | undefined> {
    const [channel] = await db.select().from(channels).where(eq(channels.id, id));
    return channel;
  }

  async getWorkspaceChannels(workspaceId: string, userId: string): Promise<Channel[]> {
    // Get public channels and private channels the user is a member of
    const publicChannels = await db
      .select()
      .from(channels)
      .where(and(
        eq(channels.workspaceId, workspaceId),
        eq(channels.type, "public")
      ));

    const privateChannels = await db
      .select()
      .from(channels)
      .innerJoin(channelMembers, eq(channels.id, channelMembers.channelId))
      .where(and(
        eq(channels.workspaceId, workspaceId),
        eq(channels.type, "private"),
        eq(channelMembers.userId, userId)
      ))
      .then(result => result.map(row => row.channels));

    return [...publicChannels, ...privateChannels];
  }

  async addChannelMember(data: { channelId: string; userId: string }): Promise<ChannelMember> {
    try {
      const [member] = await db
        .insert(channelMembers)
        .values(data)
        .returning();
      return member;
    } catch (err) {
      const [existing] = await db
        .select()
        .from(channelMembers)
        .where(and(eq(channelMembers.channelId, data.channelId), eq(channelMembers.userId, data.userId)));
      if (existing) return existing;
      throw err;
    }
  }

  async getWorkspaceMemberUserIds(workspaceId: string): Promise<string[]> {
    const rows = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId));
    return rows.map((r) => r.userId);
  }

  async getChannelMemberUserIds(channelId: string): Promise<string[]> {
    const rows = await db
      .select({ userId: channelMembers.userId })
      .from(channelMembers)
      .where(eq(channelMembers.channelId, channelId));
    return rows.map((r) => r.userId);
  }

  // Message operations
  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db
      .insert(messages)
      .values(message)
      .returning();
    return newMessage;
  }

  async getThreadTree(rootMessageId: string, maxDepth: number = 3): Promise<ThreadNode | undefined> {
    // Resolve to the actual root by walking up parentMessageId chain
    let currentId = rootMessageId;
    const visited = new Set<string>();
    while (true) {
      if (visited.has(currentId)) break; // safety
      visited.add(currentId);
      const [row] = await db.select({ parentId: messages.parentMessageId }).from(messages).where(eq(messages.id, currentId));
      if (!row || !row.parentId) break;
      currentId = row.parentId;
    }

    // Fetch root with sender
    const rootRows = await db
      .select()
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.id, currentId));
    if (rootRows.length === 0) return undefined;
    const rootMsg = rootRows[0].messages;
    const rootSender = rootRows[0].users;

    const nodes = new Map<string, ThreadNode>();
    const rootNode: ThreadNode = { message: rootMsg, sender: rootSender, replies: [] };
    nodes.set(rootMsg.id, rootNode);

    let currentLevelIds = [rootMsg.id];
    let depth = 1;
    while (currentLevelIds.length > 0 && depth < maxDepth) {
      // Fetch children of all messages in current level
      const childRows = await db
        .select()
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .where(inArray(messages.parentMessageId, currentLevelIds));

      const nextLevelIds: string[] = [];
      for (const row of childRows) {
        const msg = row.messages;
        const sender = row.users;
        const node: ThreadNode = { message: msg, sender, replies: [] };
        nodes.set(msg.id, node);
        if (msg.parentMessageId && nodes.has(msg.parentMessageId)) {
          nodes.get(msg.parentMessageId)!.replies.push(node);
        }
        nextLevelIds.push(msg.id);
      }
      currentLevelIds = nextLevelIds;
      depth += 1;
    }

    return rootNode;
  }

  async getChannelMessages(channelId: string, limit: number = 50, before?: string): Promise<(Message & { sender: User; repliesCount?: number })[]> {
    // Support cursor by createdAt timestamp or by messageId (we'll resolve to createdAt if not a Date)
    let beforeDate: Date | undefined = undefined;
    if (before) {
      const d = new Date(before);
      if (!isNaN(d.getTime())) {
        beforeDate = d;
      } else {
        const msg = await this.getMessage(before);
        if (msg?.createdAt) beforeDate = new Date(msg.createdAt as any);
      }
    }

    const base = db
      .select()
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id));

    const rows = await (beforeDate
      ? base
          .where(and(eq(messages.channelId, channelId), sql`${messages.createdAt} < ${beforeDate}`))
          .orderBy(desc(messages.createdAt))
          .limit(limit)
      : base
          .where(eq(messages.channelId, channelId))
          .orderBy(desc(messages.createdAt))
          .limit(limit)
    );
    // Count replies per message
    const msgIds = rows.map(r => r.messages.id);
    let counts = new Map<string, number>();
    if (msgIds.length > 0) {
      const rows = await db
        .select({ parentId: messages.parentMessageId, count: sql<number>`count(*)` })
        .from(messages)
        .where(inArray(messages.parentMessageId, msgIds))
        .groupBy(messages.parentMessageId);
      counts = new Map(rows.map(r => [r.parentId as string, Number(r.count)]));
    }
    return rows.map(row => ({
      ...row.messages,
      sender: row.users,
      repliesCount: counts.get(row.messages.id) || 0,
    })).reverse();
  }

  async getDirectMessages(directMessageId: string, limit: number = 50, before?: string): Promise<(Message & { sender: User; repliesCount?: number })[]> {
    let beforeDate: Date | undefined = undefined;
    if (before) {
      const d = new Date(before);
      if (!isNaN(d.getTime())) {
        beforeDate = d;
      } else {
        const msg = await this.getMessage(before);
        if (msg?.createdAt) beforeDate = new Date(msg.createdAt as any);
      }
    }

    const base = db
      .select()
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id));

    const rows = await (beforeDate
      ? base
          .where(and(eq(messages.directMessageId, directMessageId), sql`${messages.createdAt} < ${beforeDate}`))
          .orderBy(desc(messages.createdAt))
          .limit(limit)
      : base
          .where(eq(messages.directMessageId, directMessageId))
          .orderBy(desc(messages.createdAt))
          .limit(limit)
    );
    // Count replies per message
    const msgIds = rows.map(r => r.messages.id);
    let counts = new Map<string, number>();
    if (msgIds.length > 0) {
      const rows = await db
        .select({ parentId: messages.parentMessageId, count: sql<number>`count(*)` })
        .from(messages)
        .where(inArray(messages.parentMessageId, msgIds))
        .groupBy(messages.parentMessageId);
      counts = new Map(rows.map(r => [r.parentId as string, Number(r.count)]));
    }
    return rows.map(row => ({
      ...row.messages,
      sender: row.users,
      repliesCount: counts.get(row.messages.id) || 0,
    })).reverse();
  }

  async searchMessages(workspaceId: string, query: string): Promise<(Message & { sender: User; channel?: Channel })[]> {
    const result = await db
      .select()
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .leftJoin(channels, eq(messages.channelId, channels.id))
      .where(and(
        or(
          eq(channels.workspaceId, workspaceId),
          // For direct messages, we need to check workspace through direct_messages table
          eq(directMessages.workspaceId, workspaceId)
        ),
        ilike(messages.content, `%${query}%`)
      ))
      .orderBy(desc(messages.createdAt))
      .limit(50);
    
    return result.map(row => ({
      ...row.messages,
      sender: row.users,
      channel: row.channels || undefined,
    }));
  }

  // Direct message operations
  async createDirectMessage(dm: InsertDirectMessage): Promise<DirectMessage> {
    const [newDM] = await db
      .insert(directMessages)
      .values(dm)
      .returning();
    return newDM;
  }

  async getOrCreateDirectMessage(participants: string[], workspaceId: string): Promise<DirectMessage> {
    // Sort participants to ensure consistent ordering
    const sortedParticipants = [...participants].sort();
    
    // Try to find existing DM
    const [existingDM] = await db
      .select()
      .from(directMessages)
      .where(and(
        eq(directMessages.workspaceId, workspaceId),
        eq(directMessages.participants, sortedParticipants)
      ));

    if (existingDM) {
      return existingDM;
    }

    // Create new DM
    return this.createDirectMessage({
      participants: sortedParticipants,
      workspaceId,
      isGroup: sortedParticipants.length > 2,
    });
  }

  async getUserDirectMessages(userId: string, workspaceId: string): Promise<(DirectMessage & { otherParticipants: User[] })[]> {
    const dms = await db
      .select()
      .from(directMessages)
      .where(and(
        eq(directMessages.workspaceId, workspaceId),
        sql`${userId} = ANY(${directMessages.participants})`
      ));

    // Get other participants for each DM
    const result = await Promise.all(
      dms.map(async (dm) => {
        const otherParticipantIds = dm.participants.filter(p => p !== userId);
        const otherParticipants = await db
          .select()
          .from(users)
          .where(inArray(users.id, otherParticipantIds));
        
        return {
          ...dm,
          otherParticipants,
        };
      })
    );

    return result;
  }

  // Reaction operations
  async addReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    const [message] = await db.select().from(messages).where(eq(messages.id, messageId));
    if (!message) return;

    const reactions = (message.reactions as Record<string, string[]>) || {};
    if (!reactions[emoji]) {
      reactions[emoji] = [];
    }
    
    if (!reactions[emoji].includes(userId)) {
      reactions[emoji].push(userId);
    }

    await db
      .update(messages)
      .set({ reactions })
      .where(eq(messages.id, messageId));
  }

  async removeReaction(messageId: string, userId: string, emoji: string): Promise<void> {
    const [message] = await db.select().from(messages).where(eq(messages.id, messageId));
    if (!message) return;

    const reactions = (message.reactions as Record<string, string[]>) || {};
    if (reactions[emoji]) {
      reactions[emoji] = reactions[emoji].filter(id => id !== userId);
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    }

    await db
      .update(messages)
      .set({ reactions })
      .where(eq(messages.id, messageId));
  }

  // Invite operations
  async createWorkspaceInvite(invite: InsertWorkspaceInvite): Promise<WorkspaceInvite> {
    const [row] = await db.insert(workspaceInvites).values(invite).returning();
    return row;
  }

  async getUserInvites(userId: string, email: string): Promise<WorkspaceInvite[]> {
    // Invites addressed to the userId or to their email
    const byUser = await db.select().from(workspaceInvites).where(eq(workspaceInvites.inviteeUserId, userId));
    const byEmail = await db.select().from(workspaceInvites).where(eq(workspaceInvites.inviteeEmail, email));
    // Merge unique by id
    const map = new Map<string, WorkspaceInvite>();
    for (const inv of [...byUser, ...byEmail]) map.set(inv.id, inv);
    return Array.from(map.values());
  }

  async getInvite(id: string): Promise<WorkspaceInvite | undefined> {
    const [row] = await db.select().from(workspaceInvites).where(eq(workspaceInvites.id, id));
    return row;
  }

  async updateInviteStatus(id: string, status: string): Promise<WorkspaceInvite | undefined> {
    const [row] = await db.update(workspaceInvites).set({ status }).where(eq(workspaceInvites.id, id)).returning();
    return row;
  }

  // Notification operations
  async createNotification(notificationData: InsertNotification): Promise<Notification> {
    const [row] = await db.insert(notifications).values(notificationData).returning();
    return row;
  }

  async getUserNotifications(userId: string): Promise<Notification[]> {
    const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
    return rows;
  }

  async markNotificationRead(id: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
  }
}

export const storage = new DatabaseStorage();
