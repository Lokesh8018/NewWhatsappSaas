const {
  default: WADefault,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidDecode,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
} = require("@adiwajshing/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");
const NodeCache = require("node-cache");
const fs = require("fs");
const path = require("path");

const RECONNECT_DELAY_MS = 3000;
const PAIRING_CODE_REQUEST_DELAY_MS = 3000;

// Ensure directories exist
const sessionsDir = path.resolve(global.sessionDir || "sessions");
const dataDir = path.resolve(global.dataDir || "data");
const sessionsMetaFile = path.join(dataDir, "sessions.json");

if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Sessions Map: sessionId -> { socket, store, status, saveCreds, ... }
const sessions = new Map();
// Socket.IO instance (set externally)
let ioInstance = null;

function setIO(io) {
  ioInstance = io;
}

// Read session metadata from JSON file
function readSessionsMeta() {
  try {
    if (fs.existsSync(sessionsMetaFile)) {
      return JSON.parse(fs.readFileSync(sessionsMetaFile, "utf8"));
    }
  } catch (e) {
    console.error("Error reading sessions meta:", e.message);
  }
  return {};
}

// Write session metadata to JSON file
function writeSessionsMeta(meta) {
  try {
    fs.writeFileSync(sessionsMetaFile, JSON.stringify(meta, null, 2));
  } catch (e) {
    console.error("Error writing sessions meta:", e.message);
  }
}

// Update a single session's metadata
function updateSessionMeta(sessionId, updates) {
  const meta = readSessionsMeta();
  meta[sessionId] = { ...(meta[sessionId] || {}), ...updates };
  writeSessionsMeta(meta);
}

// Emit Socket.IO event scoped to a session
function emitToSession(sessionId, event, data) {
  if (ioInstance) {
    ioInstance.to(`session:${sessionId}`).emit(event, data);
  }
}

async function createSession(sessionId, phoneNumber = null) {
  // Check if already exists and connected
  if (sessions.has(sessionId)) {
    const existing = sessions.get(sessionId);
    if (existing.status === "connected") return existing;
    // If not connected, clean up first
    try {
      existing.socket?.ws?.close();
    } catch (e) {}
    sessions.delete(sessionId);
  }

  const sessionAuthDir = path.join(sessionsDir, sessionId);
  if (!fs.existsSync(sessionAuthDir)) fs.mkdirSync(sessionAuthDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionAuthDir);
  const { version } = await fetchLatestBaileysVersion();
  const msgRetryCounterCache = new NodeCache();

  const store = makeInMemoryStore({
    logger: pino().child({ level: "silent", stream: "store" }),
  });

  const sessionData = {
    sessionId,
    status: "connecting",
    socket: null,
    store,
    saveCreds,
    reconnectTimer: null,
    phoneNumber,
  };
  sessions.set(sessionId, sessionData);

  updateSessionMeta(sessionId, {
    sessionId,
    status: "connecting",
    createdAt: readSessionsMeta()[sessionId]?.createdAt || new Date().toISOString(),
    lastConnected: null,
  });

  emitToSession(sessionId, "session:status", { status: "connecting" });

  const sock = WADefault({
    version,
    logger: pino({ level: "fatal" }).child({ level: "fatal" }),
    printQRInTerminal: false,
    browser: ["Chrome (Linux)", "", ""],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        pino({ level: "fatal" }).child({ level: "fatal" })
      ),
    },
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => {
      let jid = jidNormalizedUser(key.remoteJid);
      let msg = await store.loadMessage(jid, key.id);
      return msg?.message || "";
    },
    msgRetryCounterCache,
    defaultQueryTimeoutMs: undefined,
  });

  store.bind(sock.ev);
  sessionData.socket = sock;

  // Handle pairing code request if phone number provided
  if (phoneNumber && !sock.authState.creds.registered) {
    sessionData.status = "pairing";
    updateSessionMeta(sessionId, { status: "pairing" });
    emitToSession(sessionId, "session:status", { status: "pairing" });

    setTimeout(async () => {
      try {
        let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ""));
        code = code?.match(/.{1,4}/g)?.join("-") || code;
        emitToSession(sessionId, "session:pairing-code", { code });
      } catch (e) {
        emitToSession(sessionId, "session:error", { message: "Failed to get pairing code: " + e.message });
      }
    }, PAIRING_CODE_REQUEST_DELAY_MS);
  }

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      sessionData.status = "qr_ready";
      sessionData.qr = qr;
      updateSessionMeta(sessionId, { status: "qr_ready" });
      emitToSession(sessionId, "session:status", { status: "qr_ready" });

      const qrcode = require("qrcode");
      qrcode.toDataURL(qr, (err, url) => {
        if (!err) emitToSession(sessionId, "session:qr", { qr: url });
      });
    }

    if (connection === "open") {
      sessionData.status = "connected";
      sessionData.qr = null;
      const user = sock.user;
      updateSessionMeta(sessionId, {
        status: "connected",
        phoneNumber: user?.id?.split(":")[0] || phoneNumber,
        name: user?.name || sessionId,
        lastConnected: new Date().toISOString(),
      });
      emitToSession(sessionId, "session:connected", { user });
      emitToSession(sessionId, "session:status", { status: "connected" });
    }

    if (connection === "close") {
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      sessionData.status = "disconnected";
      updateSessionMeta(sessionId, { status: "disconnected" });
      emitToSession(sessionId, "session:status", { status: "disconnected" });

      const shouldReconnect =
        reason !== DisconnectReason.loggedOut &&
        reason !== DisconnectReason.badSession;

      if (shouldReconnect) {
        console.log(`Session ${sessionId}: Reconnecting (reason: ${reason})...`);
        if (sessionData.reconnectTimer) clearTimeout(sessionData.reconnectTimer);
        sessionData.reconnectTimer = setTimeout(() => {
          sessionData.reconnectTimer = null;
          createSession(sessionId);
        }, RECONNECT_DELAY_MS);
      } else {
        console.log(`Session ${sessionId}: Logged out or bad session, not reconnecting.`);
        emitToSession(sessionId, "session:error", { message: "Session ended. Please re-link." });
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // Decode JID helper
  sock.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {};
      return (decode.user && decode.server && decode.user + "@" + decode.server) || jid;
    }
    return jid;
  };

  return sessionData;
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function getSessionStatus(sessionId) {
  const meta = readSessionsMeta();
  const inMemory = sessions.get(sessionId);
  return {
    ...(meta[sessionId] || {}),
    status: inMemory?.status || meta[sessionId]?.status || "disconnected",
  };
}

function getAllSessions() {
  const meta = readSessionsMeta();
  return Object.values(meta);
}

async function deleteSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session?.reconnectTimer) clearTimeout(session.reconnectTimer);
  if (session?.socket) {
    try {
      await session.socket.logout();
    } catch (e) {}
    try {
      session.socket.ws?.close();
    } catch (e) {}
  }
  sessions.delete(sessionId);

  // Delete auth state directory
  const sessionAuthDir = path.join(sessionsDir, sessionId);
  if (fs.existsSync(sessionAuthDir)) {
    fs.rmSync(sessionAuthDir, { recursive: true, force: true });
  }

  // Remove from metadata
  const meta = readSessionsMeta();
  delete meta[sessionId];
  writeSessionsMeta(meta);
}

async function disconnectSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session?.reconnectTimer) clearTimeout(session.reconnectTimer);
  if (session?.socket) {
    try {
      await session.socket.logout();
    } catch (e) {}
  }
  session && (session.status = "disconnected");
  updateSessionMeta(sessionId, { status: "disconnected" });
}

// Restore previously connected sessions on server startup
async function restoreAllSessions() {
  const meta = readSessionsMeta();
  for (const [sessionId, data] of Object.entries(meta)) {
    if (data.status === "connected" || data.status === "connecting") {
      console.log(`Restoring session: ${sessionId}`);
      try {
        await createSession(sessionId);
      } catch (e) {
        console.error(`Failed to restore session ${sessionId}:`, e.message);
      }
    }
  }
}

module.exports = {
  setIO,
  createSession,
  getSession,
  getSessionStatus,
  getAllSessions,
  deleteSession,
  disconnectSession,
  restoreAllSessions,
  updateSessionMeta,
};
