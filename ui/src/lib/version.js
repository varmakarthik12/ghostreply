import { useState, useEffect } from "react";
import { apiGet } from "./api";

// Fallback build-time version injected by Vite
const BUILD_TIME_VERSION =
  typeof __APP_VERSION__ !== "undefined"
    ? __APP_VERSION__
    : "v1.0.0";

let currentVersion = BUILD_TIME_VERSION;
const subscribers = new Set();

function setCachedVersion(v) {
  if (!v) return;
  const formatted = v.startsWith("v") ? v : `v${v}`;
  currentVersion = formatted;
  subscribers.forEach((cb) => cb(formatted));
}

// Fetch from API once
let fetchPromise = null;
export function fetchAppVersion() {
  if (!fetchPromise) {
    fetchPromise = apiGet("/version")
      .then((data) => {
        if (data?.version) {
          setCachedVersion(data.version);
        }
        return currentVersion;
      })
      .catch(() => {
        return currentVersion;
      });
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
