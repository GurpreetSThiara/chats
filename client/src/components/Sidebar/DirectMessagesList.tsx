import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Plus } from "lucide-react";
import type { DirectMessage, User, WorkspaceMember } from "@shared/schema";

interface DirectMessagesListProps {
  workspaceId: string;
  currentDmId?: string;
  onDmSelect: (dmId: string) => void;
}

export function DirectMessagesList({ workspaceId, currentDmId, onDmSelect }: DirectMessagesListProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: directMessages = [], isLoading } = useQuery<(DirectMessage & { otherParticipants: User[] })[]>({
    queryKey: ["/api/workspaces", workspaceId, "direct-messages"],
    enabled: !!workspaceId,
  });

  const { data: workspaceMembers = [] } = useQuery<(WorkspaceMember & { user: User })[]>({
    queryKey: ["/api/workspaces", workspaceId, "members"],
    enabled: !!workspaceId && isCreateDialogOpen,
  });

  const createDmMutation = useMutation({
    mutationFn: async (participants: string[]) => {
      const response = await apiRequest("POST", "/api/direct-messages", {
        participants,
        workspaceId,
      });
      return response.json();
    },
    onSuccess: (dm) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "direct-messages"] });
      setIsCreateDialogOpen(false);
      onDmSelect(dm.id);
      toast({
        title: "Direct message created",
        description: "You can now start chatting!",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to create direct message. Please try again.",
        variant: "destructive",
      });
    },
  });

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  };

  const getDmDisplayName = (dm: DirectMessage & { otherParticipants: User[] }) => {
    if (dm.isGroup && dm.name) {
      return dm.name;
    }
    
    if (dm.otherParticipants.length === 1) {
      const user = dm.otherParticipants[0];
      return `${user.firstName} ${user.lastName}`;
    }
    
    return dm.otherParticipants.map(u => u.firstName).join(", ");
  };

  const startDirectMessage = (userId: string) => {
    createDmMutation.mutate([userId]);
  };

  if (isLoading) {
    return (
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Direct Messages
          </h3>
        </div>
        <div className="space-y-1">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-8 bg-muted/50 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Direct Messages
        </h3>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="p-1 h-auto"
              data-testid="button-create-dm"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start a Direct Message</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Select a team member to start a conversation with:
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {workspaceMembers.map((member) => (
                  <Button
                    key={member.user.id}
                    variant="ghost"
                    className="w-full justify-start h-auto p-3"
                    onClick={() => startDirectMessage(member.user.id)}
                    disabled={createDmMutation.isPending}
                    data-testid={`button-start-dm-${member.user.id}`}
                  >
                    <Avatar className="w-8 h-8 mr-3">
                      <AvatarImage 
                        src={member.user.profileImageUrl || undefined} 
                        alt={`${member.user.firstName} ${member.user.lastName}`}
                      />
                      <AvatarFallback>
                        {getInitials(member.user.firstName, member.user.lastName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-left">
                      <p className="text-sm font-medium">
                        {member.user.firstName} {member.user.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">{member.user.status}</p>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="space-y-1">
        {directMessages.map((dm) => (
          <Button
            key={dm.id}
            variant="ghost"
            className={`w-full justify-start h-auto px-3 py-2 text-sm font-normal ${
              currentDmId === dm.id ? "bg-accent" : ""
            }`}
            onClick={() => onDmSelect(dm.id)}
            data-testid={`button-dm-${dm.id}`}
          >
            <div className="flex items-center space-x-3 w-full">
              <div className="relative">
                {dm.otherParticipants.length === 1 ? (
                  <Avatar className="w-6 h-6">
                    <AvatarImage 
                      src={dm.otherParticipants[0].profileImageUrl || undefined} 
                      alt={getDmDisplayName(dm)}
                    />
                    <AvatarFallback className="text-xs">
                      {getInitials(dm.otherParticipants[0].firstName, dm.otherParticipants[0].lastName)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center">
                    <span className="text-xs font-medium">{dm.otherParticipants.length + 1}</span>
                  </div>
                )}
                {/* Online indicator placeholder */}
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full online-indicator" />
              </div>
              <span className="truncate">{getDmDisplayName(dm)}</span>
              {/* Unread indicator placeholder */}
              <div className="ml-auto w-2 h-2 bg-primary rounded-full flex-shrink-0" />
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
