import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { insertWorkspaceSchema, insertChannelSchema, insertMessageSchema, signupSchema, loginSchema, insertWorkspaceInviteSchema, messages } from "@shared/schema";
import multer from "multer";
import bcrypt from "bcryptjs";
import session from "express-session";
import connectPg from "connect-pg-simple";

// Configure multer for file uploads (in-memory storage for now)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Session configuration
function setupSession(app: Express) {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL || `postgres://postgres:${encodeURIComponent("qT*bk#sNPVF2gh_")}@db.ildxigzkdixzepsxslsl.supabase.co:5432/postgres?sslmode=require`,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });


  app.use(session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      maxAge: sessionTtl,
    },
  }));
}

// Auth middleware
const isAuthenticated: RequestHandler = (req: any, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized" });
};

  async function isWorkspaceAdmin(userId: string, workspaceId: string): Promise<boolean> {
    const members = await storage.getWorkspaceMembers(workspaceId);
    const me = members.find(m => m.userId === userId);
    return me?.role === 'admin';
  }

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup session
  setupSession(app);

  // Auth routes
  app.post('/api/signup', async (req, res) => {
    try {
      const userData = signupSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Create user
      const user = await storage.createUser({
        email: userData.email,
        password: userData.password,
        firstName: userData.firstName,
        lastName: userData.lastName,
      });

      // Create session
      (req.session as any).userId = user.id;
      
      res.json({ user: { ...user, password: undefined } });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create account" });
    }
  });

  app.post('/api/login', async (req, res) => {
    try {
      const loginData = loginSchema.parse(req.body);
      
      // Find user
      const user = await storage.getUserByEmail(loginData.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Check password
      const isValidPassword = await bcrypt.compare(loginData.password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Create session
      (req.session as any).userId = user.id;
      
      res.json({ user: { ...user, password: undefined } });
    } catch (error) {
      console.error("Login error:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to login" });
    }
  });

  app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.clearCookie('connect.sid');
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ ...user, password: undefined });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Workspace routes
  app.post('/api/workspaces', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      console.log('Creating workspace for user:', userId, 'with data:', req.body);
      const workspaceData = insertWorkspaceSchema.parse({ ...req.body, ownerId: userId });
      console.log('Parsed workspace data:', workspaceData);
      const workspace = await storage.createWorkspace(workspaceData);
      console.log('Created workspace:', workspace);
      res.json(workspace);
    } catch (error) {
      console.error("Error creating workspace:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Failed to create workspace",
        details: error instanceof Error ? error.stack : undefined
      });
    }
  });

  app.get('/api/workspaces', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const workspaces = await storage.getUserWorkspaces(userId);
      res.json(workspaces);
    } catch (error) {
      console.error("Error fetching workspaces:", error);
      res.status(500).json({ message: "Failed to fetch workspaces" });
    }
  });

  app.get('/api/workspaces/:id', isAuthenticated, async (req: any, res) => {
    try {
      const workspace = await storage.getWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ message: "Workspace not found" });
      }
      res.json(workspace);
    } catch (error) {
      console.error("Error fetching workspace:", error);
      res.status(500).json({ message: "Failed to fetch workspace" });
    }
  });

  app.get('/api/workspaces/:id/members', isAuthenticated, async (req, res) => {
    try {
      const members = await storage.getWorkspaceMembers(req.params.id);
      res.json(members);
    } catch (error) {
      console.error("Error fetching workspace members:", error);
      res.status(500).json({ message: "Failed to fetch workspace members" });
    }
  });

  app.post('/api/workspaces/:id/members', isAuthenticated, async (req: any, res) => {
    try {
      const workspaceId = req.params.id;
      const { email, role = 'member' } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user is already a member
      const members = await storage.getWorkspaceMembers(workspaceId);
      if (members.some(m => m.userId === user.id)) {
        return res.status(400).json({ message: "User is already a member of this workspace" });
      }

      // Add user to workspace
      const member = await storage.addWorkspaceMember({
        workspaceId,
        userId: user.id,
        role
      });

      res.status(201).json(member);
    } catch (error) {
      console.error("Error adding workspace member:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to add member to workspace" 
      });
    }
  });

  // Channel routes
  app.post('/api/channels', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const channelData = insertChannelSchema.parse({ ...req.body, createdById: userId });
      // Admin-only: creating channels requires admin role in the target workspace
      const admin = await isWorkspaceAdmin(userId, channelData.workspaceId);
      if (!admin) return res.status(403).json({ message: 'Only admins can create channels in this workspace' });
      const channel = await storage.createChannel(channelData);
      
      // Add creator to private channels
      if (channel.type === "private") {
        await storage.addChannelMember({ channelId: channel.id, userId });
      }
      
      res.json(channel);
    } catch (error) {
      console.error("Error creating channel:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create channel" });
    }
  });

  app.get('/api/workspaces/:workspaceId/channels', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const channels = await storage.getWorkspaceChannels(req.params.workspaceId, userId);
      res.json(channels);
    } catch (error) {
      console.error("Error fetching channels:", error);
      res.status(500).json({ message: "Failed to fetch channels" });
    }
  });

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

  // Thread routes
  app.get('/api/threads/:messageId', isAuthenticated, async (req: any, res) => {
    try {
      const { messageId } = req.params;
      const tree = await storage.getThreadTree(messageId, 3);
      if (!tree) return res.status(404).json({ message: 'Message not found' });
      res.json(tree);
    } catch (error) {
      console.error('Error fetching thread tree:', error);
      res.status(400).json({ message: 'Failed to fetch thread' });
    }
  });

  app.get('/api/channels/:channelId/messages', isAuthenticated, async (req, res) => {
    try {
      const { limit, before } = req.query as { limit?: string; before?: string };
      const parsedLimit = limit ? Math.max(1, Math.min(100, parseInt(limit))) : undefined;
      const items = await storage.getChannelMessages(req.params.channelId, parsedLimit, before);
      res.json(items);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Direct message routes
  app.post('/api/direct-messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const { participants, workspaceId } = req.body;
      
      // Ensure current user is in participants
      const allParticipants = [...new Set([userId, ...participants])];
      
      const dm = await storage.getOrCreateDirectMessage(allParticipants, workspaceId);
      res.json(dm);
    } catch (error) {
      console.error("Error creating direct message:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create direct message" });
    }
  });

  app.get('/api/workspaces/:workspaceId/direct-messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const dms = await storage.getUserDirectMessages(userId, req.params.workspaceId);
      res.json(dms);
    } catch (error) {
      console.error("Error fetching direct messages:", error);
      res.status(500).json({ message: "Failed to fetch direct messages" });
    }
  });

  app.get('/api/direct-messages/:dmId/messages', isAuthenticated, async (req, res) => {
    try {
      const { limit, before } = req.query as { limit?: string; before?: string };
      const parsedLimit = limit ? Math.max(1, Math.min(100, parseInt(limit))) : undefined;
      const items = await storage.getDirectMessages(req.params.dmId, parsedLimit, before);
      res.json(items);
    } catch (error) {
      console.error("Error fetching direct messages:", error);
      res.status(500).json({ message: "Failed to fetch direct messages" });
    }
  });

  // Search routes
  app.get('/api/workspaces/:workspaceId/search', isAuthenticated, async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ message: "Query parameter 'q' is required" });
      }
      
      const results = await storage.searchMessages(req.params.workspaceId, q);
      res.json(results);
    } catch (error) {
      console.error("Error searching messages:", error);
      res.status(500).json({ message: "Failed to search messages" });
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

  // WebSocket server setup
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws',
    perMessageDeflate: false // Disable compression for better compatibility
  });
  const clients = new Map<string, { ws: WebSocket; userId: string; channels: string[] }>();

  wss.on('connection', (ws, req) => {
    console.log('WebSocket connection established');
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'join':
            console.log('[WS join] userId:', message.userId, 'channels:', message.channels);
            clients.set(message.userId, {
              ws,
              userId: message.userId,
              channels: message.channels || []
            });
            break;
            
          case 'typing':
            broadcastToChannel(message.channelId, 'typing', {
              userId: message.userId,
              isTyping: message.isTyping
            });
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      // Remove client from clients map
      for (const [userId, client] of clients.entries()) {
        if (client.ws === ws) {
          clients.delete(userId);
          break;
        }
      }
    });
  });

  function broadcastToChannel(channelId: string | null, type: string, data: any) {
    if (!channelId) {
      console.warn('[WS broadcastToChannel] attempted with null channelId. type:', type);
      return;
    }
    let recipients = 0;
    for (const client of clients.values()) {
      if (client.channels.includes(channelId) && client.ws.readyState === WebSocket.OPEN) {
        recipients += 1;
        client.ws.send(JSON.stringify({ type, data, channelId }));
      }
    }
    try {
      const idForLog = (data && (data.id || data.messageId)) ? (data.id || data.messageId) : undefined;
      console.log('[WS broadcastToChannel] type:', type, 'channelId:', channelId, 'recipients:', recipients, idForLog ? { id: idForLog } : '');
    } catch { /* noop */ }
  }

  function broadcastReactionUpdate(messageId: string) {
    // In a real implementation, you'd fetch the updated message and broadcast it
    // For now, just broadcast a simple update signal
    for (const client of clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: 'reactionUpdate', messageId }));
      }
    }
  }

  function broadcastToUser(userId: string, type: string, data: any) {
    const client = clients.get(userId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type, data }));
    }
  }

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

  // Notifications
  app.get('/api/notifications', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId as string;
      const items = await storage.getUserNotifications(userId);
      res.json(items);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ message: 'Failed to fetch notifications' });
    }
  });

  app.post('/api/notifications/:id/read', isAuthenticated, async (req: any, res) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking notification read:', error);
      res.status(400).json({ message: 'Failed to mark as read' });
    }
  });

  app.post('/api/notifications/read-all', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId as string;
      await storage.markAllNotificationsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking all notifications read:', error);
      res.status(400).json({ message: 'Failed to mark all as read' });
    }
  });

  return httpServer;
}
