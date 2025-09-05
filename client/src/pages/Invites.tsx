import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Link } from "wouter";

interface InviteItem {
  id: string;
  workspaceId: string;
  inviterId: string;
  inviteeEmail: string;
  inviteeUserId?: string | null;
  role: string;
  status: "pending" | "accepted" | "declined" | "expired";
  createdAt?: string;
}

export default function InvitesPage() {
  const queryClient = useQueryClient();
  const { lastMessage } = useWebSocket();

  const { data: invites = [], isLoading } = useQuery<InviteItem[]>({
    queryKey: ["/api/invites"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/invites");
      if (!res.ok) throw new Error("Failed to fetch invites");
      return res.json();
    },
  });

  // When an invite-related notification is received, refresh invites
  useEffect(() => {
    if (lastMessage?.type === "notification") {
      const t = lastMessage.data?.type as string | undefined;
      if (t && (t.startsWith("invite."))) {
        queryClient.invalidateQueries({ queryKey: ["/api/invites"] });
      }
    }
  }, [lastMessage, queryClient]);

  const acceptInvite = async (inviteId: string) => {
    const res = await apiRequest("POST", `/api/invites/${inviteId}/accept`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Failed to accept invite");
    }
    queryClient.invalidateQueries({ queryKey: ["/api/invites"] });
    // Also refresh notifications
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
  };

  const declineInvite = async (inviteId: string) => {
    const res = await apiRequest("POST", `/api/invites/${inviteId}/decline`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Failed to decline invite");
    }
    queryClient.invalidateQueries({ queryKey: ["/api/invites"] });
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Invitations</h1>
            <p className="text-sm text-muted-foreground">Manage your workspace invites</p>
          </div>
          <Link href="/">
            <Button variant="outline">Back to Home</Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pending Invites</CardTitle>
            <CardDescription>Accept or decline your workspace invitations</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading invites...</div>
            ) : invites.length === 0 ? (
              <div className="text-sm text-muted-foreground">You have no invites.</div>
            ) : (
              <div className="space-y-4">
                {invites.map((inv) => (
                  <div key={inv.id} className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Workspace invite</div>
                      <div className="text-xs text-muted-foreground">
                        Workspace: <span className="font-mono">{inv.workspaceId}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">Role: {inv.role}</div>
                      <div className="text-xs text-muted-foreground">Status: {inv.status}</div>
                    </div>
                    <div className="flex gap-2">
                      {inv.status === "pending" ? (
                        <>
                          <Button size="sm" variant="default" onClick={() => acceptInvite(inv.id)}>
                            Accept
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => declineInvite(inv.id)}>
                            Decline
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="outline" disabled>
                          {inv.status}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <Separator />
                <div className="text-xs text-muted-foreground">
                  Note: Workspace names/details can be enhanced if the API returns expanded fields.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
