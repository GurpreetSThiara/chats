import { useState, useEffect, useMemo, useCallback } from "react";
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
import { ThreadPanel } from "@/components/Chat/ThreadPanel";
import { MessageInput } from "@/components/Chat/MessageInput";
import { MemberList } from "@/components/RightPanel/MemberList";
import { EditMessageModal } from "@/components/Modals/EditMessageModal";
import { PinsDialog } from "@/components/Modals/PinsDialog";
import { DeleteConfirmationModal } from "@/components/Modals/DeleteConfirmationModal";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Workspace, Channel, WorkspaceMember, User } from "@shared/schema";
import { z } from "zod";
import { Zap } from "lucide-react";

// Remove ownerId from the schema as it will be added in the mutation
const createWorkspaceSchema = z.object({
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
  const [threadOpen, setThreadOpen] = useState(false);
  const [threadRootMessageId, setThreadRootMessageId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingInitial, setEditingInitial] = useState<string>("");
  const [pinsOpen, setPinsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  
  // Debug dialog state
  useEffect(() => {
    console.log('Dialog open state:', isCreateWorkspaceOpen);
  }, [isCreateWorkspaceOpen]);

  // WebSocket connection for real-time updates
  const { lastMessage, sendTyping } = useWebSocket(
    currentChannelId ? [currentChannelId] : currentDmId ? [currentDmId] : []
  );

  const invalidateCurrentMessageList = useCallback(() => {
    if (currentChannelId) {
      queryClient.invalidateQueries({ queryKey: ["/api/channels", currentChannelId, "messages"] });
    } else if (currentDmId) {
      queryClient.invalidateQueries({ queryKey: ["/api/direct-messages", currentDmId, "messages"] });
    }
    if (threadRootMessageId) {
      queryClient.invalidateQueries({ queryKey: ["/api/threads", threadRootMessageId] });
    }
  }, [currentChannelId, currentDmId, threadRootMessageId, queryClient]);

  // Fetch user's workspaces
  const { data: workspaces = [], isLoading: workspacesLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces"],
    enabled: !!user,
  });

  // Fetch current workspace members to determine role (admin/member)
  const { data: members = [] } = useQuery<(WorkspaceMember & { user: User })[]>({
    queryKey: ["/api/workspaces", currentWorkspace?.id, "members"],
    enabled: !!currentWorkspace?.id,
  });

  const canInvite = useMemo(() => {
    if (!user?.id) return false;
    return members.some((m) => m.userId === user.id && m.role === "admin");
  }, [members, user]);

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
    mode: "onChange", // Enable real-time validation
  });

  // Debug form state
  useEffect(() => {
    const subscription = createWorkspaceForm.watch((value) => {
      console.log('Form values:', value);
      console.log('Form state:', {
        isDirty: createWorkspaceForm.formState.isDirty,
        isValid: createWorkspaceForm.formState.isValid,
        errors: createWorkspaceForm.formState.errors
      });
    });
    return () => subscription.unsubscribe();
  }, [createWorkspaceForm]);

  const createWorkspaceMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createWorkspaceSchema>) => {
      if (!user?.id) {
        throw new Error('User must be logged in to create a workspace');
      }

      // Add ownerId to the workspace data
      const workspaceData = {
        ...data,
        ownerId: user.id
      };

      console.log('Sending workspace creation request:', workspaceData);
      try {
        const response = await apiRequest("POST", "/api/workspaces", workspaceData);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to create workspace');
        }
        const result = await response.json();
        console.log('Workspace created successfully:', result);
        return result;
      } catch (error) {
        console.error('Error creating workspace:', error);
        throw error;
      }
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
    if (!lastMessage) return;
    const { type, channelId } = lastMessage;

    const shouldAffectCurrent = channelId === currentChannelId || channelId === currentDmId || !channelId;
    if (!shouldAffectCurrent) return;

    switch (type) {
      case "message":
      case "message.updated":
      case "message.deleted":
      case "reactionUpdate":
        invalidateCurrentMessageList();
        break;
      default:
        break;
    }
  }, [lastMessage, currentChannelId, currentDmId, invalidateCurrentMessageList]);

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

  const handleWorkspaceChange = (workspaceId: string) => {
    const next = workspaces.find((w) => w.id === workspaceId) || null;
    setCurrentWorkspace(next);
    // reset channel and DM selection when switching workspaces
    setCurrentChannelId(null);
    setCurrentDmId(null);
    // prefetch channels for the new workspace
    if (next) {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", next.id, "channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", next.id, "members"] });
    }
  };

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
    console.log('Creating workspace with data:', data);
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

  const handleOpenThread = (messageId: string) => {
    setThreadRootMessageId(messageId);
    setThreadOpen(true);
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      // Determine if current user already reacted with this emoji
      const currentUserId = user?.id;
      let alreadyReacted = false;
      if (currentUserId) {
        // Check in channel/DM cache
        let listKeys: (string | undefined)[][] = [];
        if (currentChannelId) listKeys.push(["/api/channels", currentChannelId, "messages"]);
        if (currentDmId) listKeys.push(["/api/direct-messages", currentDmId, "messages"]);
        if (threadRootMessageId) listKeys.push(["/api/threads", threadRootMessageId] as unknown as string[]);

        for (const key of listKeys) {
          const data: any = queryClient.getQueryData(key as any);
          if (!data) continue;
          const messagesArr: any[] | undefined = Array.isArray(data) ? data : undefined;
          const threadTree: any = !messagesArr ? data : undefined;
          const findInThread = (node: any): any | undefined => {
            if (!node) return undefined;
            if (node.message?.id === messageId) return node.message;
            if (Array.isArray(node.replies)) {
              for (const r of node.replies) {
                const found = findInThread(r);
                if (found) return found;
              }
            }
            return undefined;
          };
          let msg: any | undefined;
          if (messagesArr) {
            msg = messagesArr.find((m) => m.id === messageId);
          } else if (threadTree) {
            msg = findInThread(threadTree);
          }
          if (msg) {
            const reactions: Record<string, string[]> = (msg.reactions as any) || {};
            alreadyReacted = Array.isArray(reactions[emoji]) && reactions[emoji].includes(currentUserId);
            break;
          }
        }
      }

      if (alreadyReacted) {
        await apiRequest("DELETE", `/api/messages/${messageId}/reactions`, { emoji });
      } else {
        await apiRequest("POST", `/api/messages/${messageId}/reactions`, { emoji });
      }
      invalidateCurrentMessageList();
    } catch (e) {
      console.error("Failed to add reaction:", e);
    }
  };

  const openEditModalFor = (messageId: string) => {
    // Try to locate message content from cache to prefill
    const findContent = (): string => {
      const keysToTry: (string | undefined)[][] = [];
      if (currentChannelId) keysToTry.push(["/api/channels", currentChannelId, "messages"]);
      if (currentDmId) keysToTry.push(["/api/direct-messages", currentDmId, "messages"]);
      if (threadRootMessageId) keysToTry.push(["/api/threads", threadRootMessageId] as unknown as string[]);
      for (const key of keysToTry) {
        const data: any = queryClient.getQueryData(key as any);
        if (!data) continue;
        const arr: any[] | undefined = Array.isArray(data) ? data : undefined;
        if (arr) {
          const m = arr.find((x) => x.id === messageId);
          if (m) return m.content || "";
        } else {
          // thread tree
          const findInThread = (node: any): any | undefined => {
            if (!node) return undefined;
            if (node.message?.id === messageId) return node.message;
            for (const r of node.replies || []) {
              const f = findInThread(r);
              if (f) return f;
            }
            return undefined;
          };
          const node = findInThread(data);
          if (node) return node.content || "";
        }
      }
      return "";
    };
    setEditingMessageId(messageId);
    setEditingInitial(findContent());
    setEditOpen(true);
  };

  const handleEditMessage = async (messageId: string) => {
    openEditModalFor(messageId);
  };

  const handleDeleteMessage = async (messageId: string) => {
    setDeletingMessageId(messageId);
    setDeleteOpen(true);
  };

  const confirmDeleteMessage = async () => {
    if (!deletingMessageId) return;
    try {
      await apiRequest("DELETE", `/api/messages/${deletingMessageId}`);
      setDeleteOpen(false);
      setDeletingMessageId(null);
      invalidateCurrentMessageList();
    } catch (e) {
      console.error("Failed to delete message:", e);
      setDeleteOpen(false);
      setDeletingMessageId(null);
    }
  };

  const handleTogglePin = async (messageId: string, nextPinned: boolean) => {
    try {
      await apiRequest("PATCH", `/api/messages/${messageId}`, { isPinned: nextPinned });
      invalidateCurrentMessageList();
    } catch (e) {
      console.error("Failed to toggle pin:", e);
    }
  };

  const handleSaveEdit = async (content: string) => {
    if (!editingMessageId) return;
    try {
      await apiRequest("PATCH", `/api/messages/${editingMessageId}`, { content });
      setEditOpen(false);
      setEditingMessageId(null);
      setEditingInitial("");
      invalidateCurrentMessageList();
    } catch (e) {
      console.error("Failed to edit message:", e);
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
              <form 
                onSubmit={createWorkspaceForm.handleSubmit((data) => {
                  console.log('Form submitted with data:', data);
                  onCreateWorkspace(data);
                })} 
                className="space-y-4">
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
                    {createWorkspaceMutation.isPending ? "Creating..." : "Create Workspace"}
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
          currentChannel={currentChannel || undefined}
          workspaceId={currentWorkspace?.id}
          workspaces={workspaces}
          currentWorkspace={currentWorkspace || undefined}
          onWorkspaceChange={handleWorkspaceChange}
          canInvite={canInvite}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          onOpenPins={() => setPinsOpen(true)}
        />
        
        <MessageList
          channelId={currentChannelId || undefined}
          directMessageId={currentDmId || undefined}
          currentChannel={currentChannel}
          onReaction={handleReaction}
          onEdit={handleEditMessage}
          onDelete={handleDeleteMessage}
          onPin={handleTogglePin}
          onReply={handleOpenThread}
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
      {threadOpen && threadRootMessageId && (
        <ThreadPanel
          rootMessageId={threadRootMessageId}
          open={threadOpen}
          onClose={() => setThreadOpen(false)}
          onReaction={handleReaction}
          onEdit={handleEditMessage}
          onDelete={handleDeleteMessage}
          onPin={handleTogglePin}
        />
      )}

      <EditMessageModal
        open={editOpen}
        initialValue={editingInitial}
        onClose={() => setEditOpen(false)}
        onSave={handleSaveEdit}
      />

      <PinsDialog
        open={pinsOpen}
        onClose={() => setPinsOpen(false)}
        channelId={currentChannelId}
        directMessageId={currentDmId}
        onPin={handleTogglePin}
      />

      <DeleteConfirmationModal
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setDeletingMessageId(null);
        }}
        onConfirm={confirmDeleteMessage}
        title="Delete message"
        description="Are you sure you want to delete this message? This action cannot be undone."
      />
    </div>
  );
}
