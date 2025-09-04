import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChannelList } from "./ChannelList";
import { DirectMessagesList } from "./DirectMessagesList";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useIsMobile } from "@/hooks/use-mobile";
import { Zap, MessageCircle, AtSign, Bookmark, PanelLeftClose, Moon, Sun } from "lucide-react";
import type { Workspace } from "@shared/schema";

interface SidebarProps {
  currentWorkspace?: Workspace;
  currentChannelId?: string;
  currentDmId?: string;
  onChannelSelect: (channelId: string) => void;
  onDmSelect: (dmId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ 
  currentWorkspace,
  currentChannelId,
  currentDmId,
  onChannelSelect,
  onDmSelect,
  isCollapsed,
  onToggleCollapse 
}: SidebarProps) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isMobile = useIsMobile();

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  };

  if (!currentWorkspace || !user) return null;

  return (
    <div 
      className={`flex flex-col bg-card border-r border-border transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-16" : "w-60 lg:w-64"
      }`}
      data-testid="sidebar"
    >
      {/* Workspace Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!isCollapsed && (
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex flex-col min-w-0">
              <span 
                className="font-semibold text-sm truncate"
                data-testid="text-workspace-name"
              >
                {currentWorkspace.name}
              </span>
              <span 
                className="text-xs text-muted-foreground"
                data-testid="text-workspace-members"
              >
                12 members
              </span>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="p-1 h-auto"
          onClick={onToggleCollapse}
          data-testid="button-toggle-sidebar"
        >
          <PanelLeftClose className="w-4 h-4" />
        </Button>
      </div>
      
      {!isCollapsed && (
        <>
          {/* Navigation Sections */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {/* Quick Actions */}
            <div className="p-3 space-y-1">
              <Button
                variant="ghost"
                className="w-full justify-start h-auto px-3 py-2 text-sm font-normal"
                data-testid="button-threads"
              >
                <MessageCircle className="w-4 h-4 mr-3" />
                <span>Threads</span>
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start h-auto px-3 py-2 text-sm font-normal"
                data-testid="button-mentions"
              >
                <AtSign className="w-4 h-4 mr-3" />
                <span>Mentions & Reactions</span>
                <span className="ml-auto bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                  3
                </span>
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start h-auto px-3 py-2 text-sm font-normal"
                data-testid="button-saved"
              >
                <Bookmark className="w-4 h-4 mr-3" />
                <span>Saved Items</span>
              </Button>
            </div>
            
            {/* Channels Section */}
            <ChannelList
              workspaceId={currentWorkspace.id}
              currentChannelId={currentChannelId}
              onChannelSelect={onChannelSelect}
            />
            
            {/* Direct Messages Section */}
            <DirectMessagesList
              workspaceId={currentWorkspace.id}
              currentDmId={currentDmId}
              onDmSelect={onDmSelect}
            />
          </div>
          
          {/* User Profile Footer */}
          <div className="p-3 border-t border-border">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Avatar className="w-8 h-8">
                  <AvatarImage 
                    src={user.profileImageUrl || undefined} 
                    alt={`${user.firstName} ${user.lastName}`}
                  />
                  <AvatarFallback>
                    {getInitials(user.firstName, user.lastName)}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full online-indicator" />
              </div>
              <div className="flex-1 min-w-0">
                <p 
                  className="text-sm font-medium truncate"
                  data-testid="text-current-user-name"
                >
                  {user.firstName} {user.lastName}
                </p>
                <p 
                  className="text-xs text-muted-foreground truncate"
                  data-testid="text-current-user-status"
                >
                  {user.status}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-auto"
                onClick={toggleTheme}
                data-testid="button-toggle-theme"
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
