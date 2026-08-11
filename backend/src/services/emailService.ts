import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

// Configure transport using environment variables or a fallback test account
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
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
      from: process.env.SMTP_FROM || `"CICR Lab Admin" <${process.env.SMTP_USER || 'no-reply@cicr.edu'}>`,
      to: recipientEmail,
      subject: `[CICR Inventory] Borrow Confirmation: ${context.itemName}`,
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

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] Borrow email sent successfully: ${info.messageId}`);
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
      from: process.env.SMTP_FROM || `"CICR Lab Admin" <${process.env.SMTP_USER || 'no-reply@cicr.edu'}>`,
      to: adminEmail,
      subject: `[CICR Inventory] Borrow Approval OTP: ${otp}`,
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

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] OTP email sent successfully: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
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
      from: process.env.SMTP_FROM || `"CICR Lab Admin" <${process.env.SMTP_USER || 'no-reply@cicr.edu'}>`,
      to: recipientEmail,
      subject: `[CICR Inventory] Return Due Tomorrow: ${itemName}`,
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

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] Upcoming-due reminder sent successfully: ${info.messageId}`);
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
      from: process.env.SMTP_FROM || `"CICR Lab Admin" <${process.env.SMTP_USER || 'no-reply@cicr.edu'}>`,
      to: recipientEmail,
      subject: daysOverdue > 0
        ? `[CICR Inventory] OVERDUE Return: ${itemName}`
        : `[CICR Inventory] Return Due Today: ${itemName}`,
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

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] Return reminder sent successfully: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send return reminder to ${recipientEmail}: ${formatSmtpError(error)}`);
    // Graceful failover so email failures don't crash the reminder job
    return { success: false, error: formatSmtpError(error) };
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
      from: process.env.SMTP_FROM || `"CICR Lab Admin" <${process.env.SMTP_USER || 'no-reply@cicr.edu'}>`,
      to: recipientEmail,
      subject: `[CICR Inventory] Return Confirmation: ${itemName}`,
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

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] Return email sent successfully: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send return email to ${recipientEmail}: ${formatSmtpError(error)}`);
    // Graceful failover so email failures don't crash the return HTTP response
    return { success: false, error: formatSmtpError(error) };
  }
};
