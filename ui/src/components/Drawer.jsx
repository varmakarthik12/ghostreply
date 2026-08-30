import React, { useEffect } from "react";
import { X } from "lucide-react";

export default function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  wide = false,
  footer = null,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div
        className={`drawer-panel${wide ? " wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header-bar">
          <div>
            <h3 className="modal-header-title">{title}</h3>
            {subtitle && (
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-icon-only btn-sm"
            style={{ color: "var(--text-muted)" }}
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>
        <div className="modal-body-scroll">{children}</div>
        {footer && <div className="modal-footer-bar">{footer}</div>}
      </div>
    </div>
  );
}
