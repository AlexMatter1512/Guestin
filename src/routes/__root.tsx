import { Outlet, Link, createRootRoute, HeadContent } from "@tanstack/react-router";

import { LanguageProvider } from "@/i18n/LanguageContext";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Guestin — Open-source, self-hosted guest access" },
      {
        name: "description",
        content:
          "Self-host guest access, staff codes and breakfast management. Welcome guests with a browser link.",
      },
      { name: "author", content: "GuestIn" },
      { property: "og:title", content: "Guestin — Open-source, self-hosted guest access" },
      {
        property: "og:description",
        content:
          "Self-host guest access, staff codes and breakfast management. Welcome guests with a browser link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Guestin — Open-source, self-hosted guest access" },
      {
        name: "twitter:description",
        content:
          "Self-host guest access, staff codes and breakfast management. Welcome guests with a browser link.",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/63a14795-b6ad-4941-9279-f4e8aec9f0c3",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/63a14795-b6ad-4941-9279-f4e8aec9f0c3",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  return (
    <LanguageProvider>
      <HeadContent />
      <Outlet />
    </LanguageProvider>
  );
}
