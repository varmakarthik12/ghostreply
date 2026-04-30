export default function Spinner({ lg }) {
  return <div className={`spinner${lg ? " spinner-lg" : ""}`} />;
}
