import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, Download, Smile, Edit3, Trash2, Pin } from "lucide-react";
import { EmojiPicker } from "@/components/Emoji/EmojiPicker";
import type { Message, User } from "@shared/schema";

interface MessageProps {
  message: Message & { sender: User; repliesCount?: number };
  onReaction?: (messageId: string, emoji: string) => void;
  onReply?: (messageId: string) => void;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onPin?: (messageId: string, nextPinned: boolean) => void;
}

export function MessageComponent({ message, onReaction, onReply, onEdit, onDelete, onPin }: MessageProps) {
  const formatTime = (date: Date | string) => {
    const messageDate = new Date(date);
    const now = new Date();
    const diffHours = (now.getTime() - messageDate.getTime()) / (1000 * 60 * 60);
    
    if (diffHours < 24) {
      return `Today at ${messageDate.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      })}`;
    }
    
    return formatDistanceToNow(messageDate, { addSuffix: true });
  };

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase() || '?';
  };

  const renderMentions = (content: string, mentions: string[] = []) => {
    let result = content;
    mentions.forEach(userId => {
      // Simple mention replacement - in production, you'd fetch user data
      result = result.replace(
        new RegExp(`@${userId}`, 'g'),
        `<span class="text-primary font-medium">@${userId}</span>`
      );
    });
    return result;
  };

  const reactions = (message.reactions as Record<string, string[]>) || {};

  return (
    <div 
      className="message-hover rounded-lg p-3 transition-colors group"
      data-testid={`message-${message.id}`}
    >
      <div className="flex space-x-3">
        <Avatar className="w-10 h-10">
          <AvatarImage 
            src={message.sender.profileImageUrl || undefined} 
            alt={`${message.sender.firstName} ${message.sender.lastName}`}
          />
          <AvatarFallback>
            {getInitials(message.sender.firstName, message.sender.lastName)}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center space-x-2">
              <span 
                className="font-semibold text-sm"
                data-testid={`text-sender-name-${message.id}`}
              >
                {message.sender.firstName} {message.sender.lastName}
              </span>
              <span 
                className="text-xs text-muted-foreground"
                data-testid={`text-message-time-${message.id}`}
              >
                {formatTime((message as any).createdAt ?? new Date())}
              </span>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {message.isPinned && (
                <Badge variant="secondary" className="mr-2">Pinned</Badge>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onPin?.(message.id, !message.isPinned)}
                title={message.isPinned ? 'Unpin' : 'Pin'}
                data-testid={`button-pin-${message.id}`}
              >
                <Pin className={`w-4 h-4 ${message.isPinned ? 'text-primary' : 'text-muted-foreground'}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onEdit?.(message.id)}
                title="Edit message"
                data-testid={`button-edit-${message.id}`}
              >
                <Edit3 className="w-4 h-4 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onDelete?.(message.id)}
                title="Delete message"
                data-testid={`button-delete-${message.id}`}
              >
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
          
          <div className="text-sm leading-relaxed space-y-2">
            <p 
              className="whitespace-pre-wrap"
              data-testid={`text-message-content-${message.id}`}
              dangerouslySetInnerHTML={{ 
                __html: renderMentions(message.content, message.mentions || []) 
              }}
            />
            
            {/* File Attachments */}
            {message.fileUrls && message.fileUrls.length > 0 && (
              <div className="space-y-2">
                {message.fileUrls.map((fileUrl: string, index: number) => (
                  <div 
                    key={index}
                    className="border border-border rounded-lg p-3 bg-muted/50 max-w-md"
                    data-testid={`attachment-${message.id}-${index}`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                        <Download className="w-5 h-5 text-primary-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {fileUrl.split('/').pop()}
                        </p>
                        <p className="text-xs text-muted-foreground">File attachment</p>
                      </div>
                      <Button variant="ghost" size="sm" className="p-1">
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Message Reactions */}
          <div className="flex items-center space-x-2 mt-2">
            {Object.keys(reactions).length > 0 && (
              Object.entries(reactions).map(([emoji, userIds]) => (
                <Button
                  key={emoji}
                  variant="secondary"
                  size="sm"
                  className="h-auto px-2 py-1 text-xs rounded-full"
                  onClick={() => onReaction?.(message.id, emoji)}
                  data-testid={`button-reaction-${emoji}-${message.id}`}
                >
                  <span>{emoji}</span>
                  <span className="ml-1">{userIds.length}</span>
                </Button>
              ))
            )}
            <EmojiPicker
              onSelect={(e) => onReaction?.(message.id, e)}
              triggerClassName="p-1 h-auto opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
          
          {/* Thread Action: show for all messages */}
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs text-primary hover:underline mt-2"
            onClick={() => onReply?.(message.id)}
            data-testid={`button-view-thread-${message.id}`}
          >
            <MessageCircle className="w-4 h-4 mr-1" />
            {message.repliesCount && message.repliesCount > 0
              ? `View thread (${message.repliesCount})`
              : "Reply in thread"}
          </Button>
        </div>
      </div>
    </div>
  );
}
