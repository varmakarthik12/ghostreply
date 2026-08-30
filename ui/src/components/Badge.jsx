export default function Badge({
  color = "gray",
  children,
  dot = false,
  lg = false,
  icon = null,
  style = {},
  className = "",
}) {
  return (
    <span
      className={`badge badge-${color}${lg ? " badge-lg" : ""} ${className}`}
      style={style}
    >
      {dot && <span className={`status-dot ${color}`} />}
      {icon && <span style={{ display: "inline-flex", marginRight: 2 }}>{icon}</span>}
      {children}
    </span>
  );
}

