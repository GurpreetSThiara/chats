import type { Express } from "express";
import { createServer, type Server } from "http";
 
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { insertMessageSchema, insertWorkspaceInviteSchema, messages } from "@shared/schema";
import multer from "multer";
import { setupSession } from "./auth/session";
import { isAuthenticated } from "./auth/middleware";
import { registerAuthRoutes } from "./routes/auth";
import { registerWorkspaceRoutes } from "./routes/workspaces";
import { registerChannelRoutes } from "./routes/channels";
import { registerSearchRoutes } from "./routes/search";
import { registerNotificationRoutes } from "./routes/notifications";
import { registerDirectMessageRoutes } from "./routes/directMessages";
import { isWorkspaceAdmin } from "./routes/helpers";
import { registerMessageRoutes } from "./routes/messages";
import { setupWebSocket } from "./ws";

// Configure multer for file uploads (in-memory storage for now)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

  

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup session
  setupSession(app);
  // Mount auth routes
  registerAuthRoutes(app);
  // Mount workspace routes
  registerWorkspaceRoutes(app);
  // Mount channel routes
  registerChannelRoutes(app);
  // Mount search routes
  registerSearchRoutes(app);
  // Mount notification routes
  registerNotificationRoutes(app);
  // Mount direct message routes
  registerDirectMessageRoutes(app);
  // Mount message read-only routes
  registerMessageRoutes(app);

  


  // Message routes
  app.post('/api/messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      console.log('[POST /api/messages] incoming body:', req.body);
      const messageData = insertMessageSchema.parse({ ...req.body, senderId: userId });
      console.log('[POST /api/messages] parsed data:', messageData);

      // Enforce a maximum thread depth of 3 levels (root=1, reply=2, reply-of-reply=3)
      if (messageData.parentMessageId) {
        console.log('[POST /api/messages] parentMessageId:', messageData.parentMessageId);
        // compute parent depth
        let parentDepth = 0;
        let currentId: string | null = messageData.parentMessageId;
        const visited = new Set<string>();
        while (currentId) {
          if (visited.has(currentId)) break; // safety against cycles
          visited.add(currentId);
          const parent = await storage.getMessage(currentId);
          if (!parent) break;
          parentDepth += 1;
          currentId = parent.parentMessageId ?? null;
          if (parentDepth >= 3) break;
        }
        if (parentDepth >= 3) {
          return res.status(400).json({ message: 'Thread depth limit reached (max 3 levels)' });
        }

        // Inherit channelId/directMessageId from parent to ensure reply is routed correctly
        const parentMsg = await storage.getMessage(messageData.parentMessageId);
        if (!parentMsg) {
          return res.status(400).json({ message: 'Parent message not found' });
        }
        console.log('[POST /api/messages] parent resolved:', parentMsg);
        // Force routing IDs to match parent exactly
        (messageData as any).channelId = parentMsg.channelId ?? null;
        (messageData as any).directMessageId = parentMsg.directMessageId ?? null;
        console.log('[POST /api/messages] inherited routing:', { channelId: (messageData as any).channelId, directMessageId: (messageData as any).directMessageId });
      } else {
        // For root messages (no parent), ensure exactly one routing target is provided
        const hasChannel = !!(messageData as any).channelId;
        const hasDM = !!(messageData as any).directMessageId;
        if (!hasChannel && !hasDM) {
          console.warn('[POST /api/messages] missing routing: neither channelId nor directMessageId provided');
          return res.status(400).json({ message: 'Either channelId or directMessageId is required' });
        }
        if (hasChannel && hasDM) {
          console.warn('[POST /api/messages] ambiguous routing: both channelId and directMessageId provided');
          return res.status(400).json({ message: 'Provide only one of channelId or directMessageId' });
        }
      }
      const message = await storage.createMessage(messageData);
      console.log('[POST /api/messages] created message:', message);
      
      // Broadcast message via WebSocket
      const messageWithSender = {
        ...message,
        sender: await storage.getUser(userId),
      };
      console.log('[POST /api/messages] broadcasting on id:', message.channelId || message.directMessageId, 'type: message');
      broadcastToChannel(message.channelId || message.directMessageId, 'message', messageWithSender);

      // Create in-app notifications for recipients
      try {
        if (message.directMessageId) {
          const dm = await storage.getDirectMessageById(message.directMessageId);
          if (dm) {
            const recipients = dm.participants.filter(p => p !== userId);
            for (const rid of recipients) {
              const notification = await storage.createNotification({
                userId: rid,
                type: 'message.created',
                data: { directMessageId: message.directMessageId, messageId: message.id },
              });
              broadcastToUser(rid, 'notification', notification);
            }
          }
        } else if (message.channelId) {
          const channel = await storage.getChannel(message.channelId);
          if (channel && channel.type === 'private') {
            const memberIds = await storage.getChannelMemberUserIds(channel.id);
            for (const rid of memberIds) {
              if (rid === userId) continue;
              const notification = await storage.createNotification({
                userId: rid,
                type: 'message.created',
                data: { channelId: channel.id, messageId: message.id },
              });
              broadcastToUser(rid, 'notification', notification);
            }
          }
        }
      } catch (notifyErr) {
        console.error('Error creating message notifications:', notifyErr);
      }
      
      res.json(message);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create message" });
    }
  });

  

  

  

  // Reaction routes
  app.post('/api/messages/:messageId/reactions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const { emoji } = req.body;
      await storage.addReaction(req.params.messageId, userId, emoji);
      
      // Broadcast reaction update via WebSocket
      broadcastReactionUpdate(req.params.messageId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding reaction:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to add reaction" });
    }
  });

  app.delete('/api/messages/:messageId/reactions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const { emoji } = req.body;
      await storage.removeReaction(req.params.messageId, userId, emoji);
      
      // Broadcast reaction update via WebSocket
      broadcastReactionUpdate(req.params.messageId);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing reaction:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to remove reaction" });
    }
  });

  // Edit / Pin message (kept here to access broadcastToChannel)
  app.patch('/api/messages/:messageId', isAuthenticated, async (req: any, res) => {
    try {
      const { messageId } = req.params;
      const userId = req.session.userId as string;
      const { content, isPinned } = req.body as { content?: string; isPinned?: boolean };

      const msg = await storage.getMessage(messageId);
      if (!msg) return res.status(404).json({ message: 'Message not found' });
      if (msg.senderId !== userId && typeof isPinned === 'undefined') {
        // Only author can edit content; pin/unpin can be done by anyone for now (could restrict to admins)
        return res.status(403).json({ message: 'Not authorized to edit this message' });
      }

      const updates: any = { };
      if (typeof content === 'string') updates.content = content;
      if (typeof isPinned === 'boolean') updates.isPinned = isPinned;
      if (Object.keys(updates).length === 0) return res.status(400).json({ message: 'No valid fields to update' });

      const [updated] = await db
        .update(messages)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(messages.id, messageId))
        .returning();

      // Broadcast update
      broadcastToChannel(updated.channelId || updated.directMessageId, 'message.updated', { id: updated.id, ...updates });
      res.json(updated);
    } catch (error) {
      console.error('Error updating message:', error);
      res.status(400).json({ message: 'Failed to update message' });
    }
  });

  // Delete message (kept here to access broadcastToChannel)
  app.delete('/api/messages/:messageId', isAuthenticated, async (req: any, res) => {
    try {
      const { messageId } = req.params;
      const userId = req.session.userId as string;
      const msg = await storage.getMessage(messageId);
      if (!msg) return res.status(404).json({ message: 'Message not found' });
      if (msg.senderId !== userId) return res.status(403).json({ message: 'Not authorized to delete this message' });

      // Hard delete for now
      await db.delete(messages).where(eq(messages.id, messageId));
      broadcastToChannel(msg.channelId || msg.directMessageId, 'message.deleted', { id: messageId });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting message:', error);
      res.status(400).json({ message: 'Failed to delete message' });
    }
  });

  // File upload routes
  app.post('/api/upload', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      
      // For now, we'll just return file info (in production, upload to S3/cloud storage)
      const fileInfo = {
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: `/api/files/${req.file.originalname}`, // placeholder URL
      };
      
      res.json(fileInfo);
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  const httpServer = createServer(app);
  const { broadcastToChannel, broadcastReactionUpdate, broadcastToUser } = setupWebSocket(httpServer);

  // In-app Invites
  app.post('/api/workspaces/:id/invites', isAuthenticated, async (req: any, res) => {
    try {
      const inviterId = req.session.userId as string;
      const workspaceId = req.params.id as string;
      const { email, role = 'member' } = req.body as { email?: string; role?: string };

      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      // Admin-only: sending invites requires admin role
      const admin = await isWorkspaceAdmin(inviterId, workspaceId);
      if (!admin) return res.status(403).json({ message: 'Only admins can send invites for this workspace' });

      // Determine invitee user if exists
      const invitee = await storage.getUserByEmail(email);

      // Validate against schema
      const inviteData = insertWorkspaceInviteSchema.parse({
        workspaceId,
        inviterId,
        inviteeEmail: email,
        inviteeUserId: invitee?.id,
        role,
        status: 'pending',
      });

      // Create invite
      const invite = await storage.createWorkspaceInvite(inviteData);

      // Create notification if invitee exists
      if (invitee) {
        const notification = await storage.createNotification({
          userId: invitee.id,
          type: 'invite.created',
          data: { inviteId: invite.id, workspaceId, inviterId, role, email },
        });
        broadcastToUser(invitee.id, 'notification', notification);
      }

      res.status(201).json(invite);
    } catch (error) {
      console.error('Error creating invite:', error);
      res.status(400).json({ message: error instanceof Error ? error.message : 'Failed to create invite' });
    }
  });

  app.get('/api/invites', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId as string;
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
      const invites = await storage.getUserInvites(userId, user.email);
      res.json(invites);
    } catch (error) {
      console.error('Error fetching invites:', error);
      res.status(500).json({ message: 'Failed to fetch invites' });
    }
  });

  app.post('/api/invites/:inviteId/accept', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId as string;
      const inviteId = req.params.inviteId as string;
      const invite = await storage.getInvite(inviteId);
      if (!invite) return res.status(404).json({ message: 'Invite not found' });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      // Ensure invite is for this user (by id or email)
      if (invite.inviteeUserId && invite.inviteeUserId !== userId) {
        return res.status(403).json({ message: 'Not authorized for this invite' });
      }
      if (!invite.inviteeUserId && invite.inviteeEmail !== user.email) {
        return res.status(403).json({ message: 'Not authorized for this invite' });
      }

      // Idempotency: if already accepted or declined, do not perform side effects again
      if (invite.status === 'accepted') {
        return res.json({ success: true });
      }
      if (invite.status === 'declined') {
        return res.status(400).json({ message: 'Invite already declined' });
      }

      // Mark accepted
      await storage.updateInviteStatus(inviteId, 'accepted');

      // Add as workspace member only if not already a member
      const existingMembers = await storage.getWorkspaceMembers(invite.workspaceId);
      const alreadyMember = existingMembers.some(m => m.userId === userId);
      if (!alreadyMember) {
        await storage.addWorkspaceMember({ workspaceId: invite.workspaceId, userId, role: invite.role });
      }

      // Notify inviter
      const inviter = await storage.getUser(invite.inviterId);
      if (inviter) {
        const notification = await storage.createNotification({
          userId: inviter.id,
          type: 'invite.accepted',
          data: { inviteId, workspaceId: invite.workspaceId, userId },
        });
        broadcastToUser(inviter.id, 'notification', notification);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error accepting invite:', error);
      res.status(400).json({ message: error instanceof Error ? error.message : 'Failed to accept invite' });
    }
  });

  app.post('/api/invites/:inviteId/decline', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId as string;
      const inviteId = req.params.inviteId as string;
      const invite = await storage.getInvite(inviteId);
      if (!invite) return res.status(404).json({ message: 'Invite not found' });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });

      if (invite.inviteeUserId && invite.inviteeUserId !== userId) {
        return res.status(403).json({ message: 'Not authorized for this invite' });
      }
      if (!invite.inviteeUserId && invite.inviteeEmail !== user.email) {
        return res.status(403).json({ message: 'Not authorized for this invite' });
      }

      await storage.updateInviteStatus(inviteId, 'declined');

      // Notify inviter
      const inviter = await storage.getUser(invite.inviterId);
      if (inviter) {
        const notification = await storage.createNotification({
          userId: inviter.id,
          type: 'invite.declined',
          data: { inviteId, workspaceId: invite.workspaceId, userId },
        });
        broadcastToUser(inviter.id, 'notification', notification);
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Error declining invite:', error);
      res.status(400).json({ message: error instanceof Error ? error.message : 'Failed to decline invite' });
    }
  });

  

  return httpServer;
}
