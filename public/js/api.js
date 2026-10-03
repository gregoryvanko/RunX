"use strict";

// Client de l'API RunX (même API que celle utilisée par l'application iOS)
window.Api = (() => {
  const TOKEN_KEY = "runx.token";
  const USER_KEY = "runx.user";
  let onUnauthorized = () => {};

  // « Rester connecté » : localStorage (survit à la fermeture du navigateur), sinon sessionStorage (onglet)
  const store = () => (localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage);

  const session = {
    get token() { return store().getItem(TOKEN_KEY); },
    get user() {
      try { return JSON.parse(store().getItem(USER_KEY)); } catch { return null; }
    },
    // remember n'est utilisé qu'à la connexion ; ensuite le stockage en cours est conservé
    save(token, user, remember) {
      let target = store();
      if (remember !== undefined) {
        session.clear();
        target = remember ? localStorage : sessionStorage;
      }
      if (token) target.setItem(TOKEN_KEY, token);
      if (user) target.setItem(USER_KEY, JSON.stringify(user));
    },
    clear() {
      for (const s of [localStorage, sessionStorage]) {
        s.removeItem(TOKEN_KEY);
        s.removeItem(USER_KEY);
      }
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
    login: (username, password, remember) => request("POST", "/auth/login", { username, password, remember }),
    register: (username, displayName, password) => request("POST", "/auth/register", { username, displayName, password }),
    logout: () => request("POST", "/auth/logout"),
    me: () => request("GET", "/me"),
    updateMe: (displayName) => request("PATCH", "/me", { displayName }),
    setTarget: (target) => request("PUT", "/me/target", target),
    deleteTarget: () => request("DELETE", "/me/target"),
    changePassword: (currentPassword, newPassword) => request("PUT", "/me/password", { currentPassword, newPassword }),
    listUsers: (params) => request("GET", `/admin/users${query(params)}`),
    setRole: (id, role) => request("PATCH", `/admin/users/${encodeURIComponent(id)}/role`, { role }),
    deleteUser: (id) => request("DELETE", `/admin/users/${encodeURIComponent(id)}`),
    listLogs: (params) => request("GET", `/admin/logs${query(params)}`),
    listRuns: (params) => request("GET", `/runs${query(params)}`),
    getRun: (id) => request("GET", `/runs/${encodeURIComponent(id)}`),
    createRun: (run) => request("POST", "/runs", run),
    updateRun: (id, run) => request("PUT", `/runs/${encodeURIComponent(id)}`, run),
    deleteRun: (id) => request("DELETE", `/runs/${encodeURIComponent(id)}`),
    previewRun: (run) => request("POST", "/runs/preview", run),
  };
})();
