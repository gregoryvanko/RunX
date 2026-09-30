"use strict";

// Client de l'API RunX (même API que celle utilisée par l'application iOS)
window.Api = (() => {
  const TOKEN_KEY = "runx.token";
  const USER_KEY = "runx.user";
  let onUnauthorized = () => {};

  const session = {
    get token() { return sessionStorage.getItem(TOKEN_KEY); },
    get user() {
      try { return JSON.parse(sessionStorage.getItem(USER_KEY)); } catch { return null; }
    },
    save(token, user) {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      if (user) sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    },
    clear() {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    },
  };

  async function request(method, path, body) {
    const headers = { Accept: "application/json", "X-Client": "web" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (session.token) headers.Authorization = `Bearer ${session.token}`;

    let res;
    try {
      res = await fetch(`/api/v1${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: "omit",
      });
    } catch {
      throw new Error("Serveur injoignable");
    }

    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && !path.startsWith("/auth/")) {
        session.clear();
        onUnauthorized();
      }
      const err = new Error((data && data.error) || `Erreur ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function query(params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") qs.set(k, v);
    const s = qs.toString();
    return s ? `?${s}` : "";
  }

  return {
    session,
    setUnauthorizedHandler(fn) { onUnauthorized = fn; },
    login: (username, password) => request("POST", "/auth/login", { username, password }),
    register: (username, displayName, password) => request("POST", "/auth/register", { username, displayName, password }),
    logout: () => request("POST", "/auth/logout"),
    me: () => request("GET", "/me"),
    updateMe: (displayName) => request("PATCH", "/me", { displayName }),
    changePassword: (currentPassword, newPassword) => request("PUT", "/me/password", { currentPassword, newPassword }),
    listUsers: (params) => request("GET", `/admin/users${query(params)}`),
    setRole: (id, role) => request("PATCH", `/admin/users/${encodeURIComponent(id)}/role`, { role }),
    deleteUser: (id) => request("DELETE", `/admin/users/${encodeURIComponent(id)}`),
    listLogs: (params) => request("GET", `/admin/logs${query(params)}`),
  };
})();
