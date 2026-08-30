export const shortId = (id, len = 8) => (id ? (id.length > len ? id.slice(0, len) + "…" : id) : "—");

export function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTime(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function fmtRelative(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const now = new Date();
  const diffSec = Math.floor((now - dt) / 1000);

  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return fmtDate(d);
}

export function platformColor(p) {
  const m = {
    telegram: "blue",
    whatsapp: "green",
    discord: "purple",
    slack: "yellow",
    sms: "accent",
    snapchat: "yellow",
    instagram: "purple",
    webhook: "primary",
  };
  return m[(p || "").toLowerCase()] || "gray";
}

export function scopeColor(s) {
  return (
    { global: "purple", integration: "blue", conversation: "green" }[s] ||
    "gray"
  );
}

export function formatNumber(num) {
  if (num === null || num === undefined) return "0";
  return new Intl.NumberFormat().format(num);
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    return true;
  }
}

