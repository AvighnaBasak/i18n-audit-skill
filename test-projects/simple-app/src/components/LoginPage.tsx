import React from 'react';
import { useTranslation } from 'react-i18next';

export function LoginPage() {
  const { t } = useTranslation();

  return (
    <div className="login">
      <h1>Welcome Back</h1>

      <form>
        <label htmlFor="email">{t('auth.email')}</label>
        <input
          id="email"
          type="email"
          placeholder="you@example.com"
        />

        <label htmlFor="password">{t('auth.password')}</label>
        <input
          id="password"
          type="password"
          placeholder="Enter your password"
        />

        <a href="/reset">Forgot password?</a>

        <button type="submit">{t('auth.login')}</button>
        <button type="button">{t('auth.register')}</button>
      </form>

      <p className="error-hint">{t('errors.networkError')}</p>
    </div>
  );
}
