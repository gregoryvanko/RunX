"use strict";

(() => {
  const view = document.getElementById("view");
  const topbar = document.getElementById("topbar");
  const nav = document.getElementById("nav");
  const burger = document.getElementById("burger");
  const toastEl = document.getElementById("toast");

  // ---------- Utilitaires DOM (textContent uniquement : pas d'injection HTML) ----------
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  function field(label, input, cls) {
    return h("div", { class: `field ${cls || ""}` }, h("label", { for: input.id }, label), input);
  }

  let toastTimer;
  function toast(message, isError) {
    toastEl.textContent = message;
    toastEl.className = `toast${isError ? " error" : ""}`;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3500);
  }

  const fmtDate = (d) => (d ? new Date(d).toLocaleString("fr-FR") : "—");

  function render(...nodes) {
    view.replaceChildren(...nodes);
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  async function withBusy(button, fn) {
    button.disabled = true;
    try { await fn(); } finally { button.disabled = false; }
  }

  // ---------- Session / navigation ----------
  const isAdmin = () => Api.session.user && Api.session.user.role === "admin";

  function updateChrome(route) {
    const logged = !!Api.session.token;
    topbar.hidden = !logged;
    nav.querySelectorAll("[data-admin]").forEach((a) => { a.hidden = !isAdmin(); });
    nav.querySelectorAll("a[data-route]").forEach((a) => a.classList.toggle("active", a.dataset.route === route));
    setMenu(false);
  }

  function setMenu(open) {
    nav.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", String(open));
  }

  burger.addEventListener("click", (e) => {
    e.stopPropagation();
    setMenu(!nav.classList.contains("open"));
  });
  // Fermeture : choix d'une entrée, clic en dehors du menu ou touche Échap
  nav.addEventListener("click", (e) => { if (e.target.closest("a, button")) setMenu(false); });
  document.addEventListener("click", (e) => { if (!nav.contains(e.target)) setMenu(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("open")) { setMenu(false); burger.focus(); }
  });

  document.getElementById("logout").addEventListener("click", async () => {
    try { await Api.logout(); } catch { /* session déjà invalide */ }
    Api.session.clear();
    location.hash = "#/login";
  });

  Api.setUnauthorizedHandler(() => {
    toast("Session expirée, veuillez vous reconnecter", true);
    location.hash = "#/login";
  });

  // ---------- Vues ----------
  function authView(mode) {
    const isLogin = mode === "login";
    const username = h("input", { id: "username", name: "username", autocomplete: "username", autocapitalize: "none", spellcheck: "false", required: true, maxlength: 32 });
    const displayName = h("input", { id: "displayName", name: "displayName", autocomplete: "name", maxlength: 64 });
    const password = h("input", { id: "password", name: "password", type: "password", required: true, minlength: isLogin ? null : 8, maxlength: 128, autocomplete: isLogin ? "current-password" : "new-password" });
    const confirm = h("input", { id: "confirm", name: "confirm", type: "password", required: true, autocomplete: "new-password" });
    const error = h("p", { class: "error full", role: "alert" });
    const submit = h("button", { class: "btn block", type: "submit" }, isLogin ? "Se connecter" : "Créer mon compte");

    const form = h("form", { novalidate: true, onsubmit: (e) => {
      e.preventDefault();
      error.textContent = "";
      if (!isLogin && password.value !== confirm.value) {
        error.textContent = "Les mots de passe ne correspondent pas";
        return;
      }
      withBusy(submit, async () => {
        try {
          const res = isLogin
            ? await Api.login(username.value, password.value)
            : await Api.register(username.value, displayName.value, password.value);
          Api.session.save(res.token, res.user);
          location.hash = "#/home";
        } catch (err) {
          error.textContent = err.message;
        }
      });
    } },
      field("Identifiant", username, isLogin ? "full" : ""),
      !isLogin && field("Nom affiché (facultatif)", displayName),
      field("Mot de passe", password, isLogin ? "full" : ""),
      !isLogin && field("Confirmation", confirm),
      error,
      h("div", { class: "full" }, submit)
    );

    render(h("div", { class: "auth-wrap" }, h("section", { class: "auth" },
      h("span", { class: "brand" }, "Run", h("span", {}, "X")),
      h("p", { class: "sub muted" }, isLogin ? "Connectez-vous à votre espace" : "Créez votre compte"),
      form,
      h("p", { class: "switch" }, isLogin
        ? ["Pas encore de compte ? ", h("a", { href: "#/register" }, "Créer un compte")]
        : ["Déjà inscrit ? ", h("a", { href: "#/login" }, "Se connecter")])
    )));
    username.focus();
  }

  async function homeView() {
    const { user } = await Api.me();
    Api.session.save(null, user);
    updateChrome("home");
    render(
      h("section", { class: "hero" },
        h("h1", {}, `Bienvenue, ${user.displayName} !`),
        h("p", {}, user.role === "admin" ? "Vous êtes connecté en tant qu'administrateur." : "Heureux de vous revoir sur RunX.")),
      h("div", { class: "grid" },
        h("section", { class: "card" }, h("h2", {}, "Mon profil"),
          h("dl", { class: "kv" },
            h("dt", {}, "Identifiant"), h("dd", {}, user.username),
            h("dt", {}, "Nom"), h("dd", {}, user.displayName),
            h("dt", {}, "Rôle"), h("dd", {}, h("span", { class: `badge ${user.role}` }, user.role === "admin" ? "Administrateur" : "Utilisateur")),
            h("dt", {}, "Inscrit le"), h("dd", {}, fmtDate(user.createdAt)))),
        isAdmin() && h("section", { class: "card" }, h("h2", {}, "Administration"),
          h("p", { class: "muted" }, "Gérez les comptes et consultez l'activité de l'application."),
          h("p", {}, h("a", { class: "btn", href: "#/admin/users" }, "Utilisateurs"), " ",
            h("a", { class: "btn ghost", href: "#/admin/logs" }, "Logs"))))
    );
  }

  function accountView() {
    const user = Api.session.user;
    const name = h("input", { id: "name", value: user.displayName, maxlength: 64, required: true });
    const saveName = h("button", { class: "btn", type: "submit" }, "Enregistrer");
    const current = h("input", { id: "current", type: "password", autocomplete: "current-password", required: true });
    const next = h("input", { id: "next", type: "password", autocomplete: "new-password", minlength: 8, required: true });
    const confirm = h("input", { id: "confirm2", type: "password", autocomplete: "new-password", required: true });
    const savePwd = h("button", { class: "btn", type: "submit" }, "Changer le mot de passe");
    const pwdError = h("p", { class: "error", role: "alert" });

    render(
      h("h1", {}, "Mon compte"),
      h("p", { class: "muted" }, `Connecté en tant que ${user.username}`),
      h("div", { class: "grid" },
        h("form", { class: "card", onsubmit: (e) => {
          e.preventDefault();
          withBusy(saveName, async () => {
            try {
              const res = await Api.updateMe(name.value);
              Api.session.save(null, res.user);
              toast("Profil mis à jour");
            } catch (err) { toast(err.message, true); }
          });
        } }, h("h2", {}, "Profil"), field("Nom affiché", name), saveName),
        h("form", { class: "card", onsubmit: (e) => {
          e.preventDefault();
          pwdError.textContent = "";
          if (next.value !== confirm.value) { pwdError.textContent = "Les mots de passe ne correspondent pas"; return; }
          withBusy(savePwd, async () => {
            try {
              const res = await Api.changePassword(current.value, next.value);
              Api.session.save(res.token, res.user);
              e.target.reset();
              toast("Mot de passe modifié");
            } catch (err) { pwdError.textContent = err.message; }
          });
        } }, h("h2", {}, "Mot de passe"), field("Mot de passe actuel", current), field("Nouveau mot de passe", next),
          field("Confirmation", confirm), pwdError, savePwd))
    );
  }

  function pager(state, total, reload) {
    const pages = Math.max(1, Math.ceil(total / state.limit));
    return h("div", { class: "pager" },
      h("button", { class: "btn ghost small", type: "button", disabled: state.page <= 1, onclick: () => { state.page--; reload(); } }, "← Précédent"),
      h("span", { class: "muted" }, `Page ${state.page} / ${pages} · ${total} élément(s)`),
      h("button", { class: "btn ghost small", type: "button", disabled: state.page >= pages, onclick: () => { state.page++; reload(); } }, "Suivant →"));
  }

  function adminUsersView() {
    const state = { page: 1, limit: 20, q: "" };
    const search = h("input", { id: "q", type: "search", placeholder: "Identifiant ou nom" });
    const results = h("div");

    async function load() {
      try {
        const data = await Api.listUsers(state);
        const rows = data.items.map((u) => {
          // Le serveur indique les comptes protégés : le sien ("self") et l'admin principal ("main-admin")
          const locked = !!u.protected;
          const roleSelect = h("select", { "aria-label": `Rôle de ${u.username}`, disabled: locked, onchange: async (e) => {
            try {
              await Api.setRole(u.id, e.target.value);
              toast(`Rôle de ${u.username} mis à jour`);
            } catch (err) { toast(err.message, true); load(); }
          } },
            h("option", { value: "user", selected: u.role === "user" }, "Utilisateur"),
            h("option", { value: "admin", selected: u.role === "admin" }, "Administrateur"));
          const del = locked
            ? h("span", { class: "badge" }, u.protected === "self" ? "Votre compte" : "Protégé")
            : h("button", { class: "btn danger small", type: "button", onclick: () => withBusy(del, async () => {
              if (!confirm(`Supprimer définitivement « ${u.username} » et toutes ses données ?`)) return;
              try {
                await Api.deleteUser(u.id);
                toast(`${u.username} supprimé`);
                load();
              } catch (err) { toast(err.message, true); }
            }) }, "Supprimer");
          return h("tr", {},
            h("td", { "data-label": "Identifiant" }, h("strong", {}, u.username)),
            h("td", { "data-label": "Nom" }, u.displayName),
            h("td", { "data-label": "Rôle" }, roleSelect),
            h("td", { "data-label": "Inscription" }, fmtDate(u.createdAt)),
            h("td", { "data-label": "Connexion" }, fmtDate(u.lastLoginAt)),
            h("td", { class: "actions" }, del));
        });
        results.replaceChildren(
          h("div", { class: "table-wrap" }, h("table", { class: "responsive" },
            h("thead", {}, h("tr", {}, ["Identifiant", "Nom", "Rôle", "Inscription", "Dernière connexion", ""].map((t) => h("th", {}, t)))),
            h("tbody", {}, rows.length ? rows : h("tr", {}, h("td", { colspan: 6, class: "muted" }, "Aucun utilisateur"))))),
          pager(state, data.total, load));
      } catch (err) { toast(err.message, true); }
    }

    render(
      h("h1", {}, "Utilisateurs"),
      h("p", { class: "muted" }, "Gestion des comptes. La suppression efface l'utilisateur et toutes ses données."),
      h("section", { class: "card" },
        h("form", { class: "toolbar", onsubmit: (e) => { e.preventDefault(); state.q = search.value; state.page = 1; load(); } },
          field("Recherche", search), h("button", { class: "btn", type: "submit" }, "Filtrer")),
        results));
    load();
  }

  function adminLogsView() {
    const state = { page: 1, limit: 50, type: "", level: "", username: "", q: "" };
    const type = h("select", { id: "type" }, h("option", { value: "" }, "Tous"),
      h("option", { value: "request" }, "Requêtes"), h("option", { value: "activity" }, "Activités"), h("option", { value: "error" }, "Erreurs"));
    const level = h("select", { id: "level" }, h("option", { value: "" }, "Tous"),
      h("option", { value: "info" }, "Info"), h("option", { value: "warn" }, "Warn"), h("option", { value: "error" }, "Erreur"));
    const username = h("input", { id: "user", placeholder: "identifiant", autocapitalize: "none" });
    const q = h("input", { id: "text", type: "search", placeholder: "URL, message…" });
    const results = h("div");
    const typeLabel = { request: "Requête", activity: "Activité", error: "Erreur" };
    const levelLabel = { info: "Info", warn: "Warn", error: "Erreur" };
    // Date compacte sur deux lignes (jour / heure) pour une colonne la plus étroite possible
    const compactDate = (d) => {
      const date = new Date(d);
      return [
        h("span", {}, date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })),
        h("span", { class: "muted" }, date.toLocaleTimeString("fr-FR")),
      ];
    };

    async function load() {
      try {
        const data = await Api.listLogs(state);
        const rows = data.items.map((l) => h("tr", {},
          h("td", { "data-label": "Date", class: "col-date" }, compactDate(l.createdAt)),
          h("td", { "data-label": "Type", class: "col-tight" }, h("span", { class: `badge ${l.type}` }, typeLabel[l.type] || l.type)),
          h("td", { "data-label": "Niveau", class: "col-tight" }, h("span", { class: `badge level-${l.level}` }, levelLabel[l.level] || l.level)),
          h("td", { "data-label": "Utilisateur" }, l.username || "—"),
          h("td", { "data-label": "Détail", class: "mono" },
            l.type === "request" ? `${l.method} ${l.url} → ${l.status === 444 ? "444 sans réponse" : l.status} (${l.durationMs} ms)` : `${l.action ? `[${l.action}] ` : ""}${l.message}`),
          h("td", { "data-label": "Appelant", class: "mono col-tight" }, `${l.ip || "?"} · ${l.client || "?"}`)));
        results.replaceChildren(
          h("div", { class: "table-wrap" }, h("table", { class: "responsive" },
            h("thead", {}, h("tr", {}, ["Date", "Type", "Niveau", "Utilisateur", "Détail", "Appelant"].map((t) => h("th", {}, t)))),
            h("tbody", {}, rows.length ? rows : h("tr", {}, h("td", { colspan: 6, class: "muted" }, "Aucune entrée"))))),
          pager(state, data.total, load));
      } catch (err) { toast(err.message, true); }
    }

    render(
      h("h1", {}, "Logs de l'application"),
      h("section", { class: "card" },
        h("form", { class: "toolbar", onsubmit: (e) => {
          e.preventDefault();
          Object.assign(state, { page: 1, type: type.value, level: level.value, username: username.value, q: q.value });
          load();
        } },
          field("Type", type), field("Niveau", level), field("Utilisateur", username), field("Recherche", q),
          h("button", { class: "btn", type: "submit" }, "Filtrer"),
          h("button", { class: "btn ghost", type: "button", onclick: load }, "Rafraîchir")),
        results));
    load();
  }

  // ---------- Routeur ----------
  const routes = {
    login: { public: true, view: () => authView("login") },
    register: { public: true, view: () => authView("register") },
    home: { view: homeView },
    account: { view: accountView },
    "admin/users": { admin: true, view: adminUsersView },
    "admin/logs": { admin: true, view: adminLogsView },
  };

  async function router() {
    const name = location.hash.replace(/^#\/?/, "") || "home";
    const route = routes[name];
    const logged = !!Api.session.token;

    if (!route) { location.hash = logged ? "#/home" : "#/login"; return; }
    if (!route.public && !logged) { location.hash = "#/login"; return; }
    if (route.public && logged) { location.hash = "#/home"; return; }
    if (route.admin && !isAdmin()) { location.hash = "#/home"; return; }

    updateChrome(name);
    try {
      await route.view();
    } catch (err) {
      if (err.status !== 401) toast(err.message, true);
    }
  }

  window.addEventListener("hashchange", router);
  router();
})();
