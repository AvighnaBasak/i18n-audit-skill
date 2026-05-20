import React from 'react';
import { useTranslation } from 'react-i18next';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>404</h1>
      <p>{t('errors.notFound')}</p>
      <a href="/">Go back home</a>
    </div>
  );
}

export function TimeoutBanner() {
  const { t } = useTranslation();
  return (
    <div role="alert" aria-label="Network timeout warning">
      {t('errors.timeout')}
    </div>
  );
}
