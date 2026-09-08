"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("./auth.controller");
const authOtpController_1 = require("./authOtpController");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post('/register', auth_controller_1.register);
router.post('/login', auth_controller_1.login);
router.post('/send-otp', authOtpController_1.sendOtp);
router.post('/verify-otp', authOtpController_1.verifyOtp);
router.get('/profile', auth_middleware_1.authenticateToken, auth_controller_1.getProfile);
// Admin user approval and member management routes
router.get('/admin/users', auth_middleware_1.authenticateToken, auth_middleware_1.requireAdmin, auth_controller_1.listUsersForAdmin);
router.post('/admin/users/:id/approve', auth_middleware_1.authenticateToken, auth_middleware_1.requireAdmin, auth_controller_1.approveUser);
router.post('/admin/users/:id/reject', auth_middleware_1.authenticateToken, auth_middleware_1.requireAdmin, auth_controller_1.rejectUser);
router.post('/admin/users/:id/role', auth_middleware_1.authenticateToken, auth_middleware_1.requireAdmin, auth_controller_1.changeUserRole);
router.delete('/admin/users/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireAdmin, auth_controller_1.deleteUser);
exports.default = router;
