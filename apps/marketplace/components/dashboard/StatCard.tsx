import Icon, { type IconName } from "../Icon";

export interface StatCardProps {
  label: string;
  value: string | number;
  icon: IconName;
  trend?: {
    text: string;
    positive?: boolean;
    neutral?: boolean;
  };
  color?: "blue" | "green" | "amber" | "purple";
}

export default function StatCard({ label, value, icon, trend, color = "blue" }: StatCardProps) {
  return (
    <div className={`stat-card stat-card--${color}`}>
      <div className="stat-card__head">
        <span className="stat-card__icon">
          <Icon name={icon} size={20} />
        </span>
        {trend && (
          <span
            className={`stat-card__trend ${
              trend.neutral
                ? "stat-card__trend--neutral"
                : trend.positive
                ? "stat-card__trend--up"
                : "stat-card__trend--down"
            }`}
          >
            {trend.positive && <Icon name="trendUp" size={13} />}
            {!trend.positive && !trend.neutral && <Icon name="trendDown" size={13} />}
            <span>{trend.text}</span>
          </span>
        )}
      </div>
      <div className="stat-card__body">
        <div className="stat-card__value num">{value}</div>
        <div className="stat-card__label">{label}</div>
      </div>
    </div>
  );
}
