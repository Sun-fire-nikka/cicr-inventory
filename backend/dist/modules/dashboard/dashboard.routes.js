"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboard_controller_1 = require("./dashboard.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/stats', dashboard_controller_1.getDashboardStats);
router.get('/audit', auth_middleware_1.authenticateToken, dashboard_controller_1.getAuditLogs);
exports.default = router;
