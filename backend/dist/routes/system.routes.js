"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const system_controller_1 = require("../modules/system/system.controller");
const router = (0, express_1.Router)();
router.get('/bote-metrics', system_controller_1.getBoteMetrics);
router.get('/simulate-scale', system_controller_1.getSimulateScale);
exports.default = router;
