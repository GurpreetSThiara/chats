import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageComponent } from "./Message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import type { Message, User } from "@shared/schema";

export type ThreadNode = {
  message: Message;
  sender: User;
  replies: ThreadNode[];
};

interface ThreadPanelProps {
  rootMessageId: string;
  open: boolean;
  onClose: () => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onPin?: (messageId: string, nextPinned: boolean) => void;
}

export function ThreadPanel({ rootMessageId, open, onClose, onReaction, onEdit, onDelete, onPin }: ThreadPanelProps) {
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState("");

  const { data: tree, isLoading } = useQuery<ThreadNode>({
    queryKey: ["/api/threads", rootMessageId],
    enabled: open && !!rootMessageId,
  });

  const rootChannelId = tree?.message.channelId;
  const rootDmId = tree?.message.directMessageId;

  const postReply = useMutation({
    mutationFn: async (content: string) => {
      const payload: Partial<Message> & { parentMessageId: string } = {
        content,
        parentMessageId: rootMessageId,
        channelId: rootChannelId || undefined,
        directMessageId: rootDmId || undefined,
      } as any;
      const res = await apiRequest("POST", "/api/messages", payload);
      if (!res.ok) throw new Error("Failed to post reply");
      return res.json();
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["/api/threads", rootMessageId] });
      if (rootChannelId) {
        queryClient.invalidateQueries({ queryKey: ["/api/channels", rootChannelId, "messages"] });
      }
      if (rootDmId) {
        queryClient.invalidateQueries({ queryKey: ["/api/direct-messages", rootDmId, "messages"] });
      }
    },
  });

  const flattened = useMemo(() => {
    const arr: ThreadNode[] = [];
    const walk = (node?: ThreadNode) => {
      if (!node) return;
      arr.push(node);
      node.replies.forEach(walk);
    };
    walk(tree);
    return arr;
  }, [tree]);

  if (!open) return null;

  return (
    <div className="absolute right-0 top-16 bottom-0 w-[380px] border-l border-border bg-background flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <div className="font-semibold text-sm">Thread</div>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading && <div className="text-sm text-muted-foreground">Loading thread…</div>}
        {!isLoading && tree && (
          <div className="space-y-2">
            {flattened.map((node) => (
              <MessageComponent
                key={node.message.id}
                message={{ ...node.message, sender: node.sender } as any}
                onReaction={onReaction}
                onEdit={onEdit}
                onDelete={onDelete}
                onPin={onPin}
              />
            ))}
          </div>
        )}
      </div>

      <div className="p-3 border-t space-y-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!replyText.trim()) return;
            postReply.mutate(replyText.trim());
          }}
          className="flex gap-2"
        >
          <Input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Reply in thread…"
          />
          <Button type="submit" disabled={postReply.isPending}>Send</Button>
        </form>
        <div className="text-[11px] text-muted-foreground">
          Threads are limited to 3 levels deep.
        </div>
      </div>
    </div>
  );
}
