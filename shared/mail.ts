import { z } from "zod";
export const smtpSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9.:-]+$/),
  port: z.number().int().min(1).max(65535),
  security: z.enum(["tls", "starttls", "plain"]),
  username: z.string().max(500).default(""),
  password: z.string().max(2000).default(""),
  from: z.email(),
  fromName: z
    .string()
    .max(120)
    .regex(/^[^\r\n]*$/)
    .default("guestin"),
});
export type SMTPSettings = z.infer<typeof smtpSchema>;
