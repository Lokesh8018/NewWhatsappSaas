const express = require("express");
const router = express.Router();
const { apiKeyAuth } = require("../middleware/auth");
const { isConnected, getWhatsAppSocket } = require("../lib/whatsapp");

router.all("/send-message", apiKeyAuth, async (req, res) => {
  const pesankirim = req.body.message || req.query.message;
  const number = req.body.number || req.query.number;
  let numberWA;
  try {
    if (!req.files) {
      if (!number) {
        return res.status(500).json({
          status: false,
          response: "Nomor WA tidak disertakan!",
        });
      }

      let rawNumber = number.replace(/[^0-9]/g, "");
      if (rawNumber.startsWith("0")) {
        numberWA = (global.countrycodephone || "62") + rawNumber.substring(1) + "@s.whatsapp.net";
      } else {
        numberWA = rawNumber + "@s.whatsapp.net";
      }

      const rtaserver = getWhatsAppSocket();
      if (!isConnected()) {
        return res.status(500).json({
          status: false,
          response: "WhatsApp belum terhubung.",
        });
      }

      const exists = await rtaserver.onWhatsApp(numberWA);
      if (exists?.jid || (exists && exists[0]?.jid)) {
        let usepp = {};
        if (global.use_pp === true && global.pp_bot !== null) {
          usepp = {
            image: global.pp_bot,
            caption: pesankirim,
          };
        } else {
          usepp = {
            text: pesankirim,
          };
        }

        rtaserver
          .sendMessage(exists.jid || exists[0].jid, usepp)
          .then((result) => {
            res.status(200).json({
              status: true,
              response: result,
            });

            if (global.kirimkontak_admin === true) {
              rtaserver.sendContact(
                exists.jid || exists[0].jid,
                global.kontakadmin
              );
            }
          })
          .catch((err) => {
            res.status(500).json({
              status: false,
              response: err,
            });
          });
      } else {
        res.status(500).json({
          status: false,
          response: `Nomor ${number} tidak terdaftar.`,
        });
      }
    }
  } catch (err) {
    res.status(500).send(err);
  }
});

module.exports = router;
