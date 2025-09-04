import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertWorkspaceSchema, insertChannelSchema, insertMessageSchema } from "@shared/schema";
import multer from "multer";

// Configure multer for file uploads (in-memory storage for now)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Workspace routes
  app.post('/api/workspaces', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workspaceData = insertWorkspaceSchema.parse({ ...req.body, ownerId: userId });
      const workspace = await storage.createWorkspace(workspaceData);
      res.json(workspace);
    } catch (error) {
      console.error("Error creating workspace:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create workspace" });
    }
  });

  app.get('/api/workspaces', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

  // Channel routes
  app.post('/api/channels', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const channelData = insertChannelSchema.parse({ ...req.body, createdById: userId });
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
      const messageData = insertMessageSchema.parse({ ...req.body, senderId: userId });
      const message = await storage.createMessage(messageData);
      
      // Broadcast message via WebSocket
      const messageWithSender = {
        ...message,
        sender: await storage.getUser(userId),
      };
      
      broadcastToChannel(message.channelId || message.directMessageId, 'message', messageWithSender);
      
      res.json(message);
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create message" });
    }
  });

  app.get('/api/channels/:channelId/messages', isAuthenticated, async (req, res) => {
    try {
      const messages = await storage.getChannelMessages(req.params.channelId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // Direct message routes
  app.post('/api/direct-messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
      const dms = await storage.getUserDirectMessages(userId, req.params.workspaceId);
      res.json(dms);
    } catch (error) {
      console.error("Error fetching direct messages:", error);
      res.status(500).json({ message: "Failed to fetch direct messages" });
    }
  });

  app.get('/api/direct-messages/:dmId/messages', isAuthenticated, async (req, res) => {
    try {
      const messages = await storage.getDirectMessages(req.params.dmId);
      res.json(messages);
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const clients = new Map<string, { ws: WebSocket; userId: string; channels: string[] }>();

  wss.on('connection', (ws, req) => {
    console.log('WebSocket connection established');
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'join':
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
    if (!channelId) return;
    
    for (const client of clients.values()) {
      if (client.channels.includes(channelId) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type, data, channelId }));
      }
    }
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

  return httpServer;
}
