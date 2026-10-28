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

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      server.accept();
      this.clients.add(server);

      server.addEventListener("close", () => {
        this.clients.delete(server);
      });

      server.addEventListener("error", () => {
        this.clients.delete(server);
      });

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    if (request.method === "POST" && url.pathname === "/event") {
      let data;

      try {
        data = await request.json();
      } catch {
        data = Object.fromEntries(url.searchParams.entries());
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

      return Response.json({
        success: true,
        message: "Event diproses",
        connectedClients: this.clients.size,
        sent
      }, {
        headers: corsHeaders
      });
    }

    return Response.json({
      success: true,
      connectedClients: this.clients.size
    }, {
      headers: corsHeaders
    });
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

    if (url.pathname === "/") {
      return Response.json({
        status: "Perang Wilayah Bridge aktif",
        endpoint: "/event",
        websocket: "/ws"
      }, {
        headers: corsHeaders
      });
    }

    if (url.pathname === "/event" && request.method === "POST") {
      return room.fetch(
        new Request("https://room.internal/event", {
          method: "POST",
          headers: request.headers,
          body: await request.text()
        })
      );
    }

    if (url.pathname === "/ws") {
      return room.fetch(
        new Request("https://room.internal/ws", request)
      );
    }

    return new Response("Not found", {
      status: 404,
      headers: corsHeaders
    });
  }
};
