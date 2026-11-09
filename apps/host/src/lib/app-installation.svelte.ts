interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Capture early, including while the user signs in or completes the first steps.
class AppInstallation {
  prompt = $state.raw<InstallPrompt | null>(null);
  installed = $state(false);
  secure = $state(false);
  ios = $state(false);
  ready = $state(false);

  listen() {
    this.secure = window.isSecureContext;
    this.ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const display = matchMedia("(display-mode: standalone)");
    const refresh = () => {
      this.installed =
        display.matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
    };
    const offered = (event: Event) => {
      event.preventDefault();
      this.prompt = event as InstallPrompt;
    };
    const installed = () => {
      this.installed = true;
      this.prompt = null;
    };
    refresh();
    this.ready = true;
    display.addEventListener("change", refresh);
    window.addEventListener("beforeinstallprompt", offered);
    window.addEventListener("appinstalled", installed);
    return () => {
      display.removeEventListener("change", refresh);
      window.removeEventListener("beforeinstallprompt", offered);
      window.removeEventListener("appinstalled", installed);
    };
  }

  async install() {
    const prompt = this.prompt;
    if (!prompt) return "unavailable";
    // Each browser event can be consumed once, regardless of the user's choice.
    this.prompt = null;
    await prompt.prompt();
    return (await prompt.userChoice).outcome;
  }
}

export const appInstallation = new AppInstallation();
