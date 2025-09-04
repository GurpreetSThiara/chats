import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkspaceMember, User } from "@shared/schema";

interface MemberListProps {
  workspaceId: string;
}

export function MemberList({ workspaceId }: MemberListProps) {
  const { data: members = [], isLoading } = useQuery<(WorkspaceMember & { user: User })[]>({
    queryKey: ["/api/workspaces", workspaceId, "members"],
    enabled: !!workspaceId,
  });

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  };

  // Group members by online status (simplified - in real app, you'd track this via WebSocket)
  const onlineMembers = members.slice(0, Math.ceil(members.length * 0.7)); // Simulate 70% online
  const awayMembers = members.slice(Math.ceil(members.length * 0.7));

  if (isLoading) {
    return (
      <div className="hidden xl:flex flex-col w-80 bg-card border-l border-border">
        <div className="p-4 border-b border-border">
          <Skeleton className="h-6 w-20 mb-1" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center space-x-3 p-2">
              <Skeleton className="w-8 h-8 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="hidden xl:flex flex-col w-80 bg-card border-l border-border">
      {/* Panel Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-lg font-semibold">Members</h2>
        <p className="text-sm text-muted-foreground">
          {onlineMembers.length} members online
        </p>
      </div>
      
      {/* Member List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="p-4 space-y-4">
          {/* Online Members */}
          {onlineMembers.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Online — {onlineMembers.length}
              </h3>
              <div className="space-y-2">
                {onlineMembers.map((member) => (
                  <div
                    key={member.user.id}
                    className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                    data-testid={`member-${member.user.id}`}
                  >
                    <div className="relative">
                      <Avatar className="w-8 h-8">
                        <AvatarImage 
                          src={member.user.profileImageUrl || undefined} 
                          alt={`${member.user.firstName} ${member.user.lastName}`}
                        />
                        <AvatarFallback>
                          {getInitials(member.user.firstName, member.user.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full online-indicator" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p 
                        className="text-sm font-medium truncate"
                        data-testid={`text-member-name-${member.user.id}`}
                      >
                        {member.user.firstName} {member.user.lastName}
                      </p>
                      <p 
                        className="text-xs text-muted-foreground truncate"
                        data-testid={`text-member-status-${member.user.id}`}
                      >
                        {member.user.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Away Members */}
          {awayMembers.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Away — {awayMembers.length}
              </h3>
              <div className="space-y-2">
                {awayMembers.map((member) => (
                  <div
                    key={member.user.id}
                    className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer opacity-60"
                    data-testid={`member-away-${member.user.id}`}
                  >
                    <div className="relative">
                      <Avatar className="w-8 h-8">
                        <AvatarImage 
                          src={member.user.profileImageUrl || undefined} 
                          alt={`${member.user.firstName} ${member.user.lastName}`}
                        />
                        <AvatarFallback>
                          {getInitials(member.user.firstName, member.user.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-warning rounded-full online-indicator" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {member.user.firstName} {member.user.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {member.user.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
