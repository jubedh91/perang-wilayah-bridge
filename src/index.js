import { DurableObject } from "cloudflare:workers";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.clients = new Set();
  }

  async fetch(request) {
    const url = new URL(request.url);

    // WebSocket connection
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      server.accept();
      this.clients.add(server);

      const removeClient = () => {
        this.clients.delete(server);
      };

      server.addEventListener("close", removeClient);
      server.addEventListener("error", removeClient);

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    // Broadcast an event to connected game clients
    if (request.method === "POST" && url.pathname === "/event") {
      let data;

      try {
        data = await request.json();
      } catch {
        return Response.json(
          { success: false, error: "JSON tidak valid" },
          { status: 400, headers: corsHeaders }
        );
      }

      const message = JSON.stringify({
        type: "tiktok_event",
        data
      });

      let sent = 0;

      for (const client of this.clients) {
        try {
          client.send(message);
          sent++;
        } catch {
          this.clients.delete(client);
        }
      }

      return Response.json(
        {
          success: true,
          message: "Event diproses",
          connectedClients: this.clients.size,
          sent
        },
        { headers: corsHeaders }
      );
    }

    // Connection status
    return Response.json(
      {
        success: true,
        status: "GameRoom aktif",
        connectedClients: this.clients.size
      },
      { headers: corsHeaders }
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    const room = env.GAME_ROOM.getByName("perang-wilayah");

    // Worker status
    if (url.pathname === "/") {
      return Response.json({
        status: "Perang Wilayah Bridge aktif",
        endpoint: "/event",
        websocket: "/ws",
        test: "/test"
      });
    }

    // WebSocket endpoint for the game
    if (url.pathname === "/ws") {
      return room.fetch(request);
    }

    // Receive events from TikFinity
    if (url.pathname === "/event" && request.method === "POST") {
      return room.fetch(
        new Request("https://room.internal/event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: await request.text()
        })
      );
    }

    // Send a test gift event
    if (url.pathname === "/test" && request.method === "GET") {
      return room.fetch(
        new Request("https://room.internal/event", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            eventType: "gift",
            giftName: "Rose",
            username: "UJI WORKER",
            userId: "test-user",
            repeatCount: 1
          })
        })
      );
    }

    return Response.json(
      { success: false, error: "Endpoint tidak ditemukan" },
      { status: 404, headers: corsHeaders }
    );
  }
};
