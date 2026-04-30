import { useEffect, useState } from "react";
import { setToastFn } from "../lib/toast";

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    setToastFn((msg, type) => {
      const id = Date.now();
      setToasts((t) => [...t, { id, msg, type }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
    });
    return () => setToastFn(null);
  }, []);

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
