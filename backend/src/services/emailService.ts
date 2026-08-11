import nodemailer from 'nodemailer';

// Configure transport using environment variables or a fallback test account
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: Number(process.env.SMTP_PORT) || 587,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

const formatDueDate = (dueDate: Date | string): string => {
  const d = new Date(dueDate);
  return isNaN(d.getTime()) ? String(dueDate) : d.toISOString();
};

export const sendBorrowConfirmation = async (
  recipientEmail: string,
  borrowerName: string,
  itemName: string,
  quantity: number,
  durationDays: number,
  dueDate: Date | string
) => {
  try {
    const formattedDueDate = formatDueDate(dueDate);
    const mailOptions = {
      from: process.env.SMTP_FROM || '"CICR Lab Admin" <no-reply@cicr.edu>',
      to: recipientEmail,
      subject: `[CICR Inventory] Borrow Confirmation: ${itemName}`,
      text: `Hello ${borrowerName},\n\nYou have successfully borrowed ${quantity}x ${itemName} for ${durationDays} day(s).\n\nDue Date: ${formattedDueDate}\n\nPlease ensure it is returned on or before the due date.\n\nRegards,\nCICR Management Team`,
      html: `
        <h3>CICR Inventory - Borrow Confirmation</h3>
        <p>Hello <strong>${borrowerName}</strong>,</p>
        <p>You have successfully borrowed <strong>${quantity}x ${itemName}</strong>.</p>
        <p><strong>Borrow Duration:</strong> ${durationDays} day(s)</p>
        <p><strong>Due Date:</strong> ${formattedDueDate}</p>
        <p>Please ensure the equipment is handled with care and returned on or before the due date.</p>
        <br/>
        <p><em>CICR Management Team</em></p>
      `,
    };

    if (!process.env.SMTP_USER) {
      console.log(`[MOCK EMAIL SERVICE] Email dispatched to ${recipientEmail} for item '${itemName}' (Qty: ${quantity}, Duration: ${durationDays}d, Due: ${formattedDueDate})`);
      return { success: true, mocked: true };
    }

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] Email sent successfully: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`[EMAIL SERVICE ERROR] Failed to send email to ${recipientEmail}:`, error.message);
    // Graceful failover so email failures don't crash the borrow HTTP response
    return { success: false, error: error.message };
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
      from: process.env.SMTP_FROM || '"CICR Lab Admin" <no-reply@cicr.edu>',
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
    console.error(`[EMAIL SERVICE ERROR] Failed to send return email to ${recipientEmail}:`, error.message);
    // Graceful failover so email failures don't crash the return HTTP response
    return { success: false, error: error.message };
  }
};
