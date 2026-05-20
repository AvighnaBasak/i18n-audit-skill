import { useTranslations } from 'next-intl';

export default function LoginPage() {
  const t = useTranslations('auth');

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>{t('login.title')}</h1>
        <p className="subtitle">{t('login.subtitle')}</p>

        <form method="POST" action="/api/auth/login">
          <div className="field">
            <label htmlFor="email">{t('login.emailLabel')}</label>
            <input
              id="email"
              type="email"
              name="email"
              placeholder={t('login.emailPlaceholder')}
              required
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label htmlFor="password">{t('login.passwordLabel')}</label>
            <input
              id="password"
              type="password"
              name="password"
              placeholder={t('login.passwordPlaceholder')}
              required
              autoComplete="current-password"
            />
          </div>

          <div className="row">
            <label>
              <input type="checkbox" name="remember" />
              {t('login.rememberMe')}
            </label>
            <a href="/forgot-password">{t('login.forgotPassword')}</a>
          </div>

          <button type="submit">{t('login.submit')}</button>
        </form>

        <p>
          {t('login.noAccount')}
          <a href="/register">{t('login.signUp')}</a>
        </p>

        <div className="error-banner" role="alert">
          {t('errors.invalidCredentials')}
        </div>
      </div>
    </div>
  );
}
