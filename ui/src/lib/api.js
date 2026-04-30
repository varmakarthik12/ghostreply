let _token = localStorage.getItem("gr_token") || "";

export const setToken = (t) => {
  _token = t;
  localStorage.setItem("gr_token", t);
};
export const getToken = () => _token;
export const clearToken = () => {
  _token = "";
  localStorage.removeItem("gr_token");
};

export async function apiFetch(method, path, body) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + _token,
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch("/api" + path, opts);
  if (res.status === 204) return null;
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

export const apiGet = (p) => apiFetch("GET", p);
export const apiPost = (p, b) => apiFetch("POST", p, b);
export const apiPut = (p, b) => apiFetch("PUT", p, b);
export const apiDel = (p) => apiFetch("DELETE", p);
