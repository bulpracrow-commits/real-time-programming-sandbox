# Real-Time Programming Sandbox

A student-project starter with:
- Shareable room links
- Multi-user code editing synchronized with Socket.IO
- Monaco Editor (JavaScript, C++, Python syntax highlighting)
- JavaScript demo runner in a sandboxed iframe
- Export current code as `.js`, `.cpp`, or `.py`
- `Ctrl+Enter` / `Cmd+Enter` run shortcut
- Contest creation, duration timer, manually submitted demo scores, live leaderboard
- Organizer-entered prize and winner/prize-awarded status
- JSON file persistence (`data.json` is created automatically)

## Requirements
- Node.js 18+ (recommended)
- Internet connection for Monaco Editor CDN

## Run on Windows
1. Extract this ZIP.
2. Open the extracted `real-time-programming-sandbox` folder in VS Code.
3. In VS Code, choose **Terminal → New Terminal**.
4. Run:
   ```bash
   npm install
   npm start
   ```
5. Open `http://localhost:3000` in Chrome.
6. Enter a display name and click **Create room**.
7. Click **Copy invite link**. For testing on the same PC, open the link in another browser/incognito window. Both windows must connect to the same server.
8. For friends on other networks, deploy the app to a Node-compatible host with WebSocket support and share the deployed room link. `localhost` links only work on your own computer.

## Current MVP limitations — read before a real contest
- **Scores are self-reported demo values.** They are not proof that code passed test cases. Do not use this as a real ranked contest until server-side judging and anti-cheat controls are added.
- JavaScript runs in a sandboxed iframe, but this simple demo runner is not a hardened production execution service. Do not run untrusted code on a public deployment.
- C++ and Python have syntax highlighting only; execution is not wired up.
- Anyone with a room link can join. There is no login, host authorization, or private-room access control yet. The MVP should not be used to distribute valuable prizes until these controls are implemented.
- Prize is an organizer-declared item (e.g. certificate, trophy, book); the app does not collect money or automatically send prizes.
- JSON persistence is suitable for a local demo, not multi-instance production hosting.

## Suggested production upgrades
1. Add authentication (e.g. verified email) and role-based organizer permissions.
2. Integrate a secure judge service such as Judge0 behind a server API. Store test cases server-side; never send hidden tests or API secrets to the browser.
3. Only award points after the judge confirms accepted test cases. Add rate limits, time/memory limits, and abuse protection.
4. Use MongoDB/PostgreSQL for durable data and a shared Socket.IO adapter if running multiple server instances.
5. Add contest problem management, hidden test cases, audit logs, and a clear prize policy.
6. Use HTTPS and a host with WebSocket support.

## Main files
- `server.js` — Express server, Socket.IO events, rooms, contest state, leaderboard
- `public/index.html` — app structure
- `public/style.css` — dark responsive UI
- `public/app.js` — editor, collaboration, room UI, contest controls
- `data.json` — generated data store

## Demo flow
Create room → copy invite link → join from a second browser → type code in either window → create contest → submit sample scores from each participant → end contest → mark prize awarded.

This is a functional learning MVP, not a secure production contest platform.
