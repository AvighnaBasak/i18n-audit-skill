import { useTranslations } from 'next-intl';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}

export function Navbar() {
  const t = useTranslations('common');

  return (
    <nav>
      <a href="/">{t('nav.home')}</a>
      <a href="/dashboard">{t('nav.dashboard')}</a>
      <a href="/settings">{t('nav.settings')}</a>
      <a href="/profile">{t('nav.profile')}</a>
      <button aria-label="Open billing page">{t('nav.billing')}</button>
      <button onClick={() => {}}>{t('nav.logout')}</button>
    </nav>
  );
}
