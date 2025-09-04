import {
  users,
  workspaces,
  channels,
  messages,
  directMessages,
  workspaceMembers,
  channelMembers,
  type User,
  type UpsertUser,
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
  type InsertWorkspaceMemberSchema,
  type InsertChannelMemberSchema,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, or, desc, ilike, inArray } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
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
  getChannelMessages(channelId: string, limit?: number): Promise<(Message & { sender: User })[]>;
  getDirectMessages(directMessageId: string, limit?: number): Promise<(Message & { sender: User })[]>;
  searchMessages(workspaceId: string, query: string): Promise<(Message & { sender: User; channel?: Channel })[]>;
  
  // Direct message operations
  createDirectMessage(dm: InsertDirectMessage): Promise<DirectMessage>;
  getOrCreateDirectMessage(participants: string[], workspaceId: string): Promise<DirectMessage>;
  getUserDirectMessages(userId: string, workspaceId: string): Promise<(DirectMessage & { otherParticipants: User[] })[]>;
  
  // Reaction operations
  addReaction(messageId: string, userId: string, emoji: string): Promise<void>;
  removeReaction(messageId: string, userId: string, emoji: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Workspace operations
  async createWorkspace(workspace: InsertWorkspace): Promise<Workspace> {
    const [newWorkspace] = await db
      .insert(workspaces)
      .values(workspace)
      .returning();
    
    // Add the owner as an admin member
    await db.insert(workspaceMembers).values({
      workspaceId: newWorkspace.id,
      userId: workspace.ownerId,
      role: "admin",
    });

    // Create a general channel
    await db.insert(channels).values({
      name: "general",
      description: "General discussion for the team",
      type: "public",
      workspaceId: newWorkspace.id,
      createdById: workspace.ownerId,
    });

    return newWorkspace;
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
    const [member] = await db
      .insert(workspaceMembers)
      .values({
        workspaceId: data.workspaceId,
        userId: data.userId,
        role: data.role || "member",
      })
      .returning();
    return member;
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
    const [member] = await db
      .insert(channelMembers)
      .values(data)
      .returning();
    return member;
  }

  // Message operations
  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db
      .insert(messages)
      .values(message)
      .returning();
    return newMessage;
  }

  async getChannelMessages(channelId: string, limit: number = 50): Promise<(Message & { sender: User })[]> {
    const result = await db
      .select()
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.channelId, channelId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    
    return result.map(row => ({
      ...row.messages,
      sender: row.users,
    })).reverse();
  }

  async getDirectMessages(directMessageId: string, limit: number = 50): Promise<(Message & { sender: User })[]> {
    const result = await db
      .select()
      .from(messages)
      .innerJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.directMessageId, directMessageId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    
    return result.map(row => ({
      ...row.messages,
      sender: row.users,
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
}

export const storage = new DatabaseStorage();
