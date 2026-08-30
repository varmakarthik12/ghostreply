import React from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export default function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  variant = "primary",
  trend = null, // { positive: true, text: "+12%" }
  onClick,
  style = {},
}) {
  return (
    <div
      className={`kpi-card ${variant}${onClick ? " glass-card-interactive" : ""}`}
      style={{ cursor: onClick ? "pointer" : "default", ...style }}
      onClick={onClick}
    >
      <div className="kpi-content">
        <span className="kpi-label">{label}</span>
        <span className="kpi-value">{value ?? 0}</span>
        {(subtext || trend) && (
          <div className="kpi-subtext">
            {trend && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  color: trend.positive ? "var(--success)" : "var(--danger)",
                  fontWeight: 600,
                  marginRight: 4,
                }}
              >
                {trend.positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {trend.text}
              </span>
            )}
            {subtext && <span>{subtext}</span>}
          </div>
        )}
      </div>
      {Icon && (
        <div className="kpi-icon-bubble">
          <Icon size={22} />
        </div>
      )}
    </div>
  );
}
