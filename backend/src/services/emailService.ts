import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { enqueueEmail } from '../config/emailQueue';

dotenv.config();

// Verified sender + default test recipient (v1.4.7).
// Sender is pinned to the verified personal Gmail account; the default test
// recipient ('kush' / kushgdhi@gmail.com) is used by test/test-email.cjs.
// The diagnostic probe (test-email.cjs) additionally targets the institutional
// numeric student inbox 992501030406@mail.jiit.ac.in (Institutional Email Support).
const SENDER_NAME = 'CICR Inventory Support';
export const DEFAULT_TEST_RECIPIENT_EMAIL = 'kushgdhi@gmail.com';
export const DEFAULT_SENDER_EMAIL = 'kushagragargdelhi@gmail.com';

// Configure transport using environment variables or a fallback test account
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

export interface HolderSummary {
  borrower_name: string;
  roll_number?: string | null;
  quantity: number;
  borrowed_at?: string | null;
}

export interface BorrowEmailContext {
  itemName: string;
  category?: string | null;
  quantity: number;
  remainingStock: number;
  holders: HolderSummary[];
  durationDays: number;
  dueDate: Date | string;
}

const formatDueDate = (dueDate: Date | string): string => {
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return String(dueDate);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

const formatSmtpError = (error: any): string => {
  const parts: string[] = [];
  if (error?.message) parts.push(`message=${JSON.stringify(error.message)}`);
  if (error?.code !== undefined && error?.code !== null) parts.push(`code=${JSON.stringify(error.code)}`);
  if (error?.response) parts.push(`response=${JSON.stringify(error.response)}`);
  if (error?.responseCode !== undefined && error?.responseCode !== null) parts.push(`responseCode=${JSON.stringify(error.responseCode)}`);
  return parts.length ? parts.join(' ') : 'Unknown SMTP error';
};

// Dynamic Message-ID generation per RFC 2822 §3.6.4:
//   msg-id  = "<" id-left "@" id-right ">"
//   id-left = dot-atom-text (unix-ms "." 128-bit hex)
//   id-right = domain (derived from the configured SMTP host so it aligns with
//              the authenticated sending domain for SPF/DKIM friendliness)
const generateMessageId = (): string => {
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const idRight = smtpHost.replace(/^smtp\./i, '').trim().toLowerCase() || 'gmail.com';
  const idLeft = `${Date.now()}.${crypto.randomBytes(16).toString('hex')}`;
  return `<${idLeft}@${idRight}>`;
};

// Shared delivery headers. Priority 'high' is used for the 10-minute OTP so
// mobile clients surface it immediately; everything else is 'normal'.
const buildHeaders = (kind: string, priority: 'high' | 'normal' = 'normal') => ({
  'X-CICR-Mailer': `CICR-Inventory/v1.4.7`,
  'X-Mailer-Type': kind,
  'X-Priority': priority === 'high' ? '1 (Highest)' : '3 (Normal)',
  'Importance': priority === 'high' ? 'High' : 'Normal',
  'List-Unsubscribe': `<mailto:${process.env.SMTP_USER || 'no-reply@cicr.edu'}?subject=unsubscribe>`,
});

// Log the FULL SMTP delivery response (info.response is the raw SMTP dialogue
// tail, e.g. "250 2.0.0 OK 17e-20020a170902a7b0...") plus accepted/rejected
// recipient arrays — the exact codes needed to debug @mail.jiit.ac.in delivery.
const logDelivery = (kind: string, info: any): void => {
  console.log(
    `[EMAIL SERVICE] ${kind} accepted by SMTP | messageId=${info?.messageId} | ` +
    `response="${info?.response}" | accepted=${JSON.stringify(info?.accepted || [])} | ` +
    `rejected=${JSON.stringify(info?.rejected || [])}`
  );
};

const buildHoldersTable = (holders: HolderSummary[]): string => {
  if (!holders.length) {
    return '<p style="color:#666;">You are the only one currently holding this item.</p>';
  }
  const rows = holders
    .map((h) => {
      const who = `${h.borrower_name}${h.roll_number ? ` (${h.roll_number})` : ''}`;
      const when = h.borrowed_at ? new Date(h.borrowed_at).toLocaleDateString('en-GB') : '—';
      return `<tr><td style="padding:6px 10px;border:1px solid #ddd;">${who}</td><td style="padding:6px 10px;border:1px solid #ddd;">${h.quantity}</td><td style="padding:6px 10px;border:1px solid #ddd;">${when}</td></tr>`;
    })
    .join('');
  return `
    <table style="border-collapse:collapse;font-size:14px;">
      <tr><th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Borrower</th><th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Units</th><th style="padding:6px 10px;border:1px solid #ddd;text-align:left;">Borrowed On</th></tr>
      ${rows}
    </table>`;
};

export const sendBorrowConfirmation = async (
  recipientEmail: string,
  borrowerName: string,
  context: BorrowEmailContext
) => {
  try {
    const formattedDueDate = formatDueDate(context.dueDate);
    const holdersTable = buildHoldersTable(context.holders);
    const categoryLine = context.category ? ` (${context.category})` : '';
    const mailOptions = {
      from: process.env.SMTP_FROM || `"${SENDER_NAME}" <${process.env.SMTP_USER || DEFAULT_SENDER_EMAIL}>`,
      replyTo: process.env.SMTP_USER || DEFAULT_SENDER_EMAIL,
      to: recipientEmail,
      subject: `[CICR Inventory] Borrow Confirmation: ${context.itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('borrow-confirmation'),
      priority: 'normal' as const,
      text: [
        `Hello ${borrowerName},`,
        '',
        `You have successfully borrowed ${context.quantity}x ${context.itemName}${categoryLine}.`,
        '',
        `Remaining available stock: ${context.remainingStock}`,
        '',
        `Borrow duration: ${context.durationDays} day(s)`,
        `Due date: ${formattedDueDate}`,
        '',
        `Current holders of ${context.itemName}:`,
        ...context.holders.map((h) => `  - ${h.borrower_name}${h.roll_number ? ` (${h.roll_number})` : ''}: ${h.quantity} unit(s)`),
        ...(context.holders.length ? [] : ['  - You are the only one currently holding this item.']),
        '',
        'IMPORTANT: Please return the item on or before the due date (5-day policy).',
        'Regards,',
        'CICR Management Team'
      ].join('\n'),
      html: `
        <h3>CICR Inventory - Borrow Confirmation</h3>
        <p>Hello <strong>${borrowerName}</strong>,</p>
        <p>You have successfully borrowed <strong>${context.quantity}x ${context.itemName}</strong>${categoryLine}.</p>
        <p><strong>Remaining available stock:</strong> ${context.remainingStock}</p>
        <p><strong>Borrow duration:</strong> ${context.durationDays} day(s)</p>
        <p><strong>Due date:</strong> ${formattedDueDate}</p>
        <h4>Current holders of ${context.itemName}</h4>
        ${holdersTable}
        <p style="background:#fff3cd;border-left:4px solid #ffc107;padding:10px;">
          <strong>Reminder:</strong> Please return the item on or before <strong>${formattedDueDate}</strong>.
          A strict 5-day return policy applies.
        </p>
        <br/>
        <p><em>CICR Management Team</em></p>
      `,
    };

    if (!process.env.SMTP_USER) {
      console.log(`[MOCK EMAIL SERVICE] Borrow email dispatched to ${recipientEmail} for '${context.itemName}' (Qty: ${context.quantity}, Remaining: ${context.remainingStock}, Due: ${formattedDueDate})`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('borrow-confirmation', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Borrow email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send borrow email to ${recipientEmail}: ${formatSmtpError(error)}`);
    // Graceful failover so email failures don't crash the borrow HTTP response
    return { success: false, error: formatSmtpError(error) };
  }
};

export const sendOtpEmail = async (
  adminEmail: string,
  adminName: string,
  studentName: string,
  otp: string,
  itemName: string,
  durationDays: number
) => {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || `"${SENDER_NAME}" <${process.env.SMTP_USER || DEFAULT_SENDER_EMAIL}>`,
      replyTo: process.env.SMTP_USER || DEFAULT_SENDER_EMAIL,
      to: adminEmail,
      subject: `[CICR Inventory] Borrow Approval OTP: ${otp}`,
      messageId: generateMessageId(),
      headers: buildHeaders('borrow-otp', 'high'),
      priority: 'high' as const,
      text: [
        `Hello ${adminName},`,
        '',
        `${studentName} has requested approval to borrow:`,
        `  Item: ${itemName}`,
        `  Duration: ${durationDays} day(s)`,
        '',
        `Approval OTP: ${otp}`,
        '',
        'This OTP is valid for 10 minutes. Share it with the student only after verifying the request.',
        'Regards,',
        'CICR Management Team'
      ].join('\n'),
      html: `
        <h3>CICR Inventory - Borrow Approval Request</h3>
        <p>Hello <strong>${adminName}</strong>,</p>
        <p><strong>${studentName}</strong> has requested approval to borrow:</p>
        <ul>
          <li><strong>Item:</strong> ${itemName}</li>
          <li><strong>Duration:</strong> ${durationDays} day(s)</li>
        </ul>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;background:#f0f4ff;padding:10px;border-radius:6px;">${otp}</p>
        <p>This OTP is <strong>valid for 10 minutes</strong>. Share it with the student only after verifying the request.</p>
        <br/>
        <p><em>CICR Management Team</em></p>
      `,
    };

    if (!process.env.SMTP_USER) {
      console.log(`[MOCK EMAIL SERVICE] OTP dispatched to admin ${adminEmail} for '${itemName}' (OTP: ${otp}, Expires: 10m)`);
      return { success: true, mocked: true, otp };
    }

    if (await enqueueEmail('borrow-otp', mailOptions)) {
      return { success: true, queued: true, otp };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('OTP email', info);
    return {
      success: true,
      messageId: info.messageId,
      info: {
        envelope: info.envelope,
        accepted: info.accepted,
        rejected: info.rejected,
        pending: info.pending,
        response: info.response,
        messageId: info.messageId,
        headers: mailOptions.headers,
        replyTo: mailOptions.replyTo
      }
    };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send OTP email to ${adminEmail}: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

export const sendUpcomingReminder = async (
  recipientEmail: string,
  borrowerName: string,
  itemName: string,
  dueDate: Date | string
) => {
  try {
    const formattedDueDate = formatDueDate(dueDate);
    const mailOptions = {
      from: process.env.SMTP_FROM || `"${SENDER_NAME}" <${process.env.SMTP_USER || DEFAULT_SENDER_EMAIL}>`,
      replyTo: process.env.SMTP_USER || DEFAULT_SENDER_EMAIL,
      to: recipientEmail,
      subject: `[CICR Inventory] Return Due Tomorrow: ${itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('upcoming-reminder'),
      priority: 'normal' as const,
      text: [
        `Hello ${borrowerName},`,
        '',
        `Reminder: your borrowed item "${itemName}" is due TOMORROW (${formattedDueDate}).`,
        '',
        'Please return it to the lab on or before the due date.',
        'Regards,',
        'CICR Management Team'
      ].join('\n'),
      html: `
        <h3>CICR Inventory - Return Due Tomorrow</h3>
        <p>Hello <strong>${borrowerName}</strong>,</p>
        <p><strong>Reminder:</strong> your borrowed item <strong>"${itemName}"</strong> is due <strong>tomorrow</strong> (${formattedDueDate}).</p>
        <p>Please return it to the lab on or before the due date.</p>
        <br/>
        <p><em>CICR Management Team</em></p>
      `,
    };

    if (!process.env.SMTP_USER) {
      console.log(`[MOCK EMAIL SERVICE] Upcoming-due reminder dispatched to ${recipientEmail} for '${itemName}' (Due: ${formattedDueDate})`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('upcoming-reminder', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Upcoming-due reminder', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send upcoming-due reminder to ${recipientEmail}: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

export const sendReturnReminder = async (
  recipientEmail: string,
  borrowerName: string,
  itemName: string,
  dueDate: Date | string,
  daysOverdue: number
) => {
  try {
    const formattedDueDate = formatDueDate(dueDate);
    const overdueNotice = daysOverdue > 0
      ? `Your return is ${daysOverdue} day(s) overdue.`
      : 'Your item is due today.';
    const mailOptions = {
      from: process.env.SMTP_FROM || `"${SENDER_NAME}" <${process.env.SMTP_USER || DEFAULT_SENDER_EMAIL}>`,
      replyTo: process.env.SMTP_USER || DEFAULT_SENDER_EMAIL,
      to: recipientEmail,
      subject: daysOverdue > 0
        ? `[CICR Inventory] OVERDUE Return: ${itemName}`
        : `[CICR Inventory] Return Due Today: ${itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('return-reminder'),
      priority: 'normal' as const,
      text: [
        `Hello ${borrowerName},`,
        '',
        `${overdueNotice}`,
        `Item: ${itemName}`,
        `Due date: ${formattedDueDate}`,
        '',
        'Please return it to the lab at your earliest convenience.',
        'Regards,',
        'CICR Management Team'
      ].join('\n'),
      html: `
        <h3>CICR Inventory - Return Reminder</h3>
        <p>Hello <strong>${borrowerName}</strong>,</p>
        <p><strong>${overdueNotice}</strong></p>
        <p><strong>Item:</strong> ${itemName}</p>
        <p><strong>Due date:</strong> ${formattedDueDate}</p>
        <p>Please return it to the lab at your earliest convenience.</p>
        <br/>
        <p><em>CICR Management Team</em></p>
      `,
    };

    if (!process.env.SMTP_USER) {
      console.log(`[MOCK EMAIL SERVICE] Return reminder dispatched to ${recipientEmail} for '${itemName}' (Due: ${formattedDueDate}, Overdue: ${daysOverdue}d)`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('return-reminder', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Return reminder', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send return reminder to ${recipientEmail}: ${formatSmtpError(error)}`);
    // Graceful failover so email failures don't crash the reminder job
    return { success: false, error: formatSmtpError(error) };
  }
};

export const sendDueReminder = async (
  recipientEmail: string,
  borrowerName: string,
  itemName: string,
  quantity: number,
  dueDate: Date | string,
  dueWindowLabel: string
) => {
  try {
    const formattedDueDate = formatDueDate(dueDate);
    const isOverdue = dueWindowLabel.startsWith('overdue');
    const headline = isOverdue ? 'Overdue Item' : 'Return Reminder';
    const mailOptions = {
      from: process.env.SMTP_FROM || '"CICR Lab Admin" <no-reply@cicr.edu>',
      to: recipientEmail,
      subject: `[CICR Inventory] ${isOverdue ? 'OVERDUE' : 'Return Reminder'}: ${itemName}`,
      text: `Hello ${borrowerName},\n\nThis is a reminder that ${quantity}x ${itemName} is ${dueWindowLabel}.\n\nDue Date: ${formattedDueDate}\n\nPlease return it to the CICR lab${isOverdue ? ' as soon as possible' : ' on or before the due date'}.\n\nRegards,\nCICR Management Team`,
      html: `
        <h3>CICR Inventory - ${headline}</h3>
        <p>Hello <strong>${borrowerName}</strong>,</p>
        <p>This is a reminder that <strong>${quantity}x ${itemName}</strong> is <strong>${dueWindowLabel}</strong>.</p>
        <p><strong>Due Date:</strong> ${formattedDueDate}</p>
        <p>Please return it to the CICR lab${isOverdue ? ' as soon as possible' : ' on or before the due date'}.</p>
        <br/>
        <p><em>CICR Management Team</em></p>
      `,
    };

    if (!process.env.SMTP_USER) {
      console.log(`[MOCK EMAIL SERVICE] Reminder dispatched to ${recipientEmail} for item '${itemName}' (Qty: ${quantity}, ${dueWindowLabel}, Due: ${formattedDueDate})`);
      return { success: true, mocked: true };
    }

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] Reminder email sent successfully: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send reminder email to ${recipientEmail}:`, error.message);
    // Graceful failover so a bad address doesn't abort the rest of the sweep
    return { success: false, error: error.message };
  }
};

export const sendReturnConfirmation = async (
  recipientEmail: string,
  borrowerName: string,
  itemName: string,
  returnedAt: Date
) => {
  try {
    const formattedReturnedAt = returnedAt.toISOString();
    const mailOptions = {
      from: process.env.SMTP_FROM || `"${SENDER_NAME}" <${process.env.SMTP_USER || DEFAULT_SENDER_EMAIL}>`,
      replyTo: process.env.SMTP_USER || DEFAULT_SENDER_EMAIL,
      to: recipientEmail,
      subject: `[CICR Inventory] Return Confirmation: ${itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('return-confirmation'),
      priority: 'normal' as const,
      text: `Hello ${borrowerName},\n\nThank you! Your borrowed item ${itemName} has been successfully returned.\n\nReturned At: ${formattedReturnedAt}\n\nNo further reminders will be sent for this borrow.\n\nRegards,\nCICR Management Team`,
      html: `
        <h3>CICR Inventory - Return Confirmation</h3>
        <p>Hello <strong>${borrowerName}</strong>,</p>
        <p>Thank you! Your borrowed item <strong>${itemName}</strong> has been successfully returned.</p>
        <p><strong>Returned At:</strong> ${formattedReturnedAt}</p>
        <p>No further reminders will be sent for this borrow.</p>
        <br/>
        <p><em>CICR Management Team</em></p>
      `,
    };

    if (!process.env.SMTP_USER) {
      console.log(`[MOCK EMAIL SERVICE] Return email dispatched to ${recipientEmail} for item '${itemName}' (Returned At: ${formattedReturnedAt})`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('return-confirmation', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Return email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send return email to ${recipientEmail}: ${formatSmtpError(error)}`);
    // Graceful failover so email failures don't crash the return HTTP response
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// LOGIN OTP EMAIL (v1.6.2)
// ──────────────────────────────────────────────────────────────────────────────

export const sendLoginOtpEmail = async (
  recipientEmail: string,
  recipientName: string,
  otp: string
) => {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || `"${SENDER_NAME}" <${process.env.SMTP_USER || DEFAULT_SENDER_EMAIL}>`,
      replyTo: process.env.SMTP_USER || DEFAULT_SENDER_EMAIL,
      to: recipientEmail,
      subject: `[CICR Inventory] Login OTP: ${otp}`,
      messageId: generateMessageId(),
      headers: buildHeaders('login-otp', 'high'),
      priority: 'high' as const,
      text: [
        `Hello ${recipientName},`,
        '',
        `Your CICR Inventory login OTP is: ${otp}`,
        '',
        'This OTP is valid for 5 minutes.',
        'If you did not request this, please ignore this email.',
        '',
        'Regards,',
        'CICR Management Team'
      ].join('\n'),
      html: `
        <h3>CICR Inventory - Login OTP</h3>
        <p>Hello <strong>${recipientName}</strong>,</p>
        <p>Your login OTP is:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;background:#f0f4ff;padding:10px;border-radius:6px;">${otp}</p>
        <p>This OTP is <strong>valid for 5 minutes</strong>.</p>
        <p>If you did not request this, please ignore this email.</p>
        <br/>
        <p><em>CICR Management Team</em></p>
      `,
    };

    if (!process.env.SMTP_USER) {
      console.log(`[MOCK EMAIL SERVICE] Login OTP dispatched to ${recipientEmail} (OTP: ${otp}, Expires: 5m)`);
      return { success: true, mocked: true, otp };
    }

    if (await enqueueEmail('login-otp', mailOptions)) {
      return { success: true, queued: true, otp };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Login OTP email', info);
    return { success: true, messageId: info.messageId, otp };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send login OTP to ${recipientEmail}: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// ADMIN USER REGISTRATION ALERT EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export interface NewUserAlertContext {
  userName: string;
  userEmail: string;
  rollNumber?: string | null;
  registeredAt?: string;
}

export const sendAdminNewUserRegistrationAlert = async (
  adminEmails: string[],
  userContext: NewUserAlertContext
) => {
  try {
    if (!adminEmails || adminEmails.length === 0) return { success: false, message: 'No admin recipients provided' };

    const regTime = userContext.registeredAt
      ? new Date(userContext.registeredAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
      : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    const mailOptions = {
      from: process.env.SMTP_FROM || `"${SENDER_NAME}" <${process.env.SMTP_USER || DEFAULT_SENDER_EMAIL}>`,
      replyTo: userContext.userEmail,
      to: adminEmails.join(', '),
      subject: `[CICR Admin] 🔔 New Account Access Request: ${userContext.userName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('admin-registration-alert', 'high'),
      priority: 'high' as const,
      text: [
        `CICR ADMIN NOTIFICATION`,
        `==================================`,
        `A new user has registered on the CICR Inventory Portal and is requesting member access:`,
        ``,
        `Name: ${userContext.userName}`,
        `Email: ${userContext.userEmail}`,
        `Roll Number: ${userContext.rollNumber || 'Not Specified'}`,
        `Registered At: ${regTime} IST`,
        `Status: PENDING ADMIN APPROVAL`,
        ``,
        `Please log in to the CICR Admin Portal to approve or reject this request.`,
        ``,
        `Regards,`,
        `CICR Automated Security Service`
      ].join('\n'),
      html: `
        <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#0d0f17;color:#f3f4f6;padding:32px 20px;border-radius:12px;max-width:580px;margin:0 auto;border:1px solid rgba(0,240,255,0.2);">
          <div style="text-align:center;margin-bottom:24px;">
            <h2 style="color:#00f0ff;margin:0 0 6px 0;letter-spacing:1px;font-size:22px;">⚡ CICR INVENTORY</h2>
            <p style="color:#94a3b8;font-size:13px;margin:0;text-transform:uppercase;letter-spacing:1.5px;">Admin Member Approval Queue</p>
          </div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:20px;margin-bottom:24px;">
            <div style="display:inline-block;background:rgba(234,179,8,0.15);color:#facc15;border:1px solid rgba(234,179,8,0.3);padding:4px 10px;border-radius:20px;font-size:11px;font-weight:bold;margin-bottom:14px;">
              ⏳ PENDING APPROVAL
            </div>
            <h3 style="color:#ffffff;margin:0 0 12px 0;font-size:16px;">New Account Registration Request</h3>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr>
                <td style="padding:6px 0;color:#94a3b8;width:110px;">Name:</td>
                <td style="padding:6px 0;color:#ffffff;font-weight:bold;">${userContext.userName}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#94a3b8;">Email:</td>
                <td style="padding:6px 0;color:#00f0ff;">${userContext.userEmail}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#94a3b8;">Roll Number:</td>
                <td style="padding:6px 0;color:#e2e8f0;">${userContext.rollNumber || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#94a3b8;">Registered:</td>
                <td style="padding:6px 0;color:#e2e8f0;">${regTime} IST</td>
              </tr>
            </table>
          </div>
          <div style="text-align:center;padding:12px 0 6px 0;">
            <p style="color:#cbd5e1;font-size:13px;margin:0 0 16px 0;">
              This user cannot access hardware inventory or checkout items until approved in the Admin Portal.
            </p>
            <a href="https://cicr-inventory.vercel.app/" style="display:inline-block;background:linear-gradient(135deg,#00f0ff,#a855f7);color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 28px;border-radius:6px;font-size:14px;box-shadow:0 4px 14px rgba(0,240,255,0.3);">
              Open Admin Portal to Review
            </a>
          </div>
          <div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:28px;padding-top:16px;text-align:center;">
            <p style="color:#64748b;font-size:11px;margin:0;">
              CICR Robotics Society &bull; Jaypee Institute of Information Technology, Sector 128
            </p>
          </div>
        </div>
      `,
    };

    if (!process.env.SMTP_USER) {
      console.log(`[MOCK EMAIL SERVICE] Admin registration alert sent to ${adminEmails.join(', ')} for ${userContext.userName} (${userContext.userEmail})`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('admin-registration-alert', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Admin Registration Alert email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send admin registration alert: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// USER APPROVAL CONFIRMATION EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export const sendUserApprovalSuccessEmail = async (
  recipientEmail: string,
  recipientName: string
) => {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || `"${SENDER_NAME}" <${process.env.SMTP_USER || DEFAULT_SENDER_EMAIL}>`,
      replyTo: process.env.SMTP_USER || DEFAULT_SENDER_EMAIL,
      to: recipientEmail,
      subject: `[CICR Inventory] 🎉 Access Approved! Welcome to CICR Portal`,
      messageId: generateMessageId(),
      headers: buildHeaders('user-approval-success', 'normal'),
      priority: 'normal' as const,
      text: [
        `Hello ${recipientName},`,
        ``,
        `Great news! Your account registration for the CICR Robotics Inventory Portal has been APPROVED by Master Admin Vardaan Saxena.`,
        ``,
        `You now have full access to:`,
        `- Browse available microcontrollers, sensors, motors, and robotics equipment.`,
        `- Borrow hardware components for your robotics projects and hackathons.`,
        `- Track your loans, due dates, and return statuses.`,
        ``,
        `Log in now at: https://cicr-inventory.vercel.app/`,
        ``,
        `Best regards,`,
        `CICR Team`
      ].join('\n'),
      html: `
        <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#0d0f17;color:#f3f4f6;padding:32px 20px;border-radius:12px;max-width:580px;margin:0 auto;border:1px solid rgba(16,185,129,0.3);">
          <div style="text-align:center;margin-bottom:24px;">
            <h2 style="color:#10b981;margin:0 0 6px 0;font-size:24px;">🎉 Account Approved!</h2>
            <p style="color:#94a3b8;font-size:13px;margin:0;">Welcome to CICR Hardware & Robotics Vault</p>
          </div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:20px;margin-bottom:24px;">
            <p style="color:#ffffff;font-size:15px;margin:0 0 12px 0;">Hello <strong>${recipientName}</strong>,</p>
            <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0 0 16px 0;">
              Your account request has been verified and <strong style="color:#10b981;">APPROVED</strong> by the CICR Admin Team. You can now access the portal and issue hardware components for your robotics projects.
            </p>
            <div style="background:rgba(16,185,129,0.08);border-left:4px solid #10b981;padding:12px;border-radius:4px;font-size:13px;color:#e2e8f0;">
              ✅ <strong>Hardware Access Granted:</strong> Microcontrollers, sensors, actuators, and power modules are now available for borrowing.
            </div>
          </div>
          <div style="text-align:center;padding:8px 0;">
            <a href="https://cicr-inventory.vercel.app/" style="display:inline-block;background:linear-gradient(135deg,#10b981,#00f0ff);color:#0d0f17;text-decoration:none;font-weight:bold;padding:12px 30px;border-radius:6px;font-size:14px;box-shadow:0 4px 14px rgba(16,185,129,0.3);">
              Log In to CICR Portal
            </a>
          </div>
          <div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:28px;padding-top:16px;text-align:center;">
            <p style="color:#64748b;font-size:11px;margin:0;">
              CICR Robotics Society &bull; Jaypee Institute of Information Technology, Sector 128
            </p>
          </div>
        </div>
      `,
    };

    if (!process.env.SMTP_USER) {
      console.log(`[MOCK EMAIL SERVICE] User approval email dispatched to ${recipientEmail} for ${recipientName}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('user-approval-success', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('User Approval email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send user approval email to ${recipientEmail}: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// USER REJECTION NOTIFICATION EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export const sendUserRejectionNotificationEmail = async (
  recipientEmail: string,
  recipientName: string
) => {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || `"${SENDER_NAME}" <${process.env.SMTP_USER || DEFAULT_SENDER_EMAIL}>`,
      replyTo: process.env.SMTP_USER || DEFAULT_SENDER_EMAIL,
      to: recipientEmail,
      subject: `[CICR Inventory] Registration Status Update`,
      messageId: generateMessageId(),
      headers: buildHeaders('user-rejection', 'normal'),
      priority: 'normal' as const,
      text: [
        `Hello ${recipientName},`,
        ``,
        `Your account registration request for the CICR Robotics Inventory Portal was reviewed by the Admin team and could not be approved at this time.`,
        ``,
        `If you believe this was done in error or you need access for an active college robotics project, please contact the CICR Admin directly at vardaansaxena096@gmail.com.`,
        ``,
        `Regards,`,
        `CICR Management Team`
      ].join('\n'),
      html: `
        <div style="font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#0d0f17;color:#f3f4f6;padding:32px 20px;border-radius:12px;max-width:580px;margin:0 auto;border:1px solid rgba(239,68,68,0.3);">
          <div style="text-align:center;margin-bottom:24px;">
            <h2 style="color:#ef4444;margin:0 0 6px 0;font-size:22px;">Registration Status Update</h2>
            <p style="color:#94a3b8;font-size:13px;margin:0;">CICR Robotics Inventory Portal</p>
          </div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:20px;margin-bottom:20px;">
            <p style="color:#ffffff;font-size:15px;margin:0 0 12px 0;">Hello <strong>${recipientName}</strong>,</p>
            <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0 0 14px 0;">
              Your account access request was reviewed by the CICR Admin and could not be approved at this time.
            </p>
            <p style="color:#94a3b8;font-size:13px;margin:0;">
              If you require access for an active JIIT-128 robotics project or competition, please reach out directly to Master Admin Vardaan at <a href="mailto:vardaansaxena096@gmail.com" style="color:#00f0ff;">vardaansaxena096@gmail.com</a>.
            </p>
          </div>
          <div style="border-top:1px solid rgba(255,255,255,0.08);margin-top:24px;padding-top:16px;text-align:center;">
            <p style="color:#64748b;font-size:11px;margin:0;">
              CICR Robotics Society &bull; Jaypee Institute of Information Technology, Sector 128
            </p>
          </div>
        </div>
      `,
    };

    if (!process.env.SMTP_USER) {
      console.log(`[MOCK EMAIL SERVICE] User rejection email dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('user-rejection', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('User Rejection email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send user rejection email to ${recipientEmail}: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

