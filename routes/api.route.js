const apiController = require("../controllers/api.controller");
var express = require("express");
var router = express.Router();

router.get("/notify", apiController.sendNotification);
module.exports = router;
