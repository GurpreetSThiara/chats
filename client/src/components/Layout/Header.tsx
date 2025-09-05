import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu, Hash, Lock, Search, UserPlus, MoreHorizontal, Pin } from "lucide-react";
import type { Channel, Workspace } from "@shared/schema";
import { InviteUserModal } from "@/components/InviteUserModal";
import { NotificationBell } from "@/components/Notifications/NotificationBell";

interface HeaderProps {
  currentChannel?: Channel;
  workspaceId?: string;
  onToggleSidebar: () => void;
  onSearch?: (query: string) => void;
  // Workspace switching
  workspaces?: Workspace[];
  currentWorkspace?: Workspace;
  onWorkspaceChange?: (workspaceId: string) => void;
  // RBAC UI
  canInvite?: boolean;
  onOpenPins?: () => void;
}

export function Header({ currentChannel, workspaceId, onToggleSidebar, onSearch, workspaces, currentWorkspace, onWorkspaceChange, canInvite = true, onOpenPins }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const isMobile = useIsMobile();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearch?.(searchQuery.trim());
    }
  };

  return (
    <div className="flex items-center justify-between p-4 border-b border-border bg-card">
      <div className="flex items-center space-x-3">
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden p-2"
          onClick={onToggleSidebar}
          data-testid="button-toggle-mobile-sidebar"
        >
          <Menu className="w-5 h-5" />
        </Button>
        {/* Workspace Switcher */}
        {workspaces && workspaces.length > 0 && currentWorkspace && (
          <select
            className="bg-muted border rounded px-2 py-1 text-sm"
            value={currentWorkspace.id}
            onChange={(e) => onWorkspaceChange?.(e.target.value)}
            data-testid="select-workspace-switcher"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>{ws.name}</option>
            ))}
          </select>
        )}

        {currentChannel && (
          <>
            {currentChannel.type === "private" ? (
              <Lock className="w-5 h-5 text-muted-foreground" />
            ) : (
              <Hash className="w-5 h-5 text-muted-foreground" />
            )}
            <h1 
              className="text-lg font-semibold"
              data-testid="text-current-channel-name"
            >
              {currentChannel.name}
            </h1>
            <span 
              className="text-sm text-muted-foreground hidden sm:inline"
              data-testid="text-current-channel-description"
            >
              {currentChannel.description || "No description"}
            </span>
          </>
        )}
      </div>
      
      <div className="flex items-center space-x-2">
        {/* Search Bar */}
        {!isMobile && (
          <form onSubmit={handleSearch} className="relative">
            <Input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-9 bg-muted border-0 focus-visible:ring-2"
              data-testid="input-search-messages"
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
          </form>
        )}
        
        {workspaceId && canInvite && (
          <InviteUserModal workspaceId={workspaceId}>
            <Button
              variant="ghost"
              size="sm"
              className="p-2"
              data-testid="button-invite-users"
            >
              <UserPlus className="w-5 h-5" />
            </Button>
          </InviteUserModal>
        )}
        {currentChannel && (
          <Button
            variant="ghost"
            size="sm"
            className="p-2"
            onClick={onOpenPins}
            data-testid="button-open-pins"
            title="Show pinned messages"
          >
            <Pin className="w-5 h-5" />
          </Button>
        )}
        <NotificationBell />
        <Button
          variant="ghost"
          size="sm"
          className="p-2"
          data-testid="button-more-options"
        >
          <MoreHorizontal className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
