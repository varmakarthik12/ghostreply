export default function Alert({ type = "error", children, onClose }) {
  return (
    <div className={`alert alert-${type}`}>
      <span>{children}</span>
      {onClose && (
        <span style={{ cursor: "pointer", opacity: 0.7 }} onClick={onClose}>
          ✕
        </span>
      )}
    </div>
  );
}
