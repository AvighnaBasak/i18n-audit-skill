import React from 'react';
import { useTranslation } from 'react-i18next';

export function LoginForm() {
  const { t } = useTranslation();

  return (
    <form>
      <h1>{t('auth.login')}</h1>
      <input type="email" placeholder="Enter your email address" />
      <input type="password" placeholder="Password" />
      <p className="hint">Forgot your password? Click here</p>
      <button type="submit">{t('common.save')}</button>
      <button type="button" onClick={() => {}}>Cancel</button>
      <p>{t('auth.error.invalidCredentials')}</p>
    </form>
  );
}
