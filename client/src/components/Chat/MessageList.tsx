import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MessageComponent } from "./Message";
import { Skeleton } from "@/components/ui/skeleton";
import { Hash } from "lucide-react";
import type { Message, User, Channel } from "@shared/schema";
import { Button } from "@/components/ui/button";

interface MessageListProps {
  channelId?: string;
  directMessageId?: string;
  currentChannel?: Channel;
  onReaction?: (messageId: string, emoji: string) => void;
  onReply?: (messageId: string) => void;
  onEdit?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onPin?: (messageId: string, nextPinned: boolean) => void;
}

export function MessageList({ 
  channelId, 
  directMessageId, 
  currentChannel,
  onReaction, 
  onReply,
  onEdit,
  onDelete,
  onPin,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 20;

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: channelId
      ? ["/api/channels", channelId, "messages", PAGE_SIZE]
      : ["/api/direct-messages", directMessageId, "messages", PAGE_SIZE],
    enabled: !!(channelId || directMessageId),
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) => {
      const base = channelId
        ? `/api/channels/${channelId}/messages`
        : `/api/direct-messages/${directMessageId}/messages`;
      const url = new URL(base, window.location.origin);
      url.searchParams.set("limit", String(PAGE_SIZE));
      const beforeParam = typeof pageParam === 'string' ? pageParam : undefined;
      if (beforeParam) url.searchParams.set("before", beforeParam);
      const res = await fetch(url.toString(), { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as (Message & { sender: User; repliesCount?: number })[];
    },
    getNextPageParam: (lastPage: (Message & { sender: User; repliesCount?: number })[]) => {
      if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
      // Pages are sorted oldest -> newest; use first item's createdAt as cursor for older fetch
      const first = lastPage[0];
      return (first?.createdAt as unknown as string | undefined) || undefined;
    },
  });

  const messages = useMemo<(Message & { sender: User; repliesCount?: number })[]>(() => {
    const pages = (data?.pages as (Message & { sender: User; repliesCount?: number })[][] | undefined) || [];
    // Older pages should appear above newer pages
    return pages.slice().reverse().flat();
  }, [data]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-load older messages when reaching top
  useEffect(() => {
    const el = topSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }
      }
    }, { root: null, rootMargin: "0px", threshold: 1.0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

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
      {/* Top sentinel for infinite scroll */}
      <div ref={topSentinelRef} />
      {/* Load older button */}
      {messages.length > 0 && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchNextPage()}
            disabled={!hasNextPage || isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading..." : hasNextPage ? "Load older" : "No more messages"}
          </Button>
        </div>
      )}
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
          onEdit={onEdit}
          onDelete={onDelete}
          onPin={onPin}
        />
      ))}
      
      <div ref={messagesEndRef} />
    </div>
  );
}
