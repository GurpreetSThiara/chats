import { storage } from "../storage";

export async function isWorkspaceAdmin(userId: string, workspaceId: string): Promise<boolean> {
  const members = await storage.getWorkspaceMembers(workspaceId);
  const me = members.find(m => m.userId === userId);
  return me?.role === 'admin';
}
