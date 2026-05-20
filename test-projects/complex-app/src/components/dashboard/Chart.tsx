import { useTranslations } from 'next-intl';

type Period = 'monthly' | 'weekly' | 'daily';

interface Props {
  data: number[];
  period: Period;
}

export function RevenueChart({ data, period }: Props) {
  const t = useTranslations('dashboard');

  const periodLabels: Record<Period, string> = {
    monthly: t('chart.monthly'),
    weekly: t('chart.weekly'),
    daily: t('chart.daily'),
  };

  return (
    <div className="chart-container">
      <div className="chart-header">
        <h2>{t('chart.title')}</h2>
        <div className="period-selector" role="group" aria-label="Select time period">
          {(['monthly', 'weekly', 'daily'] as Period[]).map(p => (
            <button
              key={p}
              className={period === p ? 'active' : ''}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="empty-state">
          <p>{t('chart.noData')}</p>
        </div>
      ) : (
        <canvas id="revenue-chart" aria-label="Revenue chart" />
      )}
    </div>
  );
}
