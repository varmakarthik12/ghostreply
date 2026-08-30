export default function Field({
  label,
  children,
  required = false,
  hint = null,
  error = null,
  style = {},
  className = "",
}) {
  return (
    <div className={`form-field ${className}`} style={style}>
      {label && (
        <label className="form-label">
          <span>
            {label}
            {required && <span className="required-star">*</span>}
          </span>
          {hint && <span className="form-hint-badge">{hint}</span>}
        </label>
      )}
      {children}
      {error && (
        <span style={{ fontSize: 11, color: "var(--danger)", marginTop: 2 }}>
          {error}
        </span>
      )}
    </div>
  );
}

