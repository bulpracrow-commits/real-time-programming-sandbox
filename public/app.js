const socket = io();
const $ = id => document.getElementById(id);
let roomId = location.pathname.match(/^\/room\/([^/]+)/)?.[1] || null;
let roomState = null, editor = null, currentContest = null, timerInterval = null, myName = sessionStorage.getItem("arenaName") || "";
$("homeName").value = myName;
const starterCode = "// Welcome to Real-Time Programming Sandbox!\nconsole.log('Hello, team!');";
function showError(message) { $("homeError").textContent = message || ""; }
function setConnection(text) { $("connection").textContent = text; }
function currentName() { const n = ($("homeName").value || myName || "Guest").trim().slice(0,24); myName = n; sessionStorage.setItem("arenaName", n); return n; }
function normalizeRoomId(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/\/room\/([a-z0-9]+)/i);
  return (match ? match[1] : raw).replace(/[^a-z0-9]/gi, "").slice(0,20);
}
function enterRoom(id) {
  roomId = id;
  history.pushState({}, "", `/room/${id}`);
  $("home").classList.add("hidden"); $("workspace").classList.remove("hidden"); $("copyLink").classList.remove("hidden");
  if (editor) editor.layout();
}
$("createRoom").onclick = () => {
  showError("");
  socket.emit("create-room", { name: currentName(), title: $("roomTitle").value }, result => {
    if (!result?.ok) return showError("Room create nahi hua. Please try again.");
    enterRoom(result.roomId); roomState = null; initializeEditor(starterCode); 
    socket.emit("join-room", { roomId: result.roomId, name: currentName() }, joined => {
      if (joined?.ok) { applyRoomState(joined.room); renderLeaderboard(joined.leaderboard || []); }
    });
  });
};
$("joinRoom").onclick = () => {
  const id = normalizeRoomId($("joinId").value);
  if (!id) return showError("Room ID ya invite link paste karo.");
  joinById(id);
};
function joinById(id) {
  socket.emit("join-room", { roomId: id, name: currentName() }, result => {
    if (!result?.ok) return showError(result?.error || "Room join nahi hua.");
    enterRoom(id); applyRoomState(result.room); renderLeaderboard(result.leaderboard || []);
  });
}
socket.on("connect", () => {
  setConnection("Connected");
  if (roomId) joinById(roomId);
});
socket.on("disconnect", () => setConnection("Reconnecting…"));
socket.on("connect_error", () => setConnection("Connection error"));
$("copyLink").onclick = async () => {
  const url = location.href;
  try { await navigator.clipboard.writeText(url); $("copyLink").textContent = "Link copied!"; }
  catch { prompt("Copy this invite link:", url); }
  setTimeout(() => $("copyLink").textContent = "Copy invite link", 1600);
};
function initializeEditor(value) {
  if (editor) return;
  if (typeof require === "undefined") { $("output").textContent = "Editor CDN could not load. Check your internet connection and refresh."; return; }
  require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs" } });
  require(["vs/editor/editor.main"], () => {
    editor = monaco.editor.create($("editor"), {
      value: value || starterCode, language: "javascript", theme: "vs-dark", automaticLayout: true,
      minimap: { enabled: false }, fontSize: 14, tabSize: 2, scrollBeyondLastLine: false,
      roundedSelection: true, padding: { top: 14 }
    });
    editor.onDidChangeModelContent(() => {
      if (!roomId || !editor) return;
      $("syncStatus").textContent = "Syncing…";
      socket.emit("code-change", { roomId, code: editor.getValue() });
      clearTimeout(window.syncLabelTimer);
      window.syncLabelTimer = setTimeout(() => $("syncStatus").textContent = "Synced", 250);
    });
    if (roomState) applyRoomState(roomState);
  });
}
function applyRoomState(room) {
  if (!room) return;
  roomState = room;
  $("roomTitleDisplay").textContent = room.title || "Coding Room";
  $("roomMeta").textContent = `Room ID: ${room.id} · Share the invite link to collaborate`;
  $("language").value = room.language || "javascript";
  if (!editor) initializeEditor(room.code);
  else {
    const model = editor.getModel();
    const lang = room.language === "cpp" ? "cpp" : room.language === "python" ? "python" : "javascript";
    if (model && monaco.editor.getModelLanguage(model) !== lang) monaco.editor.setModelLanguage(model, lang);
    if (editor.getValue() !== room.code) editor.setValue(room.code || "");
  }
  renderMembers(room.members || []);
  currentContest = room.contest || null;
  renderContest(currentContest);
}
socket.on("room-state", applyRoomState);
socket.on("code-change", data => {
  if (!editor || !data || editor.getValue() === data.code) return;
  const pos = editor.getPosition();
  const scroll = editor.getScrollTop();
  editor.setValue(data.code);
  if (pos) editor.setPosition(pos);
  editor.setScrollTop(scroll);
  $("syncStatus").textContent = "Live synced";
});
socket.on("leaderboard", renderLeaderboard);
function renderMembers(members) {
  $("memberCount").textContent = members.length;
  $("members").innerHTML = "";
  if (!members.length) { $("members").textContent = "No participants yet."; return; }
  members.forEach(m => {
    const row = document.createElement("div"); row.className = "member";
    const avatar = document.createElement("span"); avatar.className = "avatar"; avatar.textContent = (m.name || "G").charAt(0).toUpperCase();
    const name = document.createElement("span"); name.textContent = m.name || "Guest";
    const dot = document.createElement("span"); dot.className = "online"; dot.title = m.online ? "Online" : "Recently disconnected";
    if (!m.online) dot.style.background = "#64718a";
    row.append(avatar, name, dot); $("members").append(row);
  });
}
function renderContest(c) {
  currentContest = c;
  if (!c) {
    $("contestStatus").textContent = "Not started"; $("contestSetup").classList.remove("hidden"); $("contestInfo").classList.add("hidden"); return;
  }
  $("contestSetup").classList.add("hidden"); $("contestInfo").classList.remove("hidden");
  $("contestStatus").textContent = c.status === "live" ? "LIVE" : "ENDED";
  $("prizeText").textContent = c.prize || "Organizer prize";
  $("contestMessage").textContent = `${c.name} · Ends ${new Date(c.endsAt).toLocaleTimeString()}`;
  $("endContest").classList.toggle("hidden", c.status !== "live");
  $("awardPrize").classList.toggle("hidden", c.status !== "ended" || c.prizeAwarded);
  $("awardStatus").textContent = c.prizeAwarded ? "✓ Organizer marked the prize as awarded." : (c.winner ? `Winner: ${c.winner.name}` : "");
  if (timerInterval) clearInterval(timerInterval);
  const updateTimer = () => {
    const left = Math.max(0, Math.floor((c.endsAt - Date.now()) / 1000));
    $("timer").textContent = `${String(Math.floor(left/60)).padStart(2,"0")}:${String(left%60).padStart(2,"0")}`;
    if (left <= 0 && c.status === "live") $("contestMessage").textContent = "Time is up. Organizer can end the contest and declare a winner.";
  };
  updateTimer(); timerInterval = setInterval(updateTimer, 1000);
}
function renderLeaderboard(items) {
  const target = $("leaderboard"); target.innerHTML = "";
  if (!items || !items.length) { target.innerHTML = '<p class="muted">No scores yet. Update your score during the contest.</p>'; return; }
  items.forEach(item => {
    const row = document.createElement("div"); row.className = "rank-row";
    const rank = document.createElement("span"); rank.className = "rank-number"; rank.textContent = `#${item.rank}`;
    const details = document.createElement("div");
    const name = document.createElement("div"); name.className = "rank-name"; name.textContent = item.name;
    const sub = document.createElement("div"); sub.className = "rank-details"; sub.textContent = `${item.solved} solved`;
    details.append(name, sub);
    const score = document.createElement("span"); score.className = "rank-score"; score.textContent = item.score;
    row.append(rank, details, score); target.append(row);
  });
}
$("language").onchange = () => {
  if (!roomId) return;
  socket.emit("language-change", { roomId, language: $("language").value });
};
$("runCode").onclick = () => {
  if (!editor) return;
  const language = $("language").value, code = editor.getValue();
  if (language !== "javascript") {
    $("output").textContent = `${language.toUpperCase()} execution is not connected yet.\n\nFor safety, this demo does not run arbitrary code on the Node server. See README for Judge0 integration guidance.`;
    return;
  }
  // Run JavaScript in a sandboxed iframe; never use eval() in the main application page.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.style.display = "none"; document.body.appendChild(iframe);
  const safePayload = JSON.stringify(code).replace(/</g, "\\u003c");
  const script = `<script>
    const send = (type, value) => parent.postMessage({source:'rtps-runner', type, value:String(value)}, '*');
    console.log = (...args) => send('log', args.map(x => { try { return typeof x === 'object' ? JSON.stringify(x) : String(x) } catch { return String(x) } }).join(' '));
    console.error = (...args) => send('error', args.join(' '));
    console.warn = (...args) => send('log', args.join(' '));
    window.onerror = (m) => send('error', m);
    try { (new Function('console', ${safePayload}))(console); } catch(e) { send('error', e.stack || e.message); }
  <\/script>`;
  const blob = new Blob([script], { type: "text/html" }); iframe.src = URL.createObjectURL(blob);
  $("output").textContent = "Running JavaScript…";
  const listener = event => {
    if (event.source !== iframe.contentWindow || event.data?.source !== "codearena-runner") return;
    const prefix = event.data.type === "error" ? "ERROR: " : "";
    if ($("output").textContent === "Running JavaScript…") $("output").textContent = "";
    $("output").textContent += prefix + event.data.value + "\n";
  };
  window.addEventListener("message", listener);
  setTimeout(() => { window.removeEventListener("message", listener); iframe.remove(); }, 1500);
};
$("downloadCode").onclick = () => {
  if (!editor) return;
  const language = $("language").value;
  const extensions = { javascript: "js", cpp: "cpp", python: "py" };
  const blob = new Blob([editor.getValue()], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `sandbox-code.${extensions[language] || "txt"}`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
// Ctrl/Cmd + Enter runs the current JavaScript snippet.
window.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault(); $("runCode").click();
  }
});
$("clearOutput").onclick = () => $("output").textContent = "";
$("startContest").onclick = () => {
  socket.emit("create-contest", {
    roomId, name: $("contestName").value, prize: $("contestPrize").value,
    durationMinutes: Number($("contestDuration").value)
  }, result => {
    if (!result?.ok) alert(result?.error || "Could not start contest.");
  });
};
$("submitScore").onclick = () => {
  socket.emit("submit-result", { roomId, score: $("scoreInput").value, solved: $("solvedInput").value }, result => {
    if (!result?.ok) alert(result?.error || "Score update failed.");
    else $("contestMessage").textContent = "Score submitted. In this demo, scores are self-reported.";
  });
};
$("endContest").onclick = () => {
  socket.emit("end-contest", { roomId }, result => {
    if (!result?.ok) return alert(result?.error || "Could not end contest.");
    $("contestMessage").textContent = result.winner ? `Winner declared: ${result.winner.name}` : "Contest ended. No scores submitted.";
  });
};
$("awardPrize").onclick = () => {
  socket.emit("mark-prize-awarded", { roomId }, result => {
    if (!result?.ok) return alert(result?.error || "Could not update prize status.");
  });
};
window.addEventListener("popstate", () => location.reload());
if (roomId) {
  $("home").classList.add("hidden"); $("workspace").classList.remove("hidden"); $("copyLink").classList.remove("hidden");
  if (socket.connected) joinById(roomId);
}
