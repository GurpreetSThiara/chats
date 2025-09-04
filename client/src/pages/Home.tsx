import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest } from "@/lib/queryClient";

import { Sidebar } from "@/components/Sidebar/Sidebar";
import { Header } from "@/components/Layout/Header";
import { MessageList } from "@/components/Chat/MessageList";
import { MessageInput } from "@/components/Chat/MessageInput";
import { MemberList } from "@/components/RightPanel/MemberList";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertWorkspaceSchema } from "@shared/schema";
import type { Workspace, Channel, DirectMessage } from "@shared/schema";
import { z } from "zod";

const createWorkspaceSchema = insertWorkspaceSchema.extend({
  name: z.string().min(1, "Workspace name is required").max(50),
  description: z.string().optional(),
});

export default function Home() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [currentDmId, setCurrentDmId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isMobile);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState(false);

  // WebSocket connection for real-time updates
  const { isConnected, lastMessage, sendTyping } = useWebSocket(
    currentChannelId ? [currentChannelId] : currentDmId ? [currentDmId] : []
  );

  // Fetch user's workspaces
  const { data: workspaces = [], isLoading: workspacesLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces"],
    enabled: !!user,
  });

  // Fetch current channel data
  const { data: currentChannel } = useQuery<Channel>({
    queryKey: ["/api/channels", currentChannelId],
    enabled: !!currentChannelId,
  });

  // Create workspace form
  const createWorkspaceForm = useForm<z.infer<typeof createWorkspaceSchema>>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const createWorkspaceMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createWorkspaceSchema>) => {
      const response = await apiRequest("POST", "/api/workspaces", data);
      return response.json();
    },
    onSuccess: (workspace) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setCurrentWorkspace(workspace);
      setIsCreateWorkspaceOpen(false);
      createWorkspaceForm.reset();
      toast({
        title: "Workspace created",
        description: `${workspace.name} has been created successfully.`,
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
        description: "Failed to create workspace. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      const { type, data, channelId } = lastMessage;
      
      if (type === "message" && (channelId === currentChannelId || channelId === currentDmId)) {
        // Invalidate messages to show new message
        if (currentChannelId) {
          queryClient.invalidateQueries({ queryKey: ["/api/channels", currentChannelId, "messages"] });
        } else if (currentDmId) {
          queryClient.invalidateQueries({ queryKey: ["/api/direct-messages", currentDmId, "messages"] });
        }
      }
    }
  }, [lastMessage, currentChannelId, currentDmId, queryClient]);

  // Set default workspace and channel
  useEffect(() => {
    if (workspaces.length > 0 && !currentWorkspace) {
      setCurrentWorkspace(workspaces[0]);
    }
  }, [workspaces, currentWorkspace]);

  useEffect(() => {
    if (currentWorkspace && !currentChannelId && !currentDmId) {
      // Fetch channels and set default
      queryClient.fetchQuery({
        queryKey: ["/api/workspaces", currentWorkspace.id, "channels"],
      }).then((channels: any) => {
        const generalChannel = channels.find((c: Channel) => c.name === "general");
        if (generalChannel) {
          setCurrentChannelId(generalChannel.id);
        } else if (channels.length > 0) {
          setCurrentChannelId(channels[0].id);
        }
      });
    }
  }, [currentWorkspace, currentChannelId, currentDmId, queryClient]);

  // Handle auth redirect
  useEffect(() => {
    if (!authLoading && !user) {
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
  }, [user, authLoading, toast]);

  const onCreateWorkspace = (data: z.infer<typeof createWorkspaceSchema>) => {
    createWorkspaceMutation.mutate(data);
  };

  const handleChannelSelect = (channelId: string) => {
    setCurrentChannelId(channelId);
    setCurrentDmId(null);
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  };

  const handleDmSelect = (dmId: string) => {
    setCurrentDmId(dmId);
    setCurrentChannelId(null);
    if (isMobile) {
      setSidebarCollapsed(true);
    }
  };

  const handleTyping = (isTyping: boolean) => {
    if (currentChannelId) {
      sendTyping(currentChannelId, isTyping);
    } else if (currentDmId) {
      sendTyping(currentDmId, isTyping);
    }
  };

  if (authLoading || workspacesLoading) {
    return (
      <div className="flex h-screen">
        <div className="w-64 bg-card border-r border-border p-4 space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <div className="flex-1 flex flex-col">
          <Skeleton className="h-16 w-full" />
          <div className="flex-1 p-4 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex space-x-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!currentWorkspace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mx-auto">
            <Zap className="w-10 h-10 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">Welcome to TeamSync</h1>
            <p className="text-muted-foreground mb-6">
              Create your first workspace to get started with your team.
            </p>
            <Button onClick={() => setIsCreateWorkspaceOpen(true)} data-testid="button-create-first-workspace">
              Create Workspace
            </Button>
          </div>
        </div>

        {/* Create Workspace Dialog */}
        <Dialog open={isCreateWorkspaceOpen} onOpenChange={setIsCreateWorkspaceOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Workspace</DialogTitle>
            </DialogHeader>
            <Form {...createWorkspaceForm}>
              <form onSubmit={createWorkspaceForm.handleSubmit(onCreateWorkspace)} className="space-y-4">
                <FormField
                  control={createWorkspaceForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workspace Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g. My Team" 
                          {...field}
                          data-testid="input-workspace-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createWorkspaceForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="What's this workspace for?" 
                          {...field}
                          data-testid="input-workspace-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsCreateWorkspaceOpen(false)}
                    data-testid="button-cancel-workspace"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createWorkspaceMutation.isPending}
                    data-testid="button-submit-workspace"
                  >
                    Create Workspace
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        currentWorkspace={currentWorkspace}
        currentChannelId={currentChannelId || undefined}
        currentDmId={currentDmId || undefined}
        onChannelSelect={handleChannelSelect}
        onDmSelect={handleDmSelect}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          currentChannel={currentChannel}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        
        <MessageList
          channelId={currentChannelId || undefined}
          directMessageId={currentDmId || undefined}
          currentChannel={currentChannel}
        />
        
        <MessageInput
          channelId={currentChannelId || undefined}
          directMessageId={currentDmId || undefined}
          placeholder={
            currentChannel 
              ? `Message #${currentChannel.name}`
              : "Send a direct message..."
          }
          onTyping={handleTyping}
        />
      </div>
      
      {/* Right Panel */}
      <MemberList workspaceId={currentWorkspace.id} />
    </div>
  );
}
