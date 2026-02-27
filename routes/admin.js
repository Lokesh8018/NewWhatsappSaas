const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const sessionManager = require("../lib/sessionManager");

const BULK_MESSAGE_DELAY_MS = 500;

// Simple token-based auth (stored in cookie)
const ADMIN_TOKEN = "wa_admin_token";

function isAuthenticated(req, res, next) {
  if (req.cookies && req.cookies[ADMIN_TOKEN] === global.adminPassword) {
    return next();
  }
  res.redirect("/admin/login");
}

function isAuthenticatedAPI(req, res, next) {
  if (req.cookies && req.cookies[ADMIN_TOKEN] === global.adminPassword) {
    return next();
  }
  res.status(401).json({ status: false, message: "Unauthorized" });
}

// Login page
router.get("/login", (req, res) => {
  res.render("admin/login", { error: null });
});

router.post("/login", (req, res) => {
  const { password } = req.body;
  if (password === global.adminPassword) {
    res.cookie(ADMIN_TOKEN, password, { httpOnly: true, sameSite: "Strict", maxAge: 24 * 60 * 60 * 1000 });
    res.redirect("/admin");
  } else {
    res.render("admin/login", { error: "Invalid password" });
  }
});

router.get("/logout", (req, res) => {
  res.clearCookie(ADMIN_TOKEN);
  res.redirect("/admin/login");
});

// Dashboard
router.get("/", isAuthenticated, (req, res) => {
  res.render("admin/dashboard");
});

// ===== API Routes =====

// GET /admin/api/sessions — List all sessions
router.get("/api/sessions", isAuthenticatedAPI, (req, res) => {
  const sessions = sessionManager.getAllSessions();
  res.json({ status: true, sessions });
});

// POST /admin/api/sessions — Create new session
router.post("/api/sessions", isAuthenticatedAPI, async (req, res) => {
  try {
    const { sessionId, name, phoneNumber } = req.body;
    if (!sessionId) return res.status(400).json({ status: false, message: "sessionId is required" });

    const maxSessions = global.maxSessions || 10;
    const all = sessionManager.getAllSessions();
    if (all.length >= maxSessions) {
      return res.status(400).json({ status: false, message: `Max sessions (${maxSessions}) reached` });
    }

    await sessionManager.createSession(sessionId, phoneNumber || null);

    // Save name in metadata
    const dataDir = path.resolve(global.dataDir || "data");
    const metaFile = path.join(dataDir, "sessions.json");
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(metaFile, "utf8")); } catch(e) {}
    if (!meta[sessionId]) meta[sessionId] = {};
    meta[sessionId].name = name || sessionId;
    meta[sessionId].sessionId = sessionId;
    meta[sessionId].createdAt = meta[sessionId].createdAt || new Date().toISOString();
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));

    res.json({ status: true, message: "Session created", sessionId });
  } catch (e) {
    res.status(500).json({ status: false, message: e.message });
  }
});

// DELETE /admin/api/sessions/:id
router.delete("/api/sessions/:id", isAuthenticatedAPI, async (req, res) => {
  try {
    await sessionManager.deleteSession(req.params.id);
    res.json({ status: true, message: "Session deleted" });
  } catch (e) {
    res.status(500).json({ status: false, message: e.message });
  }
});

// POST /admin/api/sessions/:id/disconnect
router.post("/api/sessions/:id/disconnect", isAuthenticatedAPI, async (req, res) => {
  try {
    await sessionManager.disconnectSession(req.params.id);
    res.json({ status: true, message: "Session disconnected" });
  } catch (e) {
    res.status(500).json({ status: false, message: e.message });
  }
});

// POST /admin/api/sessions/:id/reconnect
router.post("/api/sessions/:id/reconnect", isAuthenticatedAPI, async (req, res) => {
  try {
    await sessionManager.createSession(req.params.id);
    res.json({ status: true, message: "Reconnecting..." });
  } catch (e) {
    res.status(500).json({ status: false, message: e.message });
  }
});

// GET /admin/api/sessions/:id/status
router.get("/api/sessions/:id/status", isAuthenticatedAPI, (req, res) => {
  const status = sessionManager.getSessionStatus(req.params.id);
  res.json({ status: true, data: status });
});

// POST /admin/api/send-message
router.post("/api/send-message", isAuthenticatedAPI, async (req, res) => {
  try {
    const { sessionId, number, message } = req.body;
    if (!sessionId || !number || !message) {
      return res.status(400).json({ status: false, message: "sessionId, number, and message are required" });
    }

    const session = sessionManager.getSession(sessionId);
    if (!session || session.status !== "connected") {
      return res.status(400).json({ status: false, message: "Session not connected" });
    }

    let numberWA = number.replace(/[^0-9]/g, "");
    if (numberWA.startsWith("0")) {
      numberWA = (global.countrycodephone || "62") + numberWA.substring(1);
    }
    numberWA = numberWA + "@s.whatsapp.net";

    const exists = await session.socket.onWhatsApp(numberWA);
    if (!exists?.length && !exists?.jid) {
      return res.status(400).json({ status: false, message: "Number not found on WhatsApp" });
    }

    const jid = exists[0]?.jid || exists?.jid;
    await session.socket.sendMessage(jid, { text: message });
    res.json({ status: true, message: "Message sent successfully" });
  } catch (e) {
    res.status(500).json({ status: false, message: e.message });
  }
});

// POST /admin/api/send-bulk
router.post("/api/send-bulk", isAuthenticatedAPI, async (req, res) => {
  try {
    const { sessionId, numbers, message } = req.body;
    if (!sessionId || !numbers || !message) {
      return res.status(400).json({ status: false, message: "sessionId, numbers, and message are required" });
    }

    const session = sessionManager.getSession(sessionId);
    if (!session || session.status !== "connected") {
      return res.status(400).json({ status: false, message: "Session not connected" });
    }

    const numArray = Array.isArray(numbers) ? numbers : numbers.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);
    const results = [];

    for (const number of numArray) {
      try {
        let numberWA = number.replace(/[^0-9]/g, "");
        if (numberWA.startsWith("0")) numberWA = (global.countrycodephone || "62") + numberWA.substring(1);
        numberWA = numberWA + "@s.whatsapp.net";

        const exists = await session.socket.onWhatsApp(numberWA);
        if (exists?.length || exists?.jid) {
          const jid = exists[0]?.jid || exists?.jid;
          await session.socket.sendMessage(jid, { text: message });
          results.push({ number, status: "sent" });
        } else {
          results.push({ number, status: "not_found" });
        }
        // Small delay between messages
        await new Promise(r => setTimeout(r, BULK_MESSAGE_DELAY_MS));
      } catch (e) {
        results.push({ number, status: "error", error: e.message });
      }
    }

    res.json({ status: true, results });
  } catch (e) {
    res.status(500).json({ status: false, message: e.message });
  }
});

module.exports = router;
