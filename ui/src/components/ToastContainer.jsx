import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { setToastFn } from "../lib/toast";

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    setToastFn((msg, type = "success") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, msg, type }]);
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, 4000);
    });
    return () => setToastFn(null);
  }, []);

  const remove = (id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  };

  const icons = {
    success: <CheckCircle2 size={18} color="var(--success)" style={{ flexShrink: 0 }} />,
    error: <AlertCircle size={18} color="var(--danger)" style={{ flexShrink: 0 }} />,
    info: <Info size={18} color="var(--accent)" style={{ flexShrink: 0 }} />,
  };

  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast-item ${t.type}`}>
          {icons[t.type] || icons.info}
          <span style={{ flex: 1, wordBreak: "break-word" }}>{t.msg}</span>
          <button
            onClick={() => remove(t.id)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 2,
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

