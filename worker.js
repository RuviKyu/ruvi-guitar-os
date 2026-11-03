export class RuviSyncObject {
  constructor(state, env) {
    this.state = state;
    this.sessions = new Set();
  }
  async fetch(request) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (url.pathname === "/api/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sessions.add(server);
      server.addEventListener("message", async (msg) => {
        try {
          const incoming = JSON.parse(msg.data);
          if (incoming && incoming.updatedAt) {
            const current = (await this.state.storage.get("appState")) || { updatedAt: 0 };
            if (incoming.updatedAt >= (current.updatedAt || 0)) {
              await this.state.storage.put("appState", incoming);
              for (const s of this.sessions) {
                if (s !== server) {
                  try { s.send(JSON.stringify(incoming)); } catch (e) {}
                }
              }
            }
          }
        } catch (e) {}
      });
      server.addEventListener("close", () => this.sessions.delete(server));
      server.addEventListener("error", () => this.sessions.delete(server));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === "GET") {
      const data = (await this.state.storage.get("appState")) || { empty: true, updatedAt: 0 };
      return new Response(JSON.stringify(data), {
        headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" }
      });
    }

    if (request.method === "POST") {
      const incoming = await request.json();
      const current = (await this.state.storage.get("appState")) || { updatedAt: 0 };
      if (!current.updatedAt || incoming.updatedAt >= current.updatedAt) {
        await this.state.storage.put("appState", incoming);
        for (const s of this.sessions) {
          try { s.send(JSON.stringify(incoming)); } catch (e) {}
        }
        return new Response(JSON.stringify({ ok: true, saved: true, state: incoming }), {
          headers: { ...cors, "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ ok: true, saved: false, state: current }), {
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }
    return new Response("Not found", { status: 404 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/sync" || url.pathname === "/api/ws") {
      const id = env.RUVI_SYNC.idFromName("GLOBAL_PERSONAL_STATE");
      return env.RUVI_SYNC.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
