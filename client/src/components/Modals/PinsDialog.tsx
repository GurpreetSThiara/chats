import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Message } from "@shared/schema";

interface PinsDialogProps {
  open: boolean;
  onClose: () => void;
  channelId?: string | null;
  directMessageId?: string | null;
  onPin: (messageId: string, nextPinned: boolean) => void | Promise<void>;
}

export function PinsDialog({ open, onClose, channelId, directMessageId, onPin }: PinsDialogProps) {
  const { data: channelMessages } = useQuery<Message[]>({
    queryKey: channelId ? ["/api/channels", channelId, "messages"] : undefined as any,
    enabled: open && !!channelId,
  });
  const { data: dmMessages } = useQuery<Message[]>({
    queryKey: directMessageId ? ["/api/direct-messages", directMessageId, "messages"] : undefined as any,
    enabled: open && !!directMessageId,
  });

  const messages = channelId ? channelMessages : dmMessages;

  const pinned = useMemo(() => {
    return (messages || []).filter((m) => m.isPinned);
  }, [messages]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pinned messages</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {pinned.length === 0 && (
            <div className="text-sm text-muted-foreground">No pinned messages yet.</div>
          )}
          {pinned.map((m) => (
            <div key={m.id} className="border rounded-md p-3">
              <div className="text-sm whitespace-pre-wrap break-words">{m.content}</div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{new Date(m.createdAt || Date.now()).toLocaleString()}</span>
                <Button size="sm" variant="outline" onClick={() => onPin(m.id, false)} data-testid={`button-unpin-${m.id}`}>
                  Unpin
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
