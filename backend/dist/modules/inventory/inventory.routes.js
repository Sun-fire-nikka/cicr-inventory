"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const inventory_controller_1 = require("./inventory.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Public / Authenticated User Routes
router.get('/', inventory_controller_1.getItems);
router.get('/categories', inventory_controller_1.getCategories);
router.get('/:id', inventory_controller_1.getItemById);
// Admin Only Routes
router.post('/', auth_middleware_1.authenticateToken, auth_middleware_1.requireAdmin, inventory_controller_1.createItem);
router.patch('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireAdmin, inventory_controller_1.updateItem);
router.delete('/:id', auth_middleware_1.authenticateToken, auth_middleware_1.requireAdmin, inventory_controller_1.deleteItem);
exports.default = router;
