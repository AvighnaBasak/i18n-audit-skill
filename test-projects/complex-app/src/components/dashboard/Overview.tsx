import { useTranslations } from 'next-intl';

interface Props {
  userName: string;
  userCount: number;
  revenue: number;
}

export function DashboardOverview({ userName, userCount, revenue }: Props) {
  const t = useTranslations('dashboard');
  const tc = useTranslations('common');

  return (
    <div className="overview">
      <h1>{t('overview.title')}</h1>
      <p>{t('overview.greeting', { timeOfDay: 'morning', name: userName })}</p>
      <p>{t('overview.lastSeen', { time: '2 hours' })}</p>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="label">{t('overview.totalRevenue')}</span>
          <span className="value">${revenue.toLocaleString()}</span>
        </div>

        <div className="stat-card">
          <span className="label">{t('overview.activeProjects')}</span>
          <p>{t('overview.totalUsers', { count: userCount })}</p>
        </div>

        <div className="stat-card" title="Tasks completed in the current week">
          <span className="label">{t('overview.completedTasks')}</span>
        </div>
      </div>

      <div className="widgets-row">
        <section aria-label="Recent activity panel">
          <h2>{t('widgets.recentActivity')}</h2>
          <p>{t('widgets.noActivity')}</p>
          <a href="/activity">{t('widgets.viewAll')}</a>
        </section>

        <section>
          <h2>Quick Actions</h2>
          <button>Create new project</button>
          <button>Invite team member</button>
        </section>
      </div>
    </div>
  );
}
