import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";

export type Broadcaster = {
  broadcastToChannel: (channelId: string | null, type: string, data: any) => void;
  broadcastReactionUpdate: (messageId: string) => void;
  broadcastToUser: (userId: string, type: string, data: any) => void;
};

export function setupWebSocket(server: Server): Broadcaster {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    perMessageDeflate: false,
  });

  const clients = new Map<string, { ws: WebSocket; userId: string; channels: string[] }>();

  wss.on("connection", (ws) => {
    // console.log('WebSocket connection established');

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        switch (message.type) {
          case "join":
            // console.log('[WS join] userId:', message.userId, 'channels:', message.channels);
            clients.set(message.userId, {
              ws,
              userId: message.userId,
              channels: message.channels || [],
            });
            break;
          case "typing":
            broadcastToChannel(message.channelId, "typing", {
              userId: message.userId,
              isTyping: message.isTyping,
            });
            break;
        }
      } catch (_err) {
        // console.error('WebSocket message error:', _err);
      }
    });

    ws.on("close", () => {
      for (const [userId, client] of clients.entries()) {
        if (client.ws === ws) {
          clients.delete(userId);
          break;
        }
      }
    });
  });

  function broadcastToChannel(channelId: string | null, type: string, data: any) {
    if (!channelId) return;
    for (const client of clients.values()) {
      if (client.channels.includes(channelId) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type, data, channelId }));
      }
    }
  }

  function broadcastReactionUpdate(messageId: string) {
    for (const client of clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ type: "reactionUpdate", messageId }));
      }
    }
  }

  function broadcastToUser(userId: string, type: string, data: any) {
    const client = clients.get(userId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type, data }));
    }
  }

  return { broadcastToChannel, broadcastReactionUpdate, broadcastToUser };
}
