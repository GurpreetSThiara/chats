import type { Express } from "express";
import { storage } from "../storage";
import { insertChannelSchema } from "@shared/schema";
import { isAuthenticated } from "../auth/middleware";
import { isWorkspaceAdmin } from "./helpers";

export function registerChannelRoutes(app: Express) {
  // Create channel
  app.post('/api/channels', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const channelData = insertChannelSchema.parse({ ...req.body, createdById: userId });
      const admin = await isWorkspaceAdmin(userId, channelData.workspaceId);
      if (!admin) return res.status(403).json({ message: 'Only admins can create channels in this workspace' });
      const channel = await storage.createChannel(channelData);

      if (channel.type === "private") {
        await storage.addChannelMember({ channelId: channel.id, userId });
      }

      res.json(channel);
    } catch (error) {
      console.error("Error creating channel:", error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to create channel" });
    }
  });

  // List channels for a workspace for current user
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
}
