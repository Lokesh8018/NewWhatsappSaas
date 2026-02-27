require("./settings");
const express = require("express");
const fileUpload = require("express-fileupload");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const http = require("http");
const path = require("path");

const { Botstarted, isConnected, getQR, updateQR, setSocket } = require("./lib/whatsapp");
const sessionManager = require("./lib/sessionManager");
const pagesRouter = require("./routes/pages");
const apiRouter = require("./routes/api");
const adminRouter = require("./routes/admin");

var app = express();

app.use(
  fileUpload({
    createParentPath: true,
  })
);

app.use(morgan("dev"));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.set("view engine", "ejs");
app.use("/p", express.static(path.resolve("public")));
app.use("/p/*", (req, res) => res.status(404).send("Media Not Found"));

const PORT = process.env.PORT || global.port || "5001";
app.set("port", PORT);
var server = http.createServer(app);
server.on("listening", () => console.log("APP IS RUNNING ON PORT " + PORT));

server.listen(PORT);

const io = require("socket.io")(server);

app.use("/assets", express.static(__dirname + "/client/assets"));

app.use("/admin", adminRouter);
app.use(apiRouter);
app.use(pagesRouter);

io.on("connection", async (socket) => {
  setSocket(socket);
  if (isConnected()) {
    updateQR("connected");
  } else if (getQR()) {
    updateQR("qr");
  }

  socket.on("join:session", (sessionId) => {
    socket.join(`session:${sessionId}`);
  });

  socket.on("create:session", async (data) => {
    const { sessionId, name, method, phoneNumber } = data;
    if (!sessionId) return;
    try {
      await sessionManager.createSession(sessionId, method === "pairing" ? phoneNumber : null);
      if (name) {
        sessionManager.updateSessionMeta(sessionId, { name });
      }
    } catch (e) {
      socket.emit("session:error", { message: e.message });
    }
  });
});

Botstarted();

sessionManager.setIO(io);
sessionManager.restoreAllSessions().catch(console.error);
