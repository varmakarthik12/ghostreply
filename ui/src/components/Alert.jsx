import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from "lucide-react";

export default function Alert({ type = "error", title, children, onClose, style = {} }) {
  const icons = {
    error: <AlertCircle size={18} style={{ flexShrink: 0 }} />,
    success: <CheckCircle2 size={18} style={{ flexShrink: 0 }} />,
    warning: <AlertTriangle size={18} style={{ flexShrink: 0 }} />,
    info: <Info size={18} style={{ flexShrink: 0 }} />,
  };

  return (
    <div className={`alert alert-${type}`} style={style}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1 }}>
        {icons[type] || icons.info}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {title && <strong style={{ fontSize: 13 }}>{title}</strong>}
          <div style={{ fontSize: 13, lineHeight: 1.4 }}>{children}</div>
        </div>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "currentColor",
            opacity: 0.7,
            cursor: "pointer",
            padding: 4,
            display: "flex",
            alignItems: "center",
          }}
          title="Dismiss"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

