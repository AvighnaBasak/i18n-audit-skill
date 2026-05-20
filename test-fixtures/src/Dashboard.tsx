import React from 'react';
import { useTranslation } from 'react-i18next';

export function Dashboard() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('dashboard.title')}</h1>
      <p>{t('dashboard.subtitle')}</p>
      <p>{t('dashboard.noData')}</p>
      <button>{t('common.edit')}</button>
      <button title="Remove this item">{t('common.delete')}</button>
      <span aria-label="Loading indicator">{t('common.loading')}</span>
      <p>{t('common.welcome', { name: 'World' })}</p>
      <p>{t('common.itemCount', { count: 5 })}</p>
      <p>{t('nav.dashboard')}</p>
    </div>
  );
}
