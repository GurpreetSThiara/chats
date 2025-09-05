import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./useAuth";

interface WebSocketMessage {
  type: string;
  data: any;
  channelId?: string;
}

export function useWebSocket(initialChannels: string[] = []) {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const channelsRef = useRef<string[]>(initialChannels);
  const isConnecting = useRef(false);

  // Update channels ref when they change
  useEffect(() => {
    channelsRef.current = initialChannels;
  }, [initialChannels]);

  const joinChannels = useCallback((channels: string[]) => {
    if (ws.current?.readyState === WebSocket.OPEN && user) {
      ws.current.send(JSON.stringify({ 
        type: 'join', 
        userId: user.id, 
        channels: channels.length > 0 ? channels : undefined 
      }));
    }
  }, [user]);

  const connect = useCallback(() => {
    if (!user || isConnecting.current) return;
    
    isConnecting.current = true;
    
    // Close existing connection if any
    if (ws.current) {
      ws.current.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
      isConnecting.current = false;
      
      // Join channels after connection is established
      joinChannels(channelsRef.current);
    };

    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        setLastMessage(message);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.current.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
      isConnecting.current = false;
      
      // Clear any pending reconnection
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      
      // Only attempt to reconnect if we have a user (i.e., we were authenticated)
      if (user) {
        reconnectTimeout.current = setTimeout(() => {
          connect();
        }, 3000);
      }
    };

    ws.current.onerror = (error) => {
      console.error("WebSocket error:", error);
      isConnecting.current = false;
    };
  }, [user, joinChannels]);

  const sendMessage = (type: string, data: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, ...data }));
    }
  };

  const sendTyping = (channelId: string, isTyping: boolean) => {
    sendMessage('typing', { channelId, userId: user?.id, isTyping });
  };

  // Handle initial connection and cleanup
  useEffect(() => {
    if (user) {
      connect();
    }

    return () => {
      // Clear any pending reconnection
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      
      // Close WebSocket connection if it exists
      if (ws.current) {
        // Remove all event listeners to prevent memory leaks
        ws.current.onopen = null;
        ws.current.onmessage = null;
        ws.current.onclose = null;
        ws.current.onerror = null;
        
        // Only close if not already closed
        if (ws.current.readyState === WebSocket.OPEN) {
          ws.current.close();
        }
        ws.current = null;
      }
      
      // Reset state
      setIsConnected(false);
      isConnecting.current = false;
    };
  }, [user, connect]);

  // Handle channel changes
  useEffect(() => {
    if (isConnected && user) {
      joinChannels(initialChannels);
    }
  }, [initialChannels, isConnected, user, joinChannels]);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    sendTyping,
  };
}
