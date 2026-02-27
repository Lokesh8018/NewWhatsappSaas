const express = require("express");
const router = express.Router();
const path = require("path");

router.get("/", (req, res) => {
  res.sendFile("./client/index.html", { root: path.resolve(__dirname, "..") });
});

router.get("/scan", (req, res) => {
  res.sendFile("./client/server.html", { root: path.resolve(__dirname, "..") });
});

router.get("/pair", (req, res) => {
  res.sendFile("./client/pair.html", { root: path.resolve(__dirname, "..") });
});

router.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

module.exports = router;
