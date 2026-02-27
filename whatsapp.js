const {
  default: WADefault,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidDecode,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  PHONENUMBER_MCC,
} = require("@adiwajshing/baileys");
const moment = require("moment-timezone");
const NodeCache = require("node-cache");
const readline = require("readline");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const PhoneNumber = require("awesome-phonenumber");
const { smsg } = require("./simple");
const qrcode = require("qrcode");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

const store = makeInMemoryStore({
  logger: pino().child({
    level: "silent",
    stream: "store",
  }),
});

let _rtaserver;
let _soket;
let _qr;

function setSocket(socket) {
  _soket = socket;
}

function getWhatsAppSocket() {
  return _rtaserver;
}

const isConnected = () => {
  return _rtaserver?.user;
};

const getQR = () => _qr;

const updateQR = (data) => {
  switch (data) {
    case "qr":
      qrcode.toDataURL(_qr, (err, url) => {
        _soket?.emit("qr", url);
        _soket?.emit("log", "QR Code received, please scan!");
      });
      break;
    case "connected":
      _soket?.emit("qrstatus", "./assets/check.svg");
      _soket?.emit("log", "WhatsApp terhubung!");
      break;
    case "qrscanned":
      _soket?.emit("qrstatus", "./assets/check.svg");
      _soket?.emit("log", "QR Code Telah discan!");
      break;
    case "loading":
      _soket?.emit("qrstatus", "./assets/loader.gif");
      _soket?.emit("log", "Registering QR Code , please wait!");
      break;
    default:
      break;
  }
};

function capital(textSound) {
  const arr = textSound.split(" ");
  for (var i = 0; i < arr.length; i++) {
    arr[i] = arr[i].charAt(0).toUpperCase() + arr[i].slice(1);
  }
  const str = arr.join(" ");
  return str;
}

function nocache(module, cb = () => {}) {
  fs.watchFile(require.resolve(module), async () => {
    await uncache(require.resolve(module));
    cb(module);
  });
}

function uncache(module = ".") {
  return new Promise((resolve, reject) => {
    try {
      delete require.cache[require.resolve(module)];
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

async function Botstarted() {
  const pairingCode = global.usePairingNumber;
  const useMobile = false;
  const { state, saveCreds } = await useMultiFileAuthState(`./${global.sessionName}`);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  const msgRetryCounterCache = new NodeCache();
  _rtaserver = WADefault({
    version,
    logger: pino({ level: "fatal" }).child({ level: "fatal" }),
    printQRInTerminal: !pairingCode,
    mobile: useMobile,
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

  store.bind(_rtaserver.ev);

  if (pairingCode && !_rtaserver.authState.creds.registered) {
    if (useMobile) throw new Error("Cannot use pairing code with mobile api");

    let phoneNumber;
    if (!!global.pairingNumber) {
      phoneNumber = global.pairingNumber.replace(/[^0-9]/g, "");

      if (
        !Object.keys(PHONENUMBER_MCC).some((v) => phoneNumber.startsWith(v))
      ) {
        console.log("Start with your country's WhatsApp code, Example : 62xxx");
        process.exit(0);
      }
    } else {
      phoneNumber = await question(`Please type your WhatsApp number : `);
      phoneNumber = phoneNumber.replace(/[^0-9]/g, "");

      if (
        !Object.keys(PHONENUMBER_MCC).some((v) => phoneNumber.startsWith(v))
      ) {
        console.log("Start with your country's WhatsApp code, Example : 62xxx");
        phoneNumber = await question(`Please type your WhatsApp number : `);
        phoneNumber = phoneNumber.replace(/[^0-9]/g, "");
        rl.close();
      }
    }

    setTimeout(async () => {
      let code = await _rtaserver.requestPairingCode(phoneNumber);
      code = code?.match(/.{1,4}/g)?.join("-") || code;
      console.log(`Your Pairing Code : `, code);
    }, 3000);
  }

  _rtaserver.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {};
      return (
        (decode.user && decode.server && decode.user + "@" + decode.server) ||
        jid
      );
    } else return jid;
  };

  _rtaserver.ev.on("contacts.update", (update) => {
    for (let contact of update) {
      let id = _rtaserver.decodeJid(contact.id);
      if (store && store.contacts)
        store.contacts[id] = {
          id,
          name: contact.notify,
        };
    }
  });

  _rtaserver.getName = (jid, withoutContact = false) => {
    id = _rtaserver.decodeJid(jid);
    withoutContact = _rtaserver.withoutContact || withoutContact;
    let v;
    if (id.endsWith("@g.us"))
      return new Promise(async (resolve) => {
        v = store.contacts[id] || {};
        if (!(v.name || v.subject)) v = _rtaserver.groupMetadata(id) || {};
        resolve(
          v.name ||
            v.subject ||
            PhoneNumber("+" + id.replace("@s.whatsapp.net", "")).getNumber(
              "international"
            )
        );
      });
    else
      v =
        id === "0@s.whatsapp.net"
          ? {
              id,
              name: "WhatsApp",
            }
          : id === _rtaserver.decodeJid(_rtaserver.user.id)
          ? _rtaserver.user
          : store.contacts[id] || {};
    return (
      (withoutContact ? "" : v.name) ||
      v.subject ||
      v.verifiedName ||
      PhoneNumber("+" + jid.replace("@s.whatsapp.net", "")).getNumber(
        "international"
      )
    );
  };

  _rtaserver.sendContact = async (jid, kon, quoted = "", opts = {}) => {
    let list = [];
    for (let i of kon) {
      list.push({
        displayName: await _rtaserver.getName(i + "@s.whatsapp.net"),
        vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${await _rtaserver.getName(
          i + "@s.whatsapp.net"
        )}\nFN:${await _rtaserver.getName(
          i + "@s.whatsapp.net"
        )}\nitem1.TEL;waid=${i}:${i}\nitem1.X-ABLabel:Ponsel\nEND:VCARD`,
      });
    }
    _rtaserver.sendMessage(
      jid,
      {
        contacts: {
          displayName: `${list.length} Kontak`,
          contacts: list,
        },
        ...opts,
      },
      {
        quoted,
      }
    );
  };

  _rtaserver.public = true;

  _rtaserver.serializeM = (m) => smsg(_rtaserver, m, store);

  _rtaserver.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      if (reason === DisconnectReason.badSession) {
        console.log(`Bad Session File, Please Delete Session and Scan Again`);
        _rtaserver.logout();
      } else if (reason === DisconnectReason.connectionClosed) {
        console.log("Connection closed, reconnecting....");
        Botstarted();
      } else if (reason === DisconnectReason.connectionLost) {
        console.log("Connection Lost from Server, reconnecting...");
        Botstarted();
      } else if (reason === DisconnectReason.connectionReplaced) {
        console.log(
          "Connection Replaced, Another New Session Opened, reconnecting..."
        );
        Botstarted();
      } else if (reason === DisconnectReason.loggedOut) {
        console.log(`Device Logged Out, Please Scan Again And Run.`);
        _rtaserver.logout();
      } else if (reason === DisconnectReason.restartRequired) {
        console.log("Restart Required, Restarting...");
        Botstarted();
      } else if (reason === DisconnectReason.timedOut) {
        console.log("Connection TimedOut, Reconnecting...");
        Botstarted();
      } else if (reason === DisconnectReason.Multidevicemismatch) {
        console.log("Multi device mismatch, please scan again");
        _rtaserver.logout();
      } else _rtaserver.end(`Unknown DisconnectReason: ${reason}|${connection}`);
    }
    if (
      update.connection == "open" ||
      update.receivedPendingNotifications == "true"
    ) {
      console.log(`Connected to = ` + JSON.stringify(_rtaserver.user, null, 2));
    }

    if (update.qr) {
      _qr = update.qr;
      updateQR("qr");
    } else if (_qr === undefined) {
      updateQR("loading");
    } else {
      if (update.connection === "open") {
        updateQR("qrscanned");
        return;
      }
    }
  });

  _rtaserver.ev.on("creds.update", saveCreds);

  _rtaserver.sendText = (jid, text, quoted = "", options) =>
    _rtaserver.sendMessage(
      jid,
      {
        text: text,
        ...options,
      },
      {
        quoted,
        ...options,
      }
    );
  return _rtaserver;
}

module.exports = {
  Botstarted,
  isConnected,
  getQR,
  updateQR,
  setSocket,
  getWhatsAppSocket,
  capital,
  nocache,
  uncache,
};
