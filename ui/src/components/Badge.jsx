export default function Badge({ color = "gray", children }) {
  return <span className={`badge badge-${color}`}>{children}</span>;
}
