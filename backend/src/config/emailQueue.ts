// BullMQ background email queue (v1.5.0).
//
// Async Nodemailer dispatches (OTP, borrow confirmation, return confirmation,
// reminders) are enqueued here and processed by a BullMQ worker when Redis is
// configured. Without REDIS_URL the queue stays disabled and callers fall back
// to the existing direct `transporter.sendMail()` path, so local dev and the
// test suite are unaffected.
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import nodemailer from 'nodemailer';
import { REDIS_URL, isRedisEnabled } from './redis';

export interface EmailJobData {
  kind: string;
  mailOptions: Record<string, unknown>;
}

const QUEUE_NAME = 'cicr-email-queue';

let emailQueue: Queue<EmailJobData> | null = null;

if (isRedisEnabled && REDIS_URL) {
  // Dedicated connection: BullMQ runs blocking commands, so it must not share
  // the session/cache client.
  const connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
  connection.on('error', (err: Error) => console.warn('[EMAIL QUEUE] redis connection error:', err.message));

  emailQueue = new Queue<EmailJobData>(QUEUE_NAME, { connection });

  const worker = new Worker<EmailJobData>(
    QUEUE_NAME,
    async (job) => {
      const { kind, mailOptions } = job.data;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 587,
        auth: {
          user: process.env.SMTP_USER || 'cicrinventory@gmail.com',
          pass: process.env.SMTP_PASS || 'qbgfgbldvvxxubjx'
        }
      });
      const info = await transporter.sendMail(mailOptions as nodemailer.SendMailOptions);
      console.log(
        `[EMAIL QUEUE] ${kind} sent (job ${job.id}) | messageId=${info.messageId} | accepted=${JSON.stringify(info.accepted || [])}`
      );
    },
    { connection, concurrency: 5 }
  );
  worker.on('failed', (job, err) => {
    console.error(`[EMAIL QUEUE] ${job?.data?.kind} failed (job ${job?.id}): ${err.message}`);
  });

  console.log('⚡ BullMQ email queue enabled (Redis).');
}

export const isEmailQueueEnabled = (): boolean => emailQueue !== null;

export const enqueueEmail = async (kind: string, mailOptions: Record<string, unknown>): Promise<boolean> => {
  if (!emailQueue) return false;
  try {
    await emailQueue.add(kind, { kind, mailOptions }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
    return true;
  } catch (err: any) {
    console.error('[EMAIL QUEUE] enqueue failed:', err.message);
    return false;
  }
};
