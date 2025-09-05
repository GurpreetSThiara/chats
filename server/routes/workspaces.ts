import type { Express } from "express";
import { storage } from "../storage";
import { insertWorkspaceSchema } from "@shared/schema";
import { isAuthenticated } from "../auth/middleware";

async function isWorkspaceAdmin(userId: string, workspaceId: string): Promise<boolean> {
  const members = await storage.getWorkspaceMembers(workspaceId);
  const me = members.find(m => m.userId === userId);
  return me?.role === 'admin';
}

export function registerWorkspaceRoutes(app: Express) {
  // Create workspace
  app.post('/api/workspaces', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const workspaceData = insertWorkspaceSchema.parse({ ...req.body, ownerId: userId });
      const workspace = await storage.createWorkspace(workspaceData);
      res.json(workspace);
    } catch (error) {
      console.error("Error creating workspace:", error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Failed to create workspace",
        details: error instanceof Error ? (error as Error).stack : undefined
      });
    }
  });

  // List my workspaces
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

  // Get workspace by id
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

  // List members
  app.get('/api/workspaces/:id/members', isAuthenticated, async (req, res) => {
    try {
      const members = await storage.getWorkspaceMembers(req.params.id);
      res.json(members);
    } catch (error) {
      console.error("Error fetching workspace members:", error);
      res.status(500).json({ message: "Failed to fetch workspace members" });
    }
  });

  // Add member
  app.post('/api/workspaces/:id/members', isAuthenticated, async (req: any, res) => {
    try {
      const workspaceId = req.params.id;
      const { email, role = 'member' } = req.body;

      if (!email) {
        return res.status(400).json({ message: "Email is required" });
      }

      // Only admin can add members
      const requesterId = req.session.userId as string;
      const admin = await isWorkspaceAdmin(requesterId, workspaceId);
      if (!admin) return res.status(403).json({ message: 'Only admins can add members in this workspace' });

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const members = await storage.getWorkspaceMembers(workspaceId);
      if (members.some(m => m.userId === user.id)) {
        return res.status(400).json({ message: "User is already a member of this workspace" });
      }

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
}
