import { useEffect } from "react";

export default function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div
        className={`modal${wide ? " modal-wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <span className="modal-close" onClick={onClose}>
            ✕
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
