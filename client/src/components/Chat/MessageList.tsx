import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageComponent } from "./Message";
import { Skeleton } from "@/components/ui/skeleton";
import { Hash } from "lucide-react";
import type { Message, User, Channel } from "@shared/schema";

interface MessageListProps {
  channelId?: string;
  directMessageId?: string;
  currentChannel?: Channel;
  onReaction?: (messageId: string, emoji: string) => void;
  onReply?: (messageId: string) => void;
}

export function MessageList({ 
  channelId, 
  directMessageId, 
  currentChannel,
  onReaction, 
  onReply 
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { data: messages = [], isLoading } = useQuery<(Message & { sender: User })[]>({
    queryKey: channelId 
      ? ["/api/channels", channelId, "messages"]
      : ["/api/direct-messages", directMessageId, "messages"],
    enabled: !!(channelId || directMessageId),
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex space-x-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
      {/* Welcome Message */}
      {messages.length === 0 && currentChannel && (
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Hash className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">
            Welcome to #{currentChannel.name}
          </h2>
          <p className="text-muted-foreground">
            This is the beginning of the #{currentChannel.name} channel.
            {currentChannel.description && (
              <>
                <br />
                {currentChannel.description}
              </>
            )}
          </p>
        </div>
      )}
      
      {/* Messages */}
      {messages.map((message) => (
        <MessageComponent
          key={message.id}
          message={message}
          onReaction={onReaction}
          onReply={onReply}
        />
      ))}
      
      <div ref={messagesEndRef} />
    </div>
  );
}
