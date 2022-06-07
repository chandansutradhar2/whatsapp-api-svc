const apiController = require("../controllers/api.controller");
const nApi = require("../controllers/napi.controller");
var express = require("express");
var router = express.Router();

router.post("/notify", apiController.sendNotification);
module.exports = router;
