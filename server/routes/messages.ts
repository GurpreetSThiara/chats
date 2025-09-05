import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/middleware";

export function registerMessageRoutes(app: Express) {
  // Thread tree
  app.get('/api/threads/:messageId', isAuthenticated, async (req: any, res) => {
    try {
      const { messageId } = req.params as { messageId: string };
      const tree = await storage.getThreadTree(messageId, 3);
      if (!tree) return res.status(404).json({ message: 'Message not found' });
      res.json(tree);
    } catch (error) {
      console.error('Error fetching thread tree:', error);
      res.status(400).json({ message: 'Failed to fetch thread' });
    }
  });

  // Channel messages with pagination
  app.get('/api/channels/:channelId/messages', isAuthenticated, async (req: any, res) => {
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
}
