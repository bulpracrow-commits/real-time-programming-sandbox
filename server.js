const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let state = { rooms: {}, contests: {} };
try {
  if (fs.existsSync(DATA_FILE)) state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch (e) { console.error("Could not read data.json; starting fresh."); }

function save() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2)); }
  catch (e) { console.error("Could not save data:", e.message); }
}
function id() { return crypto.randomBytes(4).toString("hex"); }
function cleanName(v) { return String(v || "Guest").trim().slice(0, 24) || "Guest"; }
function roomSnapshot(roomId) {
  const room = state.rooms[roomId];
  if (!room) return null;
  const members = Object.values(room.members || {});
  return {
    id: roomId, title: room.title, code: room.code, language: room.language,
    contestId: room.contestId || null,
    members: members.map(m => ({ id: m.id, name: m.name, online: !!m.online })),
    contest: room.contestId ? state.contests[room.contestId] || null : null
  };
}
function leaderboard(contestId) {
  const c = state.contests[contestId];
  if (!c) return [];
  return Object.values(c.scores || {}).map(s => ({ name: s.name, score: s.score, solved: s.solved, penalty: s.penalty || 0 }))
    .sort((a,b) => b.score - a.score || a.penalty - b.penalty || a.name.localeCompare(b.name))
    .map((x,i) => ({ ...x, rank: i + 1 }));
}
function emitRoom(roomId) {
  const snapshot = roomSnapshot(roomId);
  if (snapshot) io.to(roomId).emit("room-state", snapshot);
  if (snapshot && snapshot.contestId) io.to(roomId).emit("leaderboard", leaderboard(snapshot.contestId));
}

app.get("/api/rooms", (_req, res) => {
  res.json(Object.values(state.rooms).map(r => ({ id: r.id, title: r.title, members: Object.keys(r.members || {}).length, contestId: r.contestId || null })));
});
app.get("/api/contests", (_req, res) => {
  res.json(Object.values(state.contests).map(c => ({ ...c, leaderboard: leaderboard(c.id) })));
});
app.get("/api/contests/:id", (req, res) => {
  const c = state.contests[req.params.id];
  if (!c) return res.status(404).json({ error: "Contest not found" });
  res.json({ ...c, leaderboard: leaderboard(c.id) });
});

io.on("connection", socket => {
  socket.on("create-room", ({ name, title } = {}, cb = () => {}) => {
    const roomId = id();
    const memberId = socket.id;
    state.rooms[roomId] = {
      id: roomId, title: String(title || "Pair Programming Room").slice(0, 60),
      code: "// Welcome! Start coding together.\\nconsole.log('Hello, team!');",
      language: "javascript", members: { [memberId]: { id: memberId, name: cleanName(name), online: true } },
      submissions: [], contestId: null, createdAt: Date.now()
    };
    socket.join(roomId); save();
    cb({ ok: true, roomId, url: `/room/${roomId}` });
    emitRoom(roomId);
  });

  socket.on("join-room", ({ roomId, name } = {}, cb = () => {}) => {
    const room = state.rooms[String(roomId || "")];
    if (!room) return cb({ ok: false, error: "Room not found. Create a new room first." });
    room.members[socket.id] = { id: socket.id, name: cleanName(name), online: true };
    socket.join(room.id); save();
    cb({ ok: true, room: roomSnapshot(room.id), leaderboard: room.contestId ? leaderboard(room.contestId) : [] });
    emitRoom(room.id);
  });

  socket.on("code-change", ({ roomId, code } = {}) => {
    const room = state.rooms[String(roomId || "")];
    if (!room || !room.members[socket.id]) return;
    room.code = String(code || "").slice(0, 100000);
    socket.to(room.id).emit("code-change", { code: room.code, by: socket.id });
    save();
  });

  socket.on("language-change", ({ roomId, language } = {}) => {
    const room = state.rooms[String(roomId || "")];
    if (!room || !room.members[socket.id]) return;
    if (!["javascript", "cpp", "python"].includes(language)) return;
    room.language = language; save(); emitRoom(room.id);
  });

  socket.on("create-contest", ({ roomId, name, prize, durationMinutes } = {}, cb = () => {}) => {
    const room = state.rooms[String(roomId || "")];
    if (!room || !room.members[socket.id]) return cb({ ok: false, error: "Join the room first." });
    const contestId = id();
    const duration = Math.max(5, Math.min(240, Number(durationMinutes) || 30));
    state.contests[contestId] = {
      id: contestId, name: String(name || "Coding Contest").slice(0, 80),
      prize: String(prize || "Certificate / trophy").slice(0, 100),
      durationMinutes: duration, startedAt: Date.now(), endsAt: Date.now() + duration * 60000,
      status: "live", roomId: room.id, scores: {}, winner: null, prizeAwarded: false
    };
    room.contestId = contestId; save();
    cb({ ok: true, contestId });
    emitRoom(room.id);
    io.to(room.id).emit("leaderboard", leaderboard(contestId));
  });

  socket.on("submit-result", ({ roomId, score, solved } = {}, cb = () => {}) => {
    const room = state.rooms[String(roomId || "")];
    if (!room || !room.members[socket.id] || !room.contestId) return cb({ ok: false, error: "No contest is active in this room." });
    const contest = state.contests[room.contestId];
    if (!contest || contest.status !== "live" || Date.now() > contest.endsAt) return cb({ ok: false, error: "Contest has ended." });
    const member = room.members[socket.id];
    const safeScore = Math.max(0, Math.min(10000, Math.floor(Number(score) || 0)));
    const safeSolved = Math.max(0, Math.min(100, Math.floor(Number(solved) || 0)));
    const previous = contest.scores[socket.id];
    contest.scores[socket.id] = {
      id: socket.id, name: member.name, score: Math.max(safeScore, previous?.score || 0),
      solved: Math.max(safeSolved, previous?.solved || 0), penalty: previous?.penalty || 0
    };
    save();
    io.to(room.id).emit("leaderboard", leaderboard(contest.id));
    cb({ ok: true });
  });

  socket.on("end-contest", ({ roomId } = {}, cb = () => {}) => {
    const room = state.rooms[String(roomId || "")];
    if (!room || !room.members[socket.id] || !room.contestId) return cb({ ok: false, error: "Contest not found." });
    const c = state.contests[room.contestId];
    c.status = "ended";
    c.winner = leaderboard(c.id)[0] || null;
    save(); emitRoom(room.id); cb({ ok: true, winner: c.winner });
  });

  socket.on("mark-prize-awarded", ({ roomId } = {}, cb = () => {}) => {
    const room = state.rooms[String(roomId || "")];
    if (!room || !room.members[socket.id] || !room.contestId) return cb({ ok: false, error: "Contest not found." });
    const c = state.contests[room.contestId];
    if (c.status !== "ended") return cb({ ok: false, error: "End the contest first." });
    c.prizeAwarded = true; save(); emitRoom(room.id); cb({ ok: true });
  });

  socket.on("disconnect", () => {
    for (const room of Object.values(state.rooms)) {
      if (room.members && room.members[socket.id]) {
        room.members[socket.id].online = false;
        // Keep scores and member records; a reconnect gets a new socket identity.
        save(); emitRoom(room.id);
      }
    }
  });
});

app.get("/room/:id", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
server.listen(PORT, () => console.log(`Real-Time Programming Sandbox running at http://localhost:${PORT}`));
