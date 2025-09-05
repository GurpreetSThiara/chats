import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/middleware";

export function registerSearchRoutes(app: Express) {
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
}
