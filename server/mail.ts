import nodemailer from "nodemailer";
import type { SMTPSettings } from "../shared/mail";
export type MailMessage = { to: string; subject: string; text: string };
export type MailSender = (
  settings: SMTPSettings,
  message: MailMessage,
) => Promise<void>;
export const sendMail: MailSender = async (settings, message) => {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.security === "tls",
    requireTLS: settings.security === "starttls",
    ignoreTLS: settings.security === "plain",
    auth: settings.username
      ? { user: settings.username, pass: settings.password }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    await transport.sendMail({
      from: { name: settings.fromName, address: settings.from },
      ...message,
    });
  } finally {
    transport.close();
  }
};
