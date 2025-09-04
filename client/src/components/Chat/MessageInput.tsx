import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { Paperclip, Smile, AtSign } from "lucide-react";

interface MessageInputProps {
  channelId?: string;
  directMessageId?: string;
  placeholder?: string;
  onTyping?: (isTyping: boolean) => void;
}

export function MessageInput({ 
  channelId, 
  directMessageId, 
  placeholder = "Type a message...",
  onTyping 
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sendMessageMutation = useMutation({
    mutationFn: async (messageData: { content: string; channelId?: string; directMessageId?: string }) => {
      const response = await apiRequest("POST", "/api/messages", messageData);
      return response.json();
    },
    onSuccess: () => {
      setContent("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      // Invalidate messages cache
      if (channelId) {
        queryClient.invalidateQueries({ queryKey: ["/api/channels", channelId, "messages"] });
      } else if (directMessageId) {
        queryClient.invalidateQueries({ queryKey: ["/api/direct-messages", directMessageId, "messages"] });
      }
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
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!content.trim() || sendMessageMutation.isPending) return;

    sendMessageMutation.mutate({
      content: content.trim(),
      channelId,
      directMessageId,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + "px";
    }

    // Handle typing indicator
    if (onTyping) {
      onTyping(value.length > 0);
      
      // Clear previous timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Stop typing after 1 second of no input
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 1000);
    }
  };

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="p-4 border-t border-border bg-card">
      <div className="relative bg-muted rounded-lg border border-border focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 transition-all">
        <Textarea
          ref={textareaRef}
          data-testid="input-message"
          placeholder={placeholder}
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full p-3 bg-transparent border-0 resize-none focus:outline-none text-sm min-h-[44px] max-h-32 focus-visible:ring-0"
          rows={1}
        />
        <div className="flex items-center justify-between p-2 border-t border-border">
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-auto"
              data-testid="button-attach-file"
            >
              <Paperclip className="w-4 h-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-auto"
              data-testid="button-add-emoji"
            >
              <Smile className="w-4 h-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="p-1 h-auto"
              data-testid="button-mention-user"
            >
              <AtSign className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!content.trim() || sendMessageMutation.isPending}
            size="sm"
            data-testid="button-send-message"
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
