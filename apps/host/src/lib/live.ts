// The session stays in its HttpOnly cookie. Reconnects always request a fresh snapshot.
export function connectLive(onMessage: (message: any) => void) {
  let stopped = false;
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout>;
  let watchdog: ReturnType<typeof setTimeout>;
  let attempts = 0;
  function connect() {
    if (stopped) return;
    clearTimeout(retry);
    clearTimeout(watchdog);
    socket?.close();
    const current = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/v1/live`,
    );
    socket = current;
    const armWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => current.close(), 60000);
    };
    armWatchdog();
    current.onmessage = ({ data }) => {
      if (stopped || socket !== current) return;
      armWatchdog();
      try {
        const message = JSON.parse(data);
        attempts = 0;
        if (message.type !== "heartbeat") onMessage(message);
      } catch {
        /* Ignore malformed messages. */
      }
    };
    current.onerror = () => current.close();
    current.onclose = (event) => {
      if (stopped || socket !== current) return;
      clearTimeout(watchdog);
      if (event.code === 1008) return;
      retry = setTimeout(
        connect,
        Math.min(30000, 1000 * 2 ** attempts++) + Math.random() * 500,
      );
    };
  }
  const resume = () => {
    if (document.visibilityState === "visible") connect();
  };
  window.addEventListener("online", connect);
  document.addEventListener("visibilitychange", resume);
  connect();
  return () => {
    stopped = true;
    clearTimeout(retry);
    clearTimeout(watchdog);
    socket?.close();
    window.removeEventListener("online", connect);
    document.removeEventListener("visibilitychange", resume);
  };
}
