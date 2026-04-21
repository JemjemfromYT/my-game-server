// ==============================================================
// Neural Survival - Colyseus Lobby Server
// Run with: node index.js   (from /server folder)
// Listens on ws://localhost:2567 (room name: "battle_room")
// ==============================================================
const colyseus = require("colyseus");
const http = require("http");
const express = require("express");
const schema = require("@colyseus/schema");

// ---------- Schema ----------
class Player extends schema.Schema {}
schema.defineTypes(Player, {
  name: "string",
  heroId: "string",
  ready: "boolean",
  isHost: "boolean",
});

class LobbyState extends schema.Schema {
  constructor() {
    super();
    this.players = new schema.MapSchema();
    this.phase = "waiting";   // waiting | starting | in-game
    this.countdown = 0;       // seconds remaining (0 when not counting)
    this.hostId = "";
  }
}
schema.defineTypes(LobbyState, {
  players: { map: Player },
  phase: "string",
  countdown: "number",
  hostId: "string",
});

// ---------- Room ----------
class GameRoom extends colyseus.Room {
  onCreate(options) {
    this.maxClients = 8;
    this.setState(new LobbyState());
    this.countdownInterval = null;

    this.onMessage("toggleReady", (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      if (this.state.phase !== "waiting" && this.state.phase !== "starting") return;
      p.ready = !p.ready;
      this.evaluateStart();
    });

    // Optional: broadcast in-game position updates between clients
    this.onMessage("playerState", (client, payload) => {
      this.broadcast("playerState", { id: client.sessionId, ...payload }, { except: client });
    });
  }

  onJoin(client, options) {
    const p = new Player();
    p.name   = (options && options.name)   || "Survivor";
    p.heroId = (options && options.heroId) || "james";
    p.ready  = false;
    p.isHost = this.state.players.size === 0;
    if (p.isHost) this.state.hostId = client.sessionId;
    this.state.players.set(client.sessionId, p);
    console.log(`[join] ${client.sessionId} as ${p.name} (${p.heroId}) host=${p.isHost}`);
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
    console.log(`[leave] ${client.sessionId}`);
    // Promote new host if needed
    if (this.state.hostId === client.sessionId) {
      const next = this.state.players.keys().next().value;
      this.state.hostId = next || "";
      if (next) {
        const np = this.state.players.get(next);
        if (np) np.isHost = true;
      }
    }
    // Cancel countdown if player count drops below 2
    if (this.state.players.size < 2 && this.state.phase === "starting") {
      this.cancelCountdown();
    } else {
      this.evaluateStart();
    }
  }

  // ---- Countdown / start ----
  evaluateStart() {
    const players = [...this.state.players.values()];
    const allReady = players.length >= 2 && players.every((p) => p.ready);

    if (allReady && this.state.phase === "waiting") {
      this.startCountdown();
    } else if (!allReady && this.state.phase === "starting") {
      this.cancelCountdown();
    }
  }

  startCountdown() {
    this.state.phase = "starting";
    this.state.countdown = 3;
    console.log(`[countdown] starting from 3`);
    this.broadcast("countdown", { n: this.state.countdown });

    this.countdownInterval = setInterval(() => {
      this.state.countdown -= 1;
      if (this.state.countdown > 0) {
        this.broadcast("countdown", { n: this.state.countdown });
      } else {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
        this.state.phase = "in-game";
        this.state.countdown = 0;
        console.log(`[start] broadcasting startGame`);
        this.broadcast("startGame", { at: Date.now() });
      }
    }, 1000);
  }

  cancelCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    this.state.phase = "waiting";
    this.state.countdown = 0;
    this.broadcast("countdown", { n: 0, cancelled: true });
    console.log(`[countdown] cancelled`);
  }

  onDispose() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
  }
}

// ---------- Boot ----------
const app = express();
app.get("/", (_req, res) => res.send("Neural Survival Colyseus server is running."));
const server = http.createServer(app);
const gameServer = new colyseus.Server({ server });
gameServer.define("battle_room", GameRoom);

const port = Number(process.env.PORT) || 2567;
gameServer.listen(port);
console.log(`[server] listening on ${port}`);
