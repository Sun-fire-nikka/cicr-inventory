"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueEmail = exports.isEmailQueueEnabled = void 0;
// BullMQ background email queue (v1.5.0).
//
// Async Nodemailer dispatches (OTP, borrow confirmation, return confirmation,
// reminders) are enqueued here and processed by a BullMQ worker when Redis is
// configured. Without REDIS_URL the queue stays disabled and callers fall back
// to the existing direct `transporter.sendMail()` path, so local dev and the
// test suite are unaffected.
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const redis_1 = require("./redis");
const QUEUE_NAME = 'cicr-email-queue';
let emailQueue = null;
if (redis_1.isRedisEnabled && redis_1.REDIS_URL) {
    // Dedicated connection: BullMQ runs blocking commands, so it must not share
    // the session/cache client.
    const connection = new ioredis_1.default(redis_1.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
    connection.on('error', (err) => console.warn('[EMAIL QUEUE] redis connection error:', err.message));
    emailQueue = new bullmq_1.Queue(QUEUE_NAME, { connection });
    const worker = new bullmq_1.Worker(QUEUE_NAME, async (job) => {
        const { kind, mailOptions } = job.data;
        const transporter = nodemailer_1.default.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT) || 587,
            auth: {
                user: process.env.SMTP_USER || 'cicrinventory@gmail.com',
                pass: process.env.SMTP_PASS || 'qbgfgbldvvxxubjx'
            }
        });
        const info = await transporter.sendMail(mailOptions);
        console.log(`[EMAIL QUEUE] ${kind} sent (job ${job.id}) | messageId=${info.messageId} | accepted=${JSON.stringify(info.accepted || [])}`);
    }, { connection, concurrency: 5 });
    worker.on('failed', (job, err) => {
        console.error(`[EMAIL QUEUE] ${job?.data?.kind} failed (job ${job?.id}): ${err.message}`);
    });
    console.log('⚡ BullMQ email queue enabled (Redis).');
}
const isEmailQueueEnabled = () => emailQueue !== null;
exports.isEmailQueueEnabled = isEmailQueueEnabled;
const enqueueEmail = async (kind, mailOptions) => {
    if (!emailQueue)
        return false;
    try {
        await emailQueue.add(kind, { kind, mailOptions }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
        return true;
    }
    catch (err) {
        console.error('[EMAIL QUEUE] enqueue failed:', err.message);
        return false;
    }
};
exports.enqueueEmail = enqueueEmail;
