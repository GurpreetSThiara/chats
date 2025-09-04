import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { insertChannelSchema } from "@shared/schema";
import { Hash, Lock, Plus } from "lucide-react";
import type { Channel } from "@shared/schema";
import { z } from "zod";

interface ChannelListProps {
  workspaceId: string;
  currentChannelId?: string;
  onChannelSelect: (channelId: string) => void;
}

const createChannelSchema = insertChannelSchema.extend({
  name: z.string().min(1, "Channel name is required").max(50),
  description: z.string().optional(),
  type: z.enum(["public", "private"]),
});

export function ChannelList({ workspaceId, currentChannelId, onChannelSelect }: ChannelListProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: channels = [], isLoading } = useQuery<Channel[]>({
    queryKey: ["/api/workspaces", workspaceId, "channels"],
    enabled: !!workspaceId,
  });

  const createChannelForm = useForm<z.infer<typeof createChannelSchema>>({
    resolver: zodResolver(createChannelSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "public",
      workspaceId,
    },
  });

  const createChannelMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createChannelSchema>) => {
      const response = await apiRequest("POST", "/api/channels", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "channels"] });
      setIsCreateDialogOpen(false);
      createChannelForm.reset();
      toast({
        title: "Channel created",
        description: "Your new channel has been created successfully.",
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
        description: "Failed to create channel. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onCreateChannel = (data: z.infer<typeof createChannelSchema>) => {
    createChannelMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Channels</h3>
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
          Channels
        </h3>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="p-1 h-auto"
              data-testid="button-create-channel"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Channel</DialogTitle>
            </DialogHeader>
            <Form {...createChannelForm}>
              <form onSubmit={createChannelForm.handleSubmit(onCreateChannel)} className="space-y-4">
                <FormField
                  control={createChannelForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Channel Name</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g. marketing-team" 
                          {...field}
                          data-testid="input-channel-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createChannelForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="What's this channel about?" 
                          {...field}
                          data-testid="input-channel-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={createChannelForm.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Privacy</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-channel-type">
                            <SelectValue placeholder="Select channel type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="public">Public - Everyone can join</SelectItem>
                          <SelectItem value="private">Private - Invite only</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsCreateDialogOpen(false)}
                    data-testid="button-cancel-channel"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createChannelMutation.isPending}
                    data-testid="button-submit-channel"
                  >
                    Create Channel
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="space-y-1">
        {channels.map((channel) => (
          <Button
            key={channel.id}
            variant="ghost"
            className={`w-full justify-start h-auto px-3 py-2 text-sm font-normal ${
              currentChannelId === channel.id ? "bg-accent" : ""
            }`}
            onClick={() => onChannelSelect(channel.id)}
            data-testid={`button-channel-${channel.id}`}
          >
            <div className="flex items-center space-x-3 w-full">
              {channel.type === "private" ? (
                <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <Hash className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className="truncate">{channel.name}</span>
              {/* Unread indicator - placeholder for now */}
              {channel.id === "some-channel-with-unreads" && (
                <div className="ml-auto w-2 h-2 bg-primary rounded-full flex-shrink-0" />
              )}
            </div>
          </Button>
        ))}
      </div>
    </div>
  );
}
