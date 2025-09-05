import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/middleware";

export function registerDirectMessageRoutes(app: Express) {
  // Create or get a DM by participants
  app.post('/api/direct-messages', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const { participants, workspaceId } = req.body as { participants: string[]; workspaceId: string };

      const allParticipants = [...new Set([userId, ...(participants || [])])];
      const dm = await storage.getOrCreateDirectMessage(allParticipants, workspaceId);
      res.json(dm);
    } catch (error) {
      console.error("Error creating direct message:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create direct message" });
    }
  });

  // List my DMs in a workspace
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

  // Get messages in a DM with pagination
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
}
