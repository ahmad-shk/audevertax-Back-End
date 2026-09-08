import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

export async function sendVerificationEmail(email: string, verificationUrl: string) {
  const smtpHost = env.SMTP_HOST;
  const smtpPort = env.SMTP_PORT;
  const smtpUser = env.SMTP_USER;
  const smtpPass = env.SMTP_PASS;
  const smtpFrom = env.SMTP_FROM || 'noreply@audevertax.com';

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
    console.info(`[EMAIL] Verify account for ${email}: ${verificationUrl}`);
    return { delivered: false, provider: 'console' };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  await transporter.sendMail({
    from: smtpFrom,
    to: email,
    subject: 'Verify your Audevertax account',
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2>Verify your email</h2>
        <p>Thank you for registering.</p>
        <p>Click the link below to verify your email and continue:</p>
        <p><a href="${verificationUrl}">${verificationUrl}</a></p>
        <p>If you did not create this account, you can ignore this email.</p>
      </div>
    `,
  });

  return { delivered: true, provider: 'smtp' };
}
