import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu, Hash, Lock, Search, UserPlus, MoreHorizontal } from "lucide-react";
import type { Channel } from "@shared/schema";

interface HeaderProps {
  currentChannel?: Channel;
  onToggleSidebar: () => void;
  onSearch?: (query: string) => void;
}

export function Header({ currentChannel, onToggleSidebar, onSearch }: HeaderProps) {
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
        
        <Button
          variant="ghost"
          size="sm"
          className="p-2"
          data-testid="button-invite-users"
        >
          <UserPlus className="w-5 h-5" />
        </Button>
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
