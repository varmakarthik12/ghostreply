export const shortId = (id) => (id ? id.slice(0, 8) + "…" : "—");

export function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleString();
}

export function platformColor(p) {
  const m = {
    telegram: "blue",
    whatsapp: "green",
    sms: "yellow",
    snapchat: "yellow",
    instagram: "purple",
  };
  return m[(p || "").toLowerCase()] || "gray";
}

export function scopeColor(s) {
  return (
    { global: "purple", integration: "blue", conversation: "green" }[s] ||
    "gray"
  );
}
