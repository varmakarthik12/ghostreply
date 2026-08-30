import { useState, useEffect } from "react";

// Fallback build-time version injected by Vite
const BUILD_TIME_VERSION =
  typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__
    ? __APP_VERSION__
    : "v1.5.1";

let currentVersion = BUILD_TIME_VERSION.startsWith("v")
  ? BUILD_TIME_VERSION
  : `v${BUILD_TIME_VERSION}`;

const subscribers = new Set();

function setCachedVersion(v) {
  if (!v) return;
  const formatted = v.startsWith("v") ? v : `v${v}`;
  currentVersion = formatted;
  subscribers.forEach((cb) => cb(formatted));
}

// Fetch from backend API endpoints (unauthenticated)
let fetchPromise = null;
export function fetchAppVersion() {
  if (!fetchPromise) {
    fetchPromise = (async () => {
      const ts = Date.now();
      // Try /api/version first
      try {
        const res = await fetch(`/api/version?_=${ts}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.version) {
            setCachedVersion(data.version);
            return currentVersion;
          }
        }
      } catch {}

      // Try top-level /version
      try {
        const res = await fetch(`/version?_=${ts}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.version) {
            setCachedVersion(data.version);
            return currentVersion;
          }
        }
      } catch {}

      // Try /health
      try {
        const res = await fetch(`/health?_=${ts}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.version) {
            setCachedVersion(data.version);
            return currentVersion;
          }
        }
      } catch {}

      return currentVersion;
    })();
  }
  return fetchPromise;
}

export function useAppVersion() {
  const [version, setVersion] = useState(currentVersion);

  useEffect(() => {
    subscribers.add(setVersion);
    fetchAppVersion().then((v) => {
      setVersion(v);
    });
    return () => {
      subscribers.delete(setVersion);
    };
  }, []);

  return version;
}
