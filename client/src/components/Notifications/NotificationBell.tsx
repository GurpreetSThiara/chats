import { useEffect, useMemo, useState } from "react";
import { Bell, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Link } from "wouter";

interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  data: any;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const queryClient = useQueryClient();
  const { lastMessage } = useWebSocket();
  const [open, setOpen] = useState(false);

  const { data: notifications = [], isLoading } = useQuery<NotificationItem[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/notifications");
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
  });

  // Real-time: when a notification arrives via WS, refetch
  useEffect(() => {
    if (lastMessage?.type === "notification") {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    }
  }, [lastMessage, queryClient]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const markRead = async (id: string) => {
    await apiRequest("POST", `/api/notifications/${id}/read`);
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
  };

  const markAllRead = async () => {
    await apiRequest("POST", "/api/notifications/read-all");
    queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
  };

  const acceptInvite = async (inviteId: string, notificationId?: string) => {
    const res = await apiRequest("POST", `/api/invites/${inviteId}/accept`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Failed to accept invite");
    }
    if (notificationId) await markRead(notificationId);
  };

  const declineInvite = async (inviteId: string, notificationId?: string) => {
    const res = await apiRequest("POST", `/api/invites/${inviteId}/decline`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "Failed to decline invite");
    }
    if (notificationId) await markRead(notificationId);
  };

  const renderItem = (n: NotificationItem) => {
    switch (n.type) {
      case "invite.created": {
        const inviteId = n.data?.inviteId as string;
        return (
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Workspace invite</div>
              <div className="text-xs text-muted-foreground">
                You have been invited to join a workspace.
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => acceptInvite(inviteId, n.id)} title="Accept">
                <Check className="h-4 w-4 text-green-600" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => declineInvite(inviteId, n.id)} title="Decline">
                <X className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          </div>
        );
      }
      case "invite.accepted": {
        return (
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Invite accepted</div>
              <div className="text-xs text-muted-foreground">Your invite was accepted.</div>
            </div>
            {!n.isRead && (
              <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>
                Mark read
              </Button>
            )}
          </div>
        );
      }
      case "invite.declined": {
        return (
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Invite declined</div>
              <div className="text-xs text-muted-foreground">Your invite was declined.</div>
            </div>
            {!n.isRead && (
              <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>
                Mark read
              </Button>
            )}
          </div>
        );
      }
      default:
        return (
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Notification</div>
              <div className="text-xs text-muted-foreground">{n.type}</div>
            </div>
            {!n.isRead && (
              <Button size="sm" variant="ghost" onClick={() => markRead(n.id)}>
                Mark read
              </Button>
            )}
          </div>
        );
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative p-2" data-testid="button-notifications">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] h-4 min-w-[16px] px-1">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {notifications.length > 0 && (
            <Button size="sm" variant="ghost" onClick={markAllRead} disabled={isLoading}>
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
        ) : notifications.length === 0 ? (
          <DropdownMenuItem disabled>No notifications</DropdownMenuItem>
        ) : (
          notifications.map((n) => (
            <DropdownMenuItem key={n.id} className="whitespace-normal focus:bg-transparent">
              <div className={`w-full ${!n.isRead ? "opacity-100" : "opacity-70"}`}>{renderItem(n)}</div>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="focus:bg-accent/50">
          <Link href="/invites" className="w-full text-center text-sm">
            View all invites
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
