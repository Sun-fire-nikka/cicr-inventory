import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { enqueueEmail } from '../config/emailQueue';

dotenv.config();

// Verified sender + default admin recipients
export const SENDER_NAME = 'CICR Inventory';
export const DEFAULT_TEST_RECIPIENT_EMAIL = 'cicrinventory@gmail.com';
export const DEFAULT_SENDER_EMAIL = 'cicrinventory@gmail.com';
export const NO_REPLY_HEADER = '"CICR Inventory (No-Reply)" <noreply.cicrinventory@gmail.com>';
export const SUPER_ADMIN_EMAILS = [
  'vardaansaxena096@gmail.com',
  'cicrinventory@gmail.com'
];


export const getFromAddress = () => {
  const envFrom = process.env.SMTP_FROM;
  if (envFrom && !envFrom.toLowerCase().includes('kushagra')) {
    return envFrom;
  }
  return `"${SENDER_NAME}" <cicrinventory@gmail.com>`;
};

export const getReplyToAddress = () => {
  const envReply = process.env.SMTP_REPLY_TO;
  if (envReply && !envReply.toLowerCase().includes('kushagra')) {
    return envReply;
  }
  return NO_REPLY_HEADER;
};

export const DEFAULT_SMTP_USER = process.env.SMTP_USER || 'cicrinventory@gmail.com';
export const DEFAULT_SMTP_PASS = process.env.SMTP_PASS || '';

export const getSmtpUser = (): string => {
  const envUser = process.env.SMTP_USER;
  if (envUser && !envUser.toLowerCase().includes('kushagra')) {
    return envUser;
  }
  return DEFAULT_SMTP_USER;
};

export const getSmtpPass = (): string => {
  return process.env.SMTP_PASS || '';
};

export const isSmtpConfigured = (): boolean => Boolean(getSmtpUser() && getSmtpPass());

// Configure transport using environment variables or verified credentials
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  auth: {
    user: getSmtpUser(),
    pass: getSmtpPass(),
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

// Dynamic Message-ID generation per RFC 2822 §3.6.4
const generateMessageId = (): string => {
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const idRight = smtpHost.replace(/^smtp\./i, '').trim().toLowerCase() || 'gmail.com';
  const idLeft = `${Date.now()}.${crypto.randomBytes(16).toString('hex')}`;
  return `<${idLeft}@${idRight}>`;
};

// Shared delivery headers for no-reply authentic system appearance
const buildHeaders = (kind: string, priority: 'high' | 'normal' = 'normal') => ({
  'X-CICR-Mailer': 'CICR-Inventory/v2.0-Core',
  'X-Mailer-Type': kind,
  'X-Priority': priority === 'high' ? '1 (Highest)' : '3 (Normal)',
  'Importance': priority === 'high' ? 'High' : 'Normal',
  'X-Auto-Response-Suppress': 'All',
  'Auto-Submitted': 'auto-generated',
  'List-Unsubscribe': '<mailto:noreply.cicrinventory@gmail.com?subject=unsubscribe>',
});

const logDelivery = (kind: string, info: any): void => {
  console.log(
    `[EMAIL SERVICE] ${kind} accepted by SMTP | messageId=${info?.messageId} | ` +
    `response="${info?.response}" | accepted=${JSON.stringify(info?.accepted || [])} | ` +
    `rejected=${JSON.stringify(info?.rejected || [])}`
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// AESTHETIC CYBER DARK EMAIL TEMPLATE ENGINE (ZERO EMOJIS)
// ──────────────────────────────────────────────────────────────────────────────

interface CyberEmailOptions {
  badgeText: string;
  badgeType?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  title: string;
  subtitle?: string;
  contentHtml: string;
  actionButton?: {
    text: string;
    url: string;
  };
}

const renderCyberEmail = (options: CyberEmailOptions): string => {
  const badgeColors: Record<string, { bg: string; text: string; border: string }> = {
    primary: { bg: 'rgba(0, 240, 255, 0.08)', text: '#00f0ff', border: 'rgba(0, 240, 255, 0.25)' },
    success: { bg: 'rgba(57, 255, 20, 0.08)', text: '#39ff14', border: 'rgba(57, 255, 20, 0.25)' },
    warning: { bg: 'rgba(250, 204, 21, 0.08)', text: '#facc15', border: 'rgba(250, 204, 21, 0.25)' },
    danger: { bg: 'rgba(239, 68, 68, 0.08)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.25)' },
    info: { bg: 'rgba(168, 85, 247, 0.08)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.25)' }
  };

  const badge = badgeColors[options.badgeType || 'primary'];
  const btnHtml = options.actionButton
    ? `
      <div style="text-align: center; margin: 28px 0 6px 0;">
        <a href="${options.actionButton.url}" style="display: inline-block; background: #00f0ff; color: #080b11; text-decoration: none; font-weight: 700; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; padding: 12px 28px; border-radius: 4px; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;">
          ${options.actionButton.text}
        </a>
      </div>
    `
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#07090e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;-webkit-font-smoothing:antialiased;">
      <div style="background-color:#07090e;padding:36px 12px;">
        <div style="max-width:560px;margin:0 auto;background:#0d111a;border:1px solid #1e293b;border-radius:6px;overflow:hidden;">
          
          <!-- System Header -->
          <div style="padding:22px 28px;border-bottom:1px solid #1e293b;background:#0f1422;">
            <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:15px;font-weight:700;color:#f8fafc;letter-spacing:1.5px;">
              CICR <span style="color:#00f0ff;">//</span> INVENTORY
            </div>
            <div style="font-size:11px;color:#64748b;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;letter-spacing:0.5px;margin-top:2px;">
              CENTRE FOR INNOVATION, CONTROL & ROBOTICS
            </div>
          </div>

          <!-- Body Content -->
          <div style="padding:28px;">
            
            <!-- Category Badge -->
            <div style="margin-bottom:16px;">
              <span style="display:inline-block;padding:4px 10px;font-size:10px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-radius:3px;background:${badge.bg};color:${badge.text};border:1px solid ${badge.border};">
                ${options.badgeText}
              </span>
            </div>

            <!-- Title -->
            <h1 style="margin:0 0 8px 0;font-size:19px;font-weight:600;color:#ffffff;line-height:1.3;">
              ${options.title}
            </h1>
            ${options.subtitle ? `<p style="margin:0 0 20px 0;font-size:13px;color:#94a3b8;line-height:1.5;">${options.subtitle}</p>` : '<div style="margin-bottom:18px;"></div>'}

            <!-- Main Content -->
            ${options.contentHtml}

            <!-- Action Button -->
            ${btnHtml}

          </div>

          <!-- Authentic System Footer -->
          <div style="padding:18px 28px;background:#080b12;border-top:1px solid #1e293b;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:10px;color:#64748b;line-height:1.6;">
            <div style="color:#94a3b8;font-weight:600;margin-bottom:2px;letter-spacing:0.5px;">
              AUTOMATED TRANSMISSION // NO-REPLY
            </div>
            <div>
              Centre for Innovation, Control & Robotics (CICR) &bull; JIIT Sector 128
            </div>
            <div style="color:#475569;margin-top:4px;">
              This is an authenticated system transmission. Do not reply to this email address.
            </div>
          </div>

        </div>
      </div>
    </body>
    </html>
  `;
};

const buildHoldersTable = (holders: HolderSummary[]): string => {
  if (!holders.length) {
    return '<p style="color:#64748b;font-size:12px;margin:8px 0 0 0;font-family:\'SFMono-Regular\',Consolas,monospace;">Active holders: None (Sole Holder)</p>';
  }
  const rows = holders
    .map((h) => {
      const who = `${h.borrower_name}${h.roll_number ? ` (${h.roll_number})` : ''}`;
      const when = h.borrowed_at ? new Date(h.borrowed_at).toLocaleDateString('en-GB') : 'N/A';
      return `
        <tr>
          <td style="padding:8px 12px;border:1px solid #1e293b;color:#e2e8f0;">${who}</td>
          <td style="padding:8px 12px;border:1px solid #1e293b;color:#00f0ff;text-align:center;font-family:'SFMono-Regular',Consolas,monospace;">${h.quantity}</td>
          <td style="padding:8px 12px;border:1px solid #1e293b;color:#94a3b8;font-family:'SFMono-Regular',Consolas,monospace;">${when}</td>
        </tr>
      `;
    })
    .join('');
  return `
    <div style="margin-top:16px;">
      <div style="font-family:'SFMono-Regular',Consolas,monospace;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Current Item Holders</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;background:#090c13;">
        <thead>
          <tr style="background:#0f1422;">
            <th style="padding:8px 12px;border:1px solid #1e293b;text-align:left;color:#94a3b8;font-weight:600;">Borrower</th>
            <th style="padding:8px 12px;border:1px solid #1e293b;text-align:center;color:#94a3b8;font-weight:600;">Units</th>
            <th style="padding:8px 12px;border:1px solid #1e293b;text-align:left;color:#94a3b8;font-weight:600;">Issue Date</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`;
};

// ──────────────────────────────────────────────────────────────────────────────
// 1. BORROW CONFIRMATION EMAIL (STUDENT)
// ──────────────────────────────────────────────────────────────────────────────

export const sendBorrowConfirmation = async (
  recipientEmail: string,
  borrowerName: string,
  context: BorrowEmailContext
) => {
  try {
    const formattedDueDate = formatDueDate(context.dueDate);
    const holdersTable = buildHoldersTable(context.holders);
    const categoryLine = context.category ? ` [${context.category}]` : '';

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:130px;font-family:'SFMono-Regular',Consolas,monospace;">ITEM:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.itemName}${categoryLine}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">QUANTITY:</td>
            <td style="padding:6px 0;color:#00f0ff;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${context.quantity} unit(s)</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">DUE DATE:</td>
            <td style="padding:6px 0;color:#facc15;font-weight:600;">${formattedDueDate} (${context.durationDays} days)</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">LAB STOCK LEFT:</td>
            <td style="padding:6px 0;color:#39ff14;font-family:'SFMono-Regular',Consolas,monospace;">${context.remainingStock} units</td>
          </tr>
        </table>
      </div>
      ${holdersTable}
      <div style="background:rgba(250,204,21,0.05);border-left:3px solid #facc15;padding:12px;border-radius:2px;font-size:12px;color:#cbd5e1;margin-top:18px;line-height:1.5;">
        <strong style="color:#facc15;">Return Policy:</strong> Please return all components on or before <strong>${formattedDueDate}</strong> to maintain lab eligibility.
      </div>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      cc: SUPER_ADMIN_EMAILS.join(', '),
      subject: `[CICR Inventory] Hardware Issue Confirmation: ${context.itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('borrow-confirmation'),
      priority: 'normal' as const,
      text: [
        `CICR INVENTORY // HARDWARE ISSUE CONFIRMATION`,
        `================================================`,
        `Hello ${borrowerName},`,
        ``,
        `You have checked out ${context.quantity} unit(s) of ${context.itemName}${categoryLine}.`,
        ``,
        `Due Date: ${formattedDueDate} (${context.durationDays} day(s))`,
        `Remaining Available Stock: ${context.remainingStock}`,
        ``,
        `Return Policy: Please return all components on or before the due date.`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'TRANSACTION // HARDWARE ISSUED',
        badgeType: 'primary',
        title: `Hardware Issued: ${context.itemName}`,
        subtitle: `Hello ${borrowerName}, your component checkout request has been registered.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Borrow confirmation dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('borrow-confirmation', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Borrow confirmation email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send borrow email to ${recipientEmail}: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 2. ADMIN BORROW APPROVAL OTP EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export const sendOtpEmail = async (
  adminEmail: string,
  adminName: string,
  studentName: string,
  otp: string,
  itemName: string,
  durationDays: number
) => {
  try {
    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;font-family:'SFMono-Regular',Consolas,monospace;">REQUESTER:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${studentName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">ITEM:</td>
            <td style="padding:6px 0;color:#00f0ff;font-weight:600;">${itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">DURATION:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${durationDays} day(s)</td>
          </tr>
        </table>
      </div>
      <div style="text-align:center;margin:24px 0;">
        <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:28px;font-weight:700;letter-spacing:8px;color:#00f0ff;background:#030712;padding:16px 24px;border:1px solid #1e293b;border-radius:4px;display:inline-block;">
          ${otp}
        </div>
      </div>
      <p style="font-size:12px;color:#94a3b8;line-height:1.5;margin:0;text-align:center;">
        This single-use OTP expires in <strong>10 minutes</strong>. Provide this code to the student to authorize checkout.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: adminEmail,
      subject: `[CICR Inventory] Authorization OTP: ${otp}`,
      messageId: generateMessageId(),
      headers: buildHeaders('borrow-otp', 'high'),
      priority: 'high' as const,
      text: [
        `CICR INVENTORY // AUTHORIZATION OTP`,
        `================================================`,
        `Hello ${adminName},`,
        ``,
        `${studentName} has requested authorization to borrow: ${itemName} (${durationDays} days).`,
        ``,
        `APPROVAL OTP: ${otp}`,
        ``,
        `Valid for 10 minutes. Share only after verifying the request.`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'SECURITY // APPROVAL AUTHORIZATION',
        badgeType: 'warning',
        title: 'Borrow Approval Request',
        subtitle: `Hello ${adminName}, an issuance verification code has been generated.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] OTP dispatched to admin ${adminEmail}`);
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

// ──────────────────────────────────────────────────────────────────────────────
// 3. LOGIN OTP EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export const sendLoginOtpEmail = async (
  recipientEmail: string,
  recipientName: string,
  otp: string
) => {
  try {
    const contentHtml = `
      <div style="text-align:center;margin:24px 0;">
        <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:28px;font-weight:700;letter-spacing:8px;color:#00f0ff;background:#030712;padding:16px 24px;border:1px solid #1e293b;border-radius:4px;display:inline-block;">
          ${otp}
        </div>
      </div>
      <p style="font-size:12px;color:#94a3b8;line-height:1.5;margin:0;text-align:center;">
        This verification code is valid for <strong>5 minutes</strong>. If you did not initiate this login attempt, please disregard this transmission.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      subject: `[CICR Inventory] Login Verification: ${otp}`,
      messageId: generateMessageId(),
      headers: buildHeaders('login-otp', 'high'),
      priority: 'high' as const,
      text: [
        `CICR INVENTORY // PORTAL ACCESS VERIFICATION`,
        `================================================`,
        `Hello ${recipientName},`,
        ``,
        `Your login verification OTP is: ${otp}`,
        ``,
        `Valid for 5 minutes. Do not share this code.`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'SECURITY // AUTHENTICATION',
        badgeType: 'primary',
        title: 'Portal Access Verification',
        subtitle: `Hello ${recipientName}, use the single-use code below to complete your sign-in.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Login OTP dispatched to ${recipientEmail}`);
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
// 4. RETURN CONFIRMATION EMAIL (STUDENT)
// ──────────────────────────────────────────────────────────────────────────────

export const sendReturnConfirmation = async (
  recipientEmail: string,
  borrowerName: string,
  itemName: string,
  returnedAt: Date
) => {
  try {
    const formattedReturnedAt = returnedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;font-family:'SFMono-Regular',Consolas,monospace;">ITEM:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">RESTOCKED AT:</td>
            <td style="padding:6px 0;color:#39ff14;font-family:'SFMono-Regular',Consolas,monospace;">${formattedReturnedAt} IST</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">STATUS:</td>
            <td style="padding:6px 0;color:#39ff14;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">VERIFIED & CLOSED</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        Thank you for returning the hardware on schedule. Your account loan record has been updated and cleared.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      cc: SUPER_ADMIN_EMAILS.join(', '),
      subject: `[CICR Inventory] Return Receipt: ${itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('return-confirmation'),
      priority: 'normal' as const,
      text: [
        `CICR INVENTORY // RETURN RECEIPT`,
        `================================================`,
        `Hello ${borrowerName},`,
        ``,
        `Your borrowed item "${itemName}" has been successfully returned and restocked in the lab.`,
        ``,
        `Timestamp: ${formattedReturnedAt} IST`,
        `Status: VERIFIED & CLOSED`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'TRANSACTION // RESTOCKED & CLEARED',
        badgeType: 'success',
        title: `Hardware Returned: ${itemName}`,
        subtitle: `Hello ${borrowerName}, your hardware return has been logged successfully.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Return email dispatched to ${recipientEmail}`);
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
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 5. ADMIN REGISTRATION REQUEST ALERT
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

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;font-family:'SFMono-Regular',Consolas,monospace;">NAME:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${userContext.userName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">EMAIL:</td>
            <td style="padding:6px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;">${userContext.userEmail}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">ROLL NUMBER:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${userContext.rollNumber || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">REGISTERED:</td>
            <td style="padding:6px 0;color:#94a3b8;font-family:'SFMono-Regular',Consolas,monospace;">${regTime} IST</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        This account is pending review in the Admin Portal and cannot checkout hardware until approved.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: adminEmails.join(', '),
      subject: `[CICR Admin] Account Access Request: ${userContext.userName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('admin-registration-alert', 'high'),
      priority: 'high' as const,
      text: [
        `CICR ADMIN // NEW ACCOUNT REQUEST`,
        `================================================`,
        `Name: ${userContext.userName}`,
        `Email: ${userContext.userEmail}`,
        `Roll Number: ${userContext.rollNumber || 'Not Specified'}`,
        `Timestamp: ${regTime} IST`,
        `Status: PENDING ADMIN REVIEW`,
        ``,
        `Please log in to the CICR Admin Portal to approve or reject this request.`,
        ``,
        `Regards,`,
        `CICR Automated Security Service`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'QUEUE // APPROVAL PENDING',
        badgeType: 'warning',
        title: 'New Member Registration Request',
        subtitle: 'A student has registered on the portal and requires access approval.',
        contentHtml,
        actionButton: {
          text: 'Review in Admin Portal',
          url: 'https://cicr-inventory.vercel.app/'
        }
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Admin registration alert sent to ${adminEmails.join(', ')}`);
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
// 6. USER APPROVAL CONFIRMATION EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export const sendUserApprovalSuccessEmail = async (
  recipientEmail: string,
  recipientName: string
) => {
  try {
    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <p style="color:#ffffff;font-size:14px;line-height:1.6;margin:0 0 12px 0;">
          Your account request has been verified and <strong style="color:#39ff14;">APPROVED</strong> by the CICR Admin Team.
        </p>
        <div style="font-size:12px;color:#94a3b8;font-family:'SFMono-Regular',Consolas,monospace;line-height:1.6;">
          &bull; Full access to lab hardware catalog<br/>
          &bull; Borrow microcontrollers, sensors, and robotics modules<br/>
          &bull; Live loan tracking and return scheduling
        </div>
      </div>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      subject: `[CICR Inventory] Access Approved: Welcome to CICR Portal`,
      messageId: generateMessageId(),
      headers: buildHeaders('user-approval-success', 'normal'),
      priority: 'normal' as const,
      text: [
        `CICR INVENTORY // ACCESS APPROVED`,
        `================================================`,
        `Hello ${recipientName},`,
        ``,
        `Your account registration for the CICR Robotics Inventory Portal has been APPROVED by the Admin team.`,
        ``,
        `Log in at: https://cicr-inventory.vercel.app/`,
        ``,
        `Best regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'STATUS // ACCESS GRANTED',
        badgeType: 'success',
        title: 'Account Approved',
        subtitle: `Hello ${recipientName}, you now have full access to the CICR Hardware Vault.`,
        contentHtml,
        actionButton: {
          text: 'Log In to Portal',
          url: 'https://cicr-inventory.vercel.app/'
        }
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] User approval email dispatched to ${recipientEmail}`);
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
// 7. USER REJECTION NOTIFICATION EMAIL
// ──────────────────────────────────────────────────────────────────────────────

export const sendUserRejectionNotificationEmail = async (
  recipientEmail: string,
  recipientName: string
) => {
  try {
    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <p style="color:#e2e8f0;font-size:13px;line-height:1.6;margin:0;">
          Your account access request for the CICR Robotics Inventory Portal was reviewed by the Admin team and could not be approved at this time.
        </p>
      </div>
      <p style="font-size:12px;color:#64748b;line-height:1.6;margin:0;">
        If you require access for an active JIIT-128 robotics project or competition, please reach out directly to the CICR Admin at <span style="color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;">cicrinventory@gmail.com</span>.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      subject: `[CICR Inventory] Registration Status Update`,
      messageId: generateMessageId(),
      headers: buildHeaders('user-rejection', 'normal'),
      priority: 'normal' as const,
      text: [
        `CICR INVENTORY // REGISTRATION STATUS UPDATE`,
        `================================================`,
        `Hello ${recipientName},`,
        ``,
        `Your account registration request for the CICR Robotics Inventory Portal could not be approved at this time.`,
        ``,
        `Contact Admin: cicrinventory@gmail.com`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'STATUS // REQUEST NOT APPROVED',
        badgeType: 'danger',
        title: 'Registration Status Update',
        subtitle: `Hello ${recipientName}, an update regarding your access request.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
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

// ──────────────────────────────────────────────────────────────────────────────
// 8. REAL-TIME ADMIN AUDIT & TRANSACTION NOTIFICATIONS
// ──────────────────────────────────────────────────────────────────────────────

export interface AdminBorrowAlertContext {
  borrowerName: string;
  borrowerEmail: string;
  rollNumber?: string | null;
  itemName: string;
  category?: string | null;
  quantity: number;
  remainingStock: number;
  purpose: string;
  durationDays: number;
  dueDate: Date | string;
}

export const sendAdminBorrowNotification = async (
  adminEmails: string[],
  context: AdminBorrowAlertContext
) => {
  try {
    if (!adminEmails || !adminEmails.length) return { success: false, message: 'No admin recipients' };
    const formattedDueDate = formatDueDate(context.dueDate);
    const categoryLine = context.category ? ` [${context.category}]` : '';

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:130px;font-family:'SFMono-Regular',Consolas,monospace;">BORROWER:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.borrowerName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">EMAIL:</td>
            <td style="padding:6px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;">${context.borrowerEmail}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">ROLL NUMBER:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${context.rollNumber || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">PURPOSE:</td>
            <td style="padding:6px 0;color:#cbd5e1;">${context.purpose}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">RETURN DUE:</td>
            <td style="padding:6px 0;color:#facc15;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${formattedDueDate} (${context.durationDays} days)</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">REMAINING STOCK:</td>
            <td style="padding:6px 0;color:#39ff14;font-family:'SFMono-Regular',Consolas,monospace;">${context.remainingStock} units</td>
          </tr>
        </table>
      </div>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: adminEmails.join(', '),
      subject: `[CICR Admin Alert] Hardware Issued: ${context.itemName} (${context.quantity}x)`,
      messageId: generateMessageId(),
      headers: buildHeaders('admin-borrow-alert', 'high'),
      priority: 'high' as const,
      text: [
        `CICR ADMIN // LIVE HARDWARE ISSUANCE TELEMETRY`,
        `================================================`,
        `Item: ${context.itemName}${categoryLine}`,
        `Quantity Borrowed: ${context.quantity}`,
        `Remaining Stock: ${context.remainingStock}`,
        `Borrower: ${context.borrowerName} (${context.borrowerEmail})`,
        `Roll Number: ${context.rollNumber || 'N/A'}`,
        `Purpose: ${context.purpose}`,
        `Due Date: ${formattedDueDate} (${context.durationDays} days)`,
        ``,
        `Regards,`,
        `CICR Automated Inventory System`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'TELEMETRY // HARDWARE ISSUED',
        badgeType: 'primary',
        title: `${context.quantity}x ${context.itemName}${categoryLine}`,
        subtitle: `Hardware component issued to ${context.borrowerName}.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Admin borrow notification sent to ${adminEmails.join(', ')}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('admin-borrow-alert', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Admin borrow notification', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send admin borrow notification: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

export interface AdminReturnAlertContext {
  borrowerName: string;
  borrowerEmail?: string;
  itemName: string;
  quantity?: number;
  returnedAt: Date | string;
}

export const sendAdminReturnNotification = async (
  adminEmails: string[],
  context: AdminReturnAlertContext
) => {
  try {
    if (!adminEmails || !adminEmails.length) return { success: false, message: 'No admin recipients' };
    const retTime = new Date(context.returnedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;font-family:'SFMono-Regular',Consolas,monospace;">RETURNED BY:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.borrowerName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">EMAIL:</td>
            <td style="padding:6px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;">${context.borrowerEmail || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">TIMESTAMP:</td>
            <td style="padding:6px 0;color:#39ff14;font-family:'SFMono-Regular',Consolas,monospace;">${retTime} IST</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">STATUS:</td>
            <td style="padding:6px 0;color:#39ff14;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">RESTOCKED & VERIFIED</td>
          </tr>
        </table>
      </div>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: adminEmails.join(', '),
      subject: `[CICR Admin Alert] Item Restocked: ${context.itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('admin-return-alert', 'normal'),
      priority: 'normal' as const,
      text: [
        `CICR ADMIN // HARDWARE RETURN TELEMETRY`,
        `================================================`,
        `Item: ${context.itemName}`,
        `Borrower: ${context.borrowerName} (${context.borrowerEmail || 'N/A'})`,
        `Restocked At: ${retTime} IST`,
        `Status: RESTOCKED & VERIFIED`,
        ``,
        `Regards,`,
        `CICR Automated Inventory System`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'TELEMETRY // ITEM RESTOCKED',
        badgeType: 'success',
        title: `Component Restocked: ${context.itemName}`,
        subtitle: `Hardware returned by ${context.borrowerName}.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Admin return notification sent to ${adminEmails.join(', ')}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('admin-return-alert', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Admin return notification', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send admin return notification: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

export const sendAdminUserStatusAlert = async (
  adminEmails: string[],
  userName: string,
  userEmail: string,
  status: 'APPROVED' | 'REJECTED',
  performedBy: string
) => {
  try {
    if (!adminEmails || !adminEmails.length) return { success: false, message: 'No admin recipients' };
    const isApproved = status === 'APPROVED';
    const nowTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;font-family:'SFMono-Regular',Consolas,monospace;">USER:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${userName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">EMAIL:</td>
            <td style="padding:6px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;">${userEmail}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">ACTION:</td>
            <td style="padding:6px 0;color:${isApproved ? '#39ff14' : '#ef4444'};font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${status}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">PROCESSED BY:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-weight:600;">${performedBy}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">TIMESTAMP:</td>
            <td style="padding:6px 0;color:#94a3b8;font-family:'SFMono-Regular',Consolas,monospace;">${nowTime} IST</td>
          </tr>
        </table>
      </div>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: adminEmails.join(', '),
      subject: `[CICR Admin Log] Member ${status}: ${userName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('admin-user-status-log', 'normal'),
      priority: 'normal' as const,
      text: [
        `CICR ADMIN // ACCESS AUDIT LOG`,
        `================================================`,
        `User: ${userName} (${userEmail})`,
        `Action: ${status}`,
        `Processed By: ${performedBy}`,
        `Timestamp: ${nowTime} IST`,
        ``,
        `Regards,`,
        `CICR Automated Inventory System`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: `AUDIT // MEMBER ${status}`,
        badgeType: isApproved ? 'success' : 'danger',
        title: `Member Request ${status}`,
        subtitle: `Access permission processed by ${performedBy}.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Admin user status alert sent to ${adminEmails.join(', ')}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('admin-user-status-log', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Admin user status alert', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send admin user status alert: ${formatSmtpError(error)}`);
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 9. UPCOMING & DUE REMINDERS
// ──────────────────────────────────────────────────────────────────────────────

export const sendUpcomingReminder = async (
  recipientEmail: string,
  borrowerName: string,
  itemName: string,
  dueDate: Date | string
) => {
  try {
    const formattedDueDate = formatDueDate(dueDate);
    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;font-family:'SFMono-Regular',Consolas,monospace;">ITEM:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">DUE DATE:</td>
            <td style="padding:6px 0;color:#facc15;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">TOMORROW (${formattedDueDate})</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        Please return the item to the CICR lab tomorrow on or before the due date to avoid overdue penalties.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      subject: `[CICR Inventory] Return Due Tomorrow: ${itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('upcoming-reminder'),
      priority: 'normal' as const,
      text: [
        `CICR INVENTORY // RETURN REMINDER`,
        `================================================`,
        `Hello ${borrowerName},`,
        ``,
        `Your borrowed item "${itemName}" is due TOMORROW (${formattedDueDate}).`,
        ``,
        `Please return it to the lab on or before the due date.`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'SCHEDULE // DUE TOMORROW',
        badgeType: 'warning',
        title: `Return Deadline Tomorrow: ${itemName}`,
        subtitle: `Hello ${borrowerName}, this is an automated schedule reminder.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Upcoming reminder dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('upcoming-reminder', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Upcoming reminder', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send upcoming reminder: ${formatSmtpError(error)}`);
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
      ? `This return is ${daysOverdue} day(s) OVERDUE.`
      : 'This item is due TODAY.';

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;font-family:'SFMono-Regular',Consolas,monospace;">ITEM:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">ORIGINAL DUE:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${formattedDueDate}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">OVERDUE STATUS:</td>
            <td style="padding:6px 0;color:#ef4444;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${daysOverdue > 0 ? `${daysOverdue} DAYS OVERDUE` : 'DUE TODAY'}</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        Please return the component to the lab immediately to prevent account suspension.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      subject: daysOverdue > 0
        ? `[CICR Inventory] OVERDUE Notice: ${itemName}`
        : `[CICR Inventory] Return Due Today: ${itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('return-reminder', 'high'),
      priority: 'high' as const,
      text: [
        `CICR INVENTORY // OVERDUE RETURN NOTICE`,
        `================================================`,
        `Hello ${borrowerName},`,
        ``,
        `${overdueNotice}`,
        `Item: ${itemName}`,
        `Due Date: ${formattedDueDate}`,
        ``,
        `Please return it to the lab at your earliest convenience.`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: daysOverdue > 0 ? 'ALERT // OVERDUE NOTICE' : 'SCHEDULE // DUE TODAY',
        badgeType: 'danger',
        title: daysOverdue > 0 ? `Overdue Return Notice: ${itemName}` : `Return Due Today: ${itemName}`,
        subtitle: `Hello ${borrowerName}, urgent return notice for checked-out hardware.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Return reminder dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('return-reminder', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Return reminder', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send return reminder: ${formatSmtpError(error)}`);
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

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;font-family:'SFMono-Regular',Consolas,monospace;">ITEM:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${quantity}x ${itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">SCHEDULE:</td>
            <td style="padding:6px 0;color:${isOverdue ? '#ef4444' : '#facc15'};font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${dueWindowLabel.toUpperCase()}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">DUE DATE:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${formattedDueDate}</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        Please return the component to the CICR lab${isOverdue ? ' as soon as possible' : ' on or before the due date'}.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      subject: `[CICR Inventory] ${isOverdue ? 'OVERDUE' : 'Return Reminder'}: ${itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('due-reminder'),
      priority: isOverdue ? ('high' as const) : ('normal' as const),
      text: [
        `CICR INVENTORY // RETURN NOTICE`,
        `================================================`,
        `Hello ${borrowerName},`,
        ``,
        `${quantity}x ${itemName} is ${dueWindowLabel}.`,
        `Due Date: ${formattedDueDate}`,
        ``,
        `Please return it to the lab on or before the due date.`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: isOverdue ? 'ALERT // OVERDUE NOTICE' : 'SCHEDULE // RETURN REMINDER',
        badgeType: isOverdue ? 'danger' : 'warning',
        title: isOverdue ? `Overdue Return: ${itemName}` : `Return Reminder: ${itemName}`,
        subtitle: `Hello ${borrowerName}, please review your component return timeline.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Reminder dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send reminder:`, error.message);
    return { success: false, error: error.message };
  }
};

export interface HardwareRequestEmailContext {
  requestId: string;
  itemName: string;
  category?: string;
  quantity: number;
  borrowerName: string;
  borrowerEmail: string;
  rollNumber?: string | null;
  purpose: string;
  durationDays?: number;
  dueDate?: string;
  requestedAt?: string;
}

export const sendAdminHardwareRequestAlert = async (
  adminEmails: string | string[],
  context: HardwareRequestEmailContext
) => {
  try {
    const recipients = Array.isArray(adminEmails) ? adminEmails : [adminEmails];
    const requestedDateStr = context.requestedAt
      ? new Date(context.requestedAt).toLocaleString('en-GB')
      : new Date().toLocaleString('en-GB');

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:140px;font-family:'SFMono-Regular',Consolas,monospace;">REQUEST ID:</td>
            <td style="padding:6px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;font-weight:600;">#${context.requestId.slice(0, 8)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">COMPONENT:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.quantity}x ${context.itemName}</td>
          </tr>
          ${context.category ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">CATEGORY:</td>
            <td style="padding:6px 0;color:#94a3b8;">${context.category.toUpperCase()}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">REQUESTER:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.borrowerName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">EMAIL:</td>
            <td style="padding:6px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;">${context.borrowerEmail}</td>
          </tr>
          ${context.rollNumber ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">ROLL NUMBER:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${context.rollNumber}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">PURPOSE:</td>
            <td style="padding:6px 0;color:#e2e8f0;line-height:1.4;">${context.purpose}</td>
          </tr>
          ${context.dueDate ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">EST. DUE DATE:</td>
            <td style="padding:6px 0;color:#facc15;font-family:'SFMono-Regular',Consolas,monospace;">${context.dueDate}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">TIMESTAMP:</td>
            <td style="padding:6px 0;color:#94a3b8;font-family:'SFMono-Regular',Consolas,monospace;">${requestedDateStr}</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        This request is queued in the Admin Portal. Please log in to approve or decline this component issue.
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipients.join(', '),
      subject: `[CICR Inventory] Hardware Request: ${context.quantity}x ${context.itemName} (${context.borrowerName})`,
      messageId: generateMessageId(),
      headers: buildHeaders('admin-hardware-request', 'high'),
      priority: 'high' as const,
      text: [
        `CICR INVENTORY // HARDWARE ISSUE REQUEST`,
        `================================================`,
        `A member has submitted an item issue request.`,
        ``,
        `Item: ${context.quantity}x ${context.itemName}`,
        `Requester: ${context.borrowerName} (${context.borrowerEmail})`,
        context.rollNumber ? `Roll Number: ${context.rollNumber}` : '',
        `Purpose: ${context.purpose}`,
        context.dueDate ? `Est. Due Date: ${context.dueDate}` : '',
        `Timestamp: ${requestedDateStr}`,
        ``,
        `Please log in to the CICR Admin Portal to review and approve/reject this request.`,
        ``,
        `CICR Inventory System Core`
      ].filter(Boolean).join('\n'),
      html: renderCyberEmail({
        badgeText: 'VAULT // HARDWARE REQUEST',
        badgeType: 'warning',
        title: `Hardware Issue Request: ${context.itemName}`,
        subtitle: `Action required: ${context.borrowerName} has requested ${context.quantity}x ${context.itemName}.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Admin hardware alert dispatched to ${recipients.join(', ')}`);
      return { success: true, mocked: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('admin-hardware-alert', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send admin hardware request alert:`, formatSmtpError(error));
    return { success: false, error: error.message };
  }
};

export const sendHardwareRequestStatusEmail = async (
  recipientEmail: string,
  borrowerName: string,
  itemName: string,
  quantity: number,
  status: 'APPROVED' | 'REJECTED',
  reviewedBy: string,
  reason?: string
) => {
  try {
    const isApproved = status === 'APPROVED';

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:130px;font-family:'SFMono-Regular',Consolas,monospace;">COMPONENT:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${quantity}x ${itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">STATUS:</td>
            <td style="padding:6px 0;color:${isApproved ? '#00f0ff' : '#ff007a'};font-weight:700;font-family:'SFMono-Regular',Consolas,monospace;">${status}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">REVIEWED BY:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${reviewedBy}</td>
          </tr>
          ${reason ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">NOTE:</td>
            <td style="padding:6px 0;color:#94a3b8;line-height:1.4;">${reason}</td>
          </tr>` : ''}
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        ${isApproved
          ? 'Your component issue request has been authorized. You may pick up the hardware from the CICR lab.'
          : 'Your component issue request was declined by the administrator. Contact lab management if you need clarification.'}
      </p>
    `;

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipientEmail,
      cc: SUPER_ADMIN_EMAILS.join(', '),
      subject: `[CICR Inventory] Request ${status}: ${quantity}x ${itemName}`,
      messageId: generateMessageId(),
      headers: buildHeaders('hardware-status-update'),
      priority: isApproved ? ('normal' as const) : ('high' as const),
      text: [
        `CICR INVENTORY // HARDWARE REQUEST UPDATE`,
        `================================================`,
        `Hello ${borrowerName},`,
        ``,
        `Your request for ${quantity}x ${itemName} has been ${status}.`,
        `Reviewed By: ${reviewedBy}`,
        reason ? `Note: ${reason}` : '',
        ``,
        isApproved
          ? `Your component issue has been authorized. Please collect your hardware from the lab.`
          : `Your request was declined by the lab administrator.`,
        ``,
        `Regards,`,
        `CICR Inventory Team`
      ].filter(Boolean).join('\n'),
      html: renderCyberEmail({
        badgeText: isApproved ? 'DECISION // REQUEST APPROVED' : 'DECISION // REQUEST DECLINED',
        badgeType: isApproved ? 'success' : 'danger',
        title: `Hardware Request ${isApproved ? 'Approved' : 'Declined'}: ${itemName}`,
        subtitle: `Hello ${borrowerName}, your hardware issue request status has been updated.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Hardware status email dispatched to ${recipientEmail}`);
      return { success: true, mocked: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('hardware-status-update', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send hardware status email:`, formatSmtpError(error));
    return { success: false, error: error.message };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 15. LOGIN SECURITY ALERT EMAIL (DISPATCHED ON USER/ADMIN LOGIN)
// ──────────────────────────────────────────────────────────────────────────────

export interface LoginSecurityAlertContext {
  userEmail: string;
  userName: string;
  role: string;
  ip?: string;
  userAgent?: string;
  loginTime?: Date | string;
}

export const sendLoginSecurityAlertEmail = async (
  context: LoginSecurityAlertContext
) => {
  try {
    const loginTimeStr = new Date(context.loginTime || new Date()).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:120px;font-family:'SFMono-Regular',Consolas,monospace;">USER:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.userName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">EMAIL:</td>
            <td style="padding:6px 0;color:#00f0ff;font-family:'SFMono-Regular',Consolas,monospace;">${context.userEmail}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">ROLE:</td>
            <td style="padding:6px 0;color:#ff007a;font-weight:700;font-family:'SFMono-Regular',Consolas,monospace;">${context.role}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">TIMESTAMP:</td>
            <td style="padding:6px 0;color:#39ff14;font-family:'SFMono-Regular',Consolas,monospace;">${loginTimeStr} IST</td>
          </tr>
          ${context.ip ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">IP ADDRESS:</td>
            <td style="padding:6px 0;color:#cbd5e1;font-family:'SFMono-Regular',Consolas,monospace;">${context.ip}</td>
          </tr>` : ''}
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        A new authenticated session was established on the CICR Inventory Hub. If this was not you or an authorized member, contact the lab administrator immediately.
      </p>
    `;

    const recipients = Array.from(new Set([context.userEmail, ...SUPER_ADMIN_EMAILS]));

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: recipients.join(', '),
      subject: `[CICR Security Alert] New Login: ${context.userName} (${context.userEmail})`,
      messageId: generateMessageId(),
      headers: buildHeaders('login-security-alert', 'normal'),
      priority: 'normal' as const,
      text: [
        `CICR SECURITY // NEW AUTHENTICATION EVENT`,
        `================================================`,
        `User: ${context.userName} (${context.userEmail})`,
        `Role: ${context.role}`,
        `Time: ${loginTimeStr} IST`,
        `IP: ${context.ip || 'Unknown'}`,
        ``,
        `A new session has been initialized.`,
        ``,
        `Regards,`,
        `CICR Security Monitor`
      ].join('\n'),
      html: renderCyberEmail({
        badgeText: 'SECURITY // AUTHENTICATED SESSION',
        badgeType: 'info',
        title: `Login Activity: ${context.userName}`,
        subtitle: `New authenticated session initialized for ${context.userEmail}.`,
        contentHtml
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Login alert dispatched to ${recipients.join(', ')}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('login-security-alert', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Login security alert email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send login alert:`, formatSmtpError(error));
    return { success: false, error: formatSmtpError(error) };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// 16. NEW ITEM CREATED TELEMETRY EMAIL (ADMIN CREATION EVENT)
// ──────────────────────────────────────────────────────────────────────────────

export interface ItemCreatedEmailContext {
  itemName: string;
  category: string;
  quantity: number;
  location: string;
  description?: string;
  tags?: string[];
  createdByAdminName: string;
  createdByAdminEmail: string;
  createdAt?: Date | string;
}

export const sendAdminItemCreatedNotification = async (
  context: ItemCreatedEmailContext
) => {
  try {
    const createdTimeStr = new Date(context.createdAt || new Date()).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const tagsHtml = (context.tags && context.tags.length)
      ? context.tags.map(t => `<span style="display:inline-block;padding:2px 8px;margin:2px;background:#0d1527;border:1px solid #00f0ff;border-radius:3px;color:#00f0ff;font-size:11px;font-family:'SFMono-Regular',Consolas,monospace;">#${t}</span>`).join(' ')
      : '<span style="color:#64748b;">None</span>';

    const contentHtml = `
      <div style="background:#090c13;border:1px solid #1e293b;border-radius:4px;padding:18px;margin-bottom:18px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:6px 0;color:#64748b;width:130px;font-family:'SFMono-Regular',Consolas,monospace;">ITEM NAME:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:700;font-size:14px;">${context.itemName}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">CATEGORY:</td>
            <td style="padding:6px 0;color:#00f0ff;font-weight:600;font-family:'SFMono-Regular',Consolas,monospace;">${context.category.toUpperCase()}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">INITIAL STOCK:</td>
            <td style="padding:6px 0;color:#39ff14;font-weight:700;font-family:'SFMono-Regular',Consolas,monospace;">${context.quantity} unit(s)</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">STORAGE LOCATION:</td>
            <td style="padding:6px 0;color:#e2e8f0;font-family:'SFMono-Regular',Consolas,monospace;">${context.location}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">REGISTERED BY:</td>
            <td style="padding:6px 0;color:#ffffff;font-weight:600;">${context.createdByAdminName} <span style="color:#00f0ff;font-size:12px;">(${context.createdByAdminEmail})</span></td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;">TIMESTAMP:</td>
            <td style="padding:6px 0;color:#facc15;font-family:'SFMono-Regular',Consolas,monospace;">${createdTimeStr} IST</td>
          </tr>
          ${context.description ? `
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;vertical-align:top;">SPECIFICATIONS:</td>
            <td style="padding:6px 0;color:#cbd5e1;line-height:1.4;">${context.description}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:6px 0;color:#64748b;font-family:'SFMono-Regular',Consolas,monospace;vertical-align:top;">TAGS:</td>
            <td style="padding:6px 0;">${tagsHtml}</td>
          </tr>
        </table>
      </div>
      <p style="font-size:13px;color:#94a3b8;line-height:1.5;margin:0;">
        This new hardware component has been vaulted into the live inventory database and is now discoverable by authorized laboratory students.
      </p>
    `;

    const adminRecipients = Array.from(new Set([context.createdByAdminEmail, ...SUPER_ADMIN_EMAILS]));

    const mailOptions = {
      from: getFromAddress(),
      replyTo: getReplyToAddress(),
      to: context.createdByAdminEmail,
      cc: SUPER_ADMIN_EMAILS.filter(e => e.toLowerCase() !== context.createdByAdminEmail.toLowerCase()).join(', '),
      subject: `[CICR Admin] New Hardware Component Added: ${context.itemName} (${context.quantity}x)`,
      messageId: generateMessageId(),
      headers: buildHeaders('item-created-telemetry', 'high'),
      priority: 'high' as const,
      text: [
        `CICR ADMIN // NEW HARDWARE COMPONENT VAULTED`,
        `================================================`,
        `Component: ${context.itemName} [${context.category.toUpperCase()}]`,
        `Quantity: ${context.quantity} unit(s)`,
        `Location: ${context.location}`,
        `Registered By: ${context.createdByAdminName} (${context.createdByAdminEmail})`,
        `Timestamp: ${createdTimeStr} IST`,
        context.description ? `Specifications: ${context.description}` : '',
        ``,
        `View live catalog: https://cicr-inventory.vercel.app/`,
        ``,
        `Regards,`,
        `CICR Automated Inventory Engine`
      ].filter(Boolean).join('\n'),
      html: renderCyberEmail({
        badgeText: 'VAULT // COMPONENT REGISTERED',
        badgeType: 'success',
        title: `Component Added: ${context.itemName}`,
        subtitle: `Registered into CICR Inventory by ${context.createdByAdminName}.`,
        contentHtml,
        actionButton: {
          text: 'View in Vault Catalog',
          url: 'https://cicr-inventory.vercel.app/'
        }
      })
    };

    if (!isSmtpConfigured()) {
      console.log(`[MOCK EMAIL SERVICE] Item creation alert dispatched to ${adminRecipients.join(', ')}`);
      return { success: true, mocked: true };
    }

    if (await enqueueEmail('item-created-telemetry', mailOptions)) {
      return { success: true, queued: true };
    }

    const info = await transporter.sendMail(mailOptions);
    logDelivery('Item created telemetry email', info);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send item creation email:`, formatSmtpError(error));
    return { success: false, error: formatSmtpError(error) };
  }
};



