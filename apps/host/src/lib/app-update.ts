export const refreshAttemptKey = "guestin.host.refresh-build";

function installedWorker(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorker | null> {
  if (registration.waiting) return Promise.resolve(registration.waiting);
  const installing = registration.installing;
  if (!installing) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        finish(
          Error(
            "App update timed out. Try again when your connection is stable.",
          ),
        ),
      20000,
    );
    const changed = () => {
      if (installing.state === "installed") finish();
      else if (installing.state === "redundant")
        finish(Error("The updated app could not be downloaded. Try again."));
    };
    function finish(error?: Error) {
      clearTimeout(timer);
      installing?.removeEventListener("statechange", changed);
      if (error) reject(error);
      else resolve(registration.waiting ?? installing);
    }
    installing.addEventListener("statechange", changed);
    changed();
  });
}

export async function refreshInstalledApp(expectedId: string) {
  const reload = () => {
    if (expectedId) {
      try {
        sessionStorage.setItem(refreshAttemptKey, expectedId);
      } catch {
        /* Storage is optional. */
      }
    }
    location.reload();
  };
  if (!("serviceWorker" in navigator)) return reload();
  const registration = await navigator.serviceWorker.getRegistration("/host/");
  if (!registration) return reload();
  await registration.update();
  const waiting = await installedWorker(registration);
  if (!waiting) return reload();
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(
      () =>
        finish(
          Error(
            "App update timed out. Close all GuestIn windows and reopen the app.",
          ),
        ),
      15000,
    );
    const controlled = () => {
      finish();
      resolve();
    };
    function finish(error?: Error) {
      clearTimeout(timer);
      channel.port1.close();
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        controlled,
      );
      if (error) reject(error);
    }
    channel.port1.onmessage = ({ data }) => {
      if (data?.error === "other-windows")
        finish(
          Error("Close other GuestIn host windows before refreshing this app."),
        );
      else if (data?.error)
        finish(
          Error(
            "The downloaded app does not match the server. Try again later.",
          ),
        );
    };
    navigator.serviceWorker.addEventListener("controllerchange", controlled);
    waiting.postMessage({ type: "GUESTIN_ACTIVATE", expectedId }, [
      channel.port2,
    ]);
  });
  reload();
}
