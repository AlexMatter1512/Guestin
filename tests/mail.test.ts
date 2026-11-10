import { expect, test } from "bun:test";
import { createServer } from "node:net";
import { sendMail } from "../server/mail";

test("SMTP transport delivers through a custom relay and requires STARTTLS when selected", async () => {
  const received: string[] = [];
  const server = createServer((socket) => {
    socket.write("220 fake.test ESMTP\r\n");
    let buffer = "",
      inData = false,
      data = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n"),
          line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData) {
          if (line === ".") {
            received.push(data);
            inData = false;
            socket.write("250 accepted\r\n");
          } else data += line + "\r\n";
        } else if (line.startsWith("EHLO"))
          socket.write("250-fake.test\r\n250 OK\r\n");
        else if (line === "STARTTLS") socket.write("502 TLS unavailable\r\n");
        else if (line === "DATA") {
          inData = true;
          socket.write("354 send data\r\n");
        } else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const settings = {
    host: "127.0.0.1",
    port,
    security: "plain" as const,
    username: "",
    password: "",
    from: "app@example.test",
    fromName: "Example",
  };
  const message = {
    to: "user@example.test",
    subject: "Recovery test",
    text: "Recovery link for testing",
  };
  try {
    await sendMail(settings, message);
    expect(received).toHaveLength(1);
    expect(received[0]).toContain("To: user@example.test");
    expect(received[0]).toContain("From: Example <app@example.test>");
    expect(received[0]).toContain("Recovery link for testing");
    await expect(
      sendMail({ ...settings, security: "starttls" }, message),
    ).rejects.toThrow();
    expect(received).toHaveLength(1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
