import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/middleware";

export function registerNotificationRoutes(app: Express) {
  // Get notifications for current user
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

  // Mark single notification as read
  app.post('/api/notifications/:id/read', isAuthenticated, async (req: any, res) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error marking notification read:', error);
      res.status(400).json({ message: 'Failed to mark as read' });
    }
  });

  // Mark all notifications as read for current user
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
}
