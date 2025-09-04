import { useEffect, useRef, useState } from "react";
import { useAuth } from "./useAuth";

interface WebSocketMessage {
  type: string;
  data: any;
  channelId?: string;
}

export function useWebSocket(channels: string[] = []) {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  const connect = () => {
    if (!user) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
      
      // Send join message with user info and channels
      ws.current?.send(JSON.stringify({
        type: 'join',
        userId: user.id,
        channels
      }));
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
      
      // Attempt to reconnect after 3 seconds
      reconnectTimeout.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.current.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  };

  const sendMessage = (type: string, data: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, ...data }));
    }
  };

  const sendTyping = (channelId: string, isTyping: boolean) => {
    sendMessage('typing', { channelId, userId: user?.id, isTyping });
  };

  useEffect(() => {
    if (user) {
      connect();
    }

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      ws.current?.close();
    };
  }, [user]);

  // Update channels when they change
  useEffect(() => {
    if (isConnected && user) {
      sendMessage('join', { userId: user.id, channels });
    }
  }, [channels, isConnected, user]);

  return {
    isConnected,
    lastMessage,
    sendMessage,
    sendTyping,
  };
}
