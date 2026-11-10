import { createFileRoute, Link } from "@tanstack/react-router";
import { useI18n, BrandMenu } from "@/i18n/LanguageContext";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact GuestIn — Talk to the team" },
      {
        name: "description",
        content:
          "Get in touch with the GuestIn team via WhatsApp, Telegram or email. We usually reply within one business day.",
      },
      { property: "og:title", content: "Contact GuestIn" },
      {
        property: "og:description",
        content: "Reach out via WhatsApp, Telegram or email. Replies within one business day.",
      },
    ],
  }),
  component: ContactPage,
});

const WHATSAPP_PHONE = "393932054475";
const TELEGRAM_URL = "https://t.me/AlexMatter1512";
const EMAIL_ADDRESS = "beta@guestin.app";

function ContactPage() {
  const { t } = useI18n();

  const whatsappUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(t.beta.whatsappText)}`;
  const emailUrl = `mailto:${EMAIL_ADDRESS}?subject=${encodeURIComponent(t.beta.emailSubject)}&body=${encodeURIComponent(t.beta.emailBody)}`;

  return (
    <div className="min-h-screen bg-background text-ink">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <BrandMenu />
          <Link to="/" className="text-sm text-muted-foreground hover:text-ink">
            {t.contact.back}
          </Link>
        </div>
      </header>

      <main className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-cream via-background to-background" />
        <section className="mx-auto max-w-3xl px-6 pt-20 pb-12 text-center lg:pt-28">
          <p className="text-xs font-medium uppercase tracking-wider text-bronze">{t.contact.kicker}</p>
          <h1 className="mt-3 font-display text-5xl font-medium leading-[1.05] tracking-tight text-ink sm:text-6xl">
            {t.contact.titleA}{" "}
            <span className="italic text-bronze">{t.contact.titleB}</span>.
          </h1>
          <p className="mt-7 text-lg leading-relaxed text-muted-foreground">{t.contact.sub}</p>
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-24">
          <div className="grid gap-3 sm:grid-cols-3">
            <ContactCard
              href={whatsappUrl}
              label={t.beta.whatsappLabel}
              detail={t.beta.whatsappDetail}
              cta={t.beta.requestAccess}
              icon={<WhatsappIcon />}
            />
            <ContactCard
              href={TELEGRAM_URL}
              label={t.beta.telegramLabel}
              detail={t.beta.telegramDetail}
              cta={t.beta.requestAccess}
              icon={<TelegramIcon />}
            />
            <ContactCard
              href={emailUrl}
              label={t.beta.emailLabel}
              detail={t.beta.emailDetail}
              cta={t.beta.requestAccess}
              icon={<MailIcon />}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function ContactCard({
  href,
  label,
  detail,
  cta,
  icon,
}: {
  href: string;
  label: string;
  detail: string;
  cta: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-6 transition hover:border-ink/40 hover:shadow-lg hover:shadow-ink/5"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-paper transition group-hover:bg-bronze">
        {icon}
      </span>
      <div>
        <p className="font-display text-lg text-ink">{label}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
      </div>
      <span className="mt-auto text-sm font-medium text-bronze">{cta}</span>
    </a>
  );
}

function WhatsappIcon() {
  return (
    <svg viewBox="0 0 32 32" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M16.003 3C8.82 3 3 8.82 3 16c0 2.296.602 4.448 1.654 6.31L3 29l6.86-1.62A12.93 12.93 0 0 0 16.003 29C23.186 29 29 23.18 29 16S23.186 3 16.003 3zm0 23.4a10.36 10.36 0 0 1-5.282-1.444l-.378-.225-4.07.96.969-3.965-.246-.408A10.4 10.4 0 1 1 16.003 26.4zm5.97-7.78c-.327-.164-1.934-.954-2.234-1.063-.3-.11-.518-.164-.736.164-.218.327-.844 1.063-1.035 1.282-.19.218-.382.245-.71.082-.327-.164-1.38-.508-2.628-1.62-.971-.866-1.627-1.935-1.818-2.262-.19-.327-.02-.504.144-.667.148-.147.327-.382.49-.573.164-.19.218-.327.327-.545.11-.218.055-.41-.027-.573-.082-.164-.736-1.776-1.008-2.43-.265-.638-.535-.552-.737-.562-.19-.01-.408-.012-.627-.012a1.2 1.2 0 0 0-.872.41c-.3.327-1.144 1.117-1.144 2.722 0 1.605 1.171 3.155 1.335 3.373.164.218 2.305 3.519 5.586 4.93.78.337 1.39.538 1.866.69.784.249 1.498.214 2.062.13.629-.094 1.934-.79 2.207-1.554.273-.764.273-1.418.19-1.554-.082-.137-.3-.218-.627-.382z"/>
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
