import React from "react";
import { AlertTriangle, Trash2, Info } from "lucide-react";
import Modal from "./Modal";
import Spinner from "./Spinner";

export default function ConfirmDialog({
  isOpen,
  title = "Confirm Action",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger", // danger | warning | info
  loading = false,
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  const icons = {
    danger: <Trash2 size={24} color="var(--danger)" />,
    warning: <AlertTriangle size={24} color="var(--warning)" />,
    info: <Info size={24} color="var(--accent)" />,
  };

  return (
    <Modal title={title} onClose={onCancel}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 20 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: variant === "danger" ? "var(--danger-subtle)" : variant === "warning" ? "var(--warning-subtle)" : "var(--accent-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icons[variant]}
        </div>
        <div style={{ flex: 1, fontSize: 14, lineHeight: 1.5, color: "var(--text-body)", paddingTop: 4 }}>
          {message}
        </div>
      </div>
      <div className="modal-footer-bar" style={{ padding: "16px 0 0", background: "none", borderTop: "1px solid var(--border)" }}>
        <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
          {cancelText}
        </button>
        <button
          className={`btn btn-${variant === "danger" ? "danger" : "primary"}`}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading && <Spinner />}
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
