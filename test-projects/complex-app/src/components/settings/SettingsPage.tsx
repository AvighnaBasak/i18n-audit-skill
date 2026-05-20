import { useTranslations } from 'next-intl';

export function SettingsPage() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');

  return (
    <div className="settings">
      <h1>{t('title')}</h1>

      <nav className="tabs" role="tablist">
        {(['general', 'security', 'notifications', 'billing', 'team'] as const).map(tab => (
          <button key={tab} role="tab">
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </nav>

      <section id="general">
        <h2>{t('tabs.general')}</h2>
        <div className="field">
          <label>{t('general.language')}</label>
          <select aria-label="Choose display language">
            <option>English</option>
            <option>Français</option>
            <option>Deutsch</option>
          </select>
        </div>
        <div className="field">
          <label>{t('general.timezone')}</label>
        </div>
        <div className="field">
          <label>{t('general.theme')}</label>
          <div role="radiogroup" aria-label="Select color theme">
            <label><input type="radio" name="theme" value="light" />{t('general.themeLight')}</label>
            <label><input type="radio" name="theme" value="dark" />{t('general.themeDark')}</label>
            <label><input type="radio" name="theme" value="system" />{t('general.themeSystem')}</label>
          </div>
        </div>
      </section>

      <section id="notifications">
        <h2>{t('tabs.notifications')}</h2>
        <div className="toggle-row">
          <label>{t('notifications.email')}</label>
          <input type="checkbox" aria-label="Toggle email notifications" />
        </div>
        <div className="toggle-row">
          <label>{t('notifications.push')}</label>
          <input type="checkbox" aria-label="Toggle push notifications" />
        </div>
        <div className="toggle-row">
          <label>{t('notifications.marketing')}</label>
        </div>
        <div className="toggle-row">
          <label>{t('notifications.security')}</label>
        </div>
      </section>

      <section id="danger" className="danger-zone">
        <h2>{t('dangerZone.title')}</h2>
        <p>{t('dangerZone.deleteWarning')}</p>
        <button className="destructive" aria-label="Permanently delete your account">
          {t('dangerZone.deleteAccount')}
        </button>
      </section>

      <div className="form-actions">
        <button type="submit">{tc('actions.save')}</button>
        <button type="button">{tc('actions.cancel')}</button>
      </div>
    </div>
  );
}
