"use strict";

(() => {
  const view = document.getElementById("view");
  const topbar = document.getElementById("topbar");
  const nav = document.getElementById("nav");
  const burger = document.getElementById("burger");
  const toastEl = document.getElementById("toast");
  const fab = document.getElementById("fab");

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

  // Confirmation intégrée (remplace window.confirm, bloqué par certains navigateurs embarqués)
  // Résout true si l'utilisateur confirme, false sinon (Annuler, Échap, clic hors de la fenêtre)
  function askConfirm(message, { title = "Confirmation", confirmLabel = "Confirmer", danger = false } = {}) {
    return new Promise((resolve) => {
      const cancelBtn = h("button", { class: "btn ghost", type: "button", onclick: () => dialog.close("cancel") }, "Annuler");
      const okBtn = h("button", { class: `btn${danger ? " danger-solid" : ""}`, type: "button", onclick: () => dialog.close("ok") }, confirmLabel);
      const dialog = h("dialog", { class: "confirm", "aria-labelledby": "confirm-title" },
        h("h2", { id: "confirm-title" }, title),
        h("p", {}, message),
        h("div", { class: "confirm-actions" }, cancelBtn, okBtn));
      const opener = document.activeElement;
      dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close("cancel"); });
      dialog.addEventListener("close", () => {
        dialog.remove();
        if (opener && opener.isConnected) opener.focus({ preventScroll: true });
        resolve(dialog.returnValue === "ok");
      });
      document.body.append(dialog);
      dialog.showModal();
      cancelBtn.focus();
    });
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

  // ---------- Courses : formats ----------
  const pad2 = (n) => String(n).padStart(2, "0");
  const fmtPace = (sec) => `${Math.floor(sec / 60)}:${pad2(Math.round(sec % 60))} /km`;
  function fmtDuration(sec) {
    const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    return hh ? `${hh}:${pad2(mm)}:${pad2(ss)}` : `${mm}:${pad2(ss)}`;
  }
  const fmtNum = (v, digits = 1) => v.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const fmtDay = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const fmtShortDay = (d) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  // Valeur d'un <input type="datetime-local"> dans le fuseau du navigateur
  const toLocalInput = (d) => {
    const date = new Date(d);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

  // Tendance : moyenne mobile de l'indice sur les TREND_WINDOW dernières courses
  const TREND_WINDOW = 5;
  function withTrend(runs) {
    return runs.map((r, i) => ({ ...r, trend: mean(runs.slice(Math.max(0, i - TREND_WINDOW + 1), i + 1).map((x) => x.performanceIndex)) }));
  }

  // Compare les TREND_WINDOW dernières courses aux TREND_WINDOW précédentes
  function analyse(runs) {
    const values = runs.map((r) => r.performanceIndex);
    const recent = values.slice(-TREND_WINDOW);
    const before = values.slice(-2 * TREND_WINDOW, -TREND_WINDOW);
    if (!before.length) return { status: "unknown", label: "Pas encore assez de courses", change: null };
    const change = ((mean(recent) - mean(before)) / mean(before)) * 100;
    if (change > 1.5) return { status: "up", label: "En progression", change };
    if (change < -1.5) return { status: "down", label: "En baisse", change };
    return { status: "flat", label: "Stable", change };
  }

  // Message de synthèse du tableau de bord : tendance, ou encouragement tant qu'elle ne peut pas être établie
  function trendMessage(runs) {
    if (!runs.length) return "Chaussez vos baskets et enregistrez votre première course pour lancer le suivi de votre performance !";
    const trend = analyse(runs);
    const pct = trend.change === null ? "" : fmtNum(Math.abs(trend.change));
    switch (trend.status) {
      case "up":
        return `Belle progression : votre indice moyen a gagné ${pct} % sur vos ${TREND_WINDOW} dernières courses par rapport aux précédentes. Continuez comme ça !`;
      case "down":
        return `Votre indice moyen a reculé de ${pct} % sur vos ${TREND_WINDOW} dernières courses par rapport aux précédentes. Fatigue, séances intenses ? Pensez à bien récupérer.`;
      case "flat":
        return `Performance stable sur vos ${TREND_WINDOW} dernières courses. Variez vos séances pour franchir un cap !`;
      default: {
        const missing = TREND_WINDOW + 1 - runs.length; // la tendance est calculée dès TREND_WINDOW + 1 courses
        return `Bravo pour ${runs.length > 1 ? `ces ${runs.length} courses` : "cette première course"} ! Encore ${missing} course${missing > 1 ? "s" : ""} et votre tendance pourra être établie : à vos baskets !`;
      }
    }
  }

  // ---------- Courses : saisie / modification ----------
  // Ouvre la fenêtre de saisie ; résout avec la course enregistrée, ou null si annulée
  function runDialog(run) {
    return new Promise((resolve) => {
      const editing = !!run;
      const num = (id, attrs) => h("input", { id, type: "number", required: true, ...attrs });
      const date = h("input", { id: "run-date", type: "datetime-local", required: true, value: toLocalInput(run ? run.date : Date.now()), max: toLocalInput(Date.now() + 86400000) });
      const distance = num("run-distance", { inputmode: "decimal", step: "0.01", min: "0.1", max: "400", placeholder: "10,0", value: run ? run.distanceKm : null });
      const dur = run ? run.durationSec : null;
      const hours = num("run-h", { inputmode: "numeric", min: "0", max: "168", placeholder: "h", "aria-label": "Heures", value: dur !== null ? Math.floor(dur / 3600) : null });
      const minutes = num("run-m", { inputmode: "numeric", min: "0", max: "59", placeholder: "min", "aria-label": "Minutes", value: dur !== null ? Math.floor((dur % 3600) / 60) : null });
      const seconds = num("run-s", { inputmode: "numeric", min: "0", max: "59", placeholder: "s", "aria-label": "Secondes", value: dur !== null ? dur % 60 : null });
      const heartRate = num("run-hr", { inputmode: "numeric", min: "40", max: "230", placeholder: "150", value: run ? run.avgHeartRate : null });
      // Pas d'inputmode « decimal » : le clavier iOS correspondant n'a pas de signe moins
      const temperature = num("run-temp", { step: "0.5", min: "-40", max: "55", placeholder: "15", value: run ? run.temperatureC : null });
      const elevation = num("run-elev", { inputmode: "numeric", min: "0", max: "20000", placeholder: "0", value: run ? run.elevationGainM : null });
      const notes = h("input", { id: "run-notes", maxlength: 500, placeholder: "Sortie longue, fractionné…", value: run ? run.notes : null });
      const error = h("p", { class: "error", role: "alert" });
      const previewPace = h("strong", {}, "—");
      const previewIndex = h("strong", { class: "preview-index" }, "—");
      const submit = h("button", { class: "btn", type: "submit" }, editing ? "Enregistrer" : "Ajouter la course");
      const cancel = h("button", { class: "btn ghost", type: "button", onclick: () => dialog.close() }, "Annuler");

      const n = (input) => (input.value === "" ? NaN : Number(input.value.replace(",", ".")));
      function payload() {
        return {
          date: date.value ? new Date(date.value).toISOString() : "",
          distanceKm: n(distance),
          durationSec: (n(hours) || 0) * 3600 + (n(minutes) || 0) * 60 + (n(seconds) || 0),
          avgHeartRate: n(heartRate),
          temperatureC: n(temperature),
          elevationGainM: elevation.value === "" ? 0 : n(elevation),
          notes: notes.value,
        };
      }

      // Aperçu calculé par l'API (même formule que l'enregistrement), dès que la saisie est complète
      let previewTimer, previewSeq = 0;
      function refreshPreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(async () => {
          const p = payload();
          const seq = ++previewSeq;
          if (!(p.distanceKm > 0 && p.durationSec > 0)) { previewPace.textContent = "—"; previewIndex.textContent = "—"; return; }
          previewPace.textContent = fmtPace(p.durationSec / p.distanceKm);
          if ([p.avgHeartRate, p.temperatureC].some(Number.isNaN)) { previewIndex.textContent = "—"; return; }
          try {
            const { performance } = await Api.previewRun(p);
            if (seq === previewSeq) previewIndex.textContent = fmtNum(performance.performanceIndex);
          } catch { if (seq === previewSeq) previewIndex.textContent = "—"; }
        }, 250);
      }

      const form = h("form", { class: "run-form", novalidate: true, oninput: refreshPreview, onsubmit: (e) => {
        e.preventDefault();
        error.textContent = "";
        const p = payload();
        if (Number.isNaN(p.temperatureC)) { error.textContent = "La température est obligatoire"; return; }
        withBusy(submit, async () => {
          try {
            const res = editing ? await Api.updateRun(run.id, p) : await Api.createRun(p);
            saved = res.run;
            dialog.close();
          } catch (err) { error.textContent = err.message; }
        });
      } },
        field("Date et heure", date, "full"),
        field("Distance (km)", distance),
        h("div", { class: "field" }, h("label", { for: "run-h" }, "Durée (h : min : s)"),
          h("div", { class: "duration" }, hours, minutes, seconds)),
        field("FC moyenne (bpm)", heartRate),
        field("Température (°C)", temperature),
        field("Dénivelé positif (m)", elevation),
        field("Notes (facultatif)", notes),
        h("div", { class: "run-preview full", "aria-live": "polite" },
          h("div", {}, h("span", { class: "muted" }, "Allure moyenne"), previewPace),
          h("div", {}, h("span", { class: "muted" }, "Indice de performance"), previewIndex)),
        h("div", { class: "full" }, error),
        h("div", { class: "confirm-actions full" }, cancel, submit));

      let saved = null;
      const dialog = h("dialog", { class: "confirm run-dialog", "aria-labelledby": "run-dialog-title" },
        h("h2", { id: "run-dialog-title" }, editing ? "Modifier la course" : "Nouvelle course"), form);
      const opener = document.activeElement;
      dialog.addEventListener("close", () => {
        clearTimeout(previewTimer);
        dialog.remove();
        if (opener && opener.isConnected) opener.focus({ preventScroll: true });
        resolve(saved);
      });
      document.body.append(dialog);
      dialog.showModal();
      if (editing) refreshPreview();
      (editing ? date : distance).focus();
    });
  }

  // ---------- Objectif d'indice : course « type » visée, mêmes variables que l'indice ----------
  // Résout avec l'utilisateur mis à jour (objectif enregistré ou supprimé), ou null si annulée
  function targetDialog(target) {
    return new Promise((resolve) => {
      const num = (id, attrs) => h("input", { id, type: "number", required: true, ...attrs });
      const dur = target ? target.durationSec : null;
      const distance = num("target-distance", { inputmode: "decimal", step: "0.01", min: "0.1", max: "400", placeholder: "10,0", value: target ? target.distanceKm : null });
      const hours = num("target-h", { inputmode: "numeric", min: "0", max: "168", placeholder: "h", "aria-label": "Heures", value: dur !== null ? Math.floor(dur / 3600) : null });
      const minutes = num("target-m", { inputmode: "numeric", min: "0", max: "59", placeholder: "min", "aria-label": "Minutes", value: dur !== null ? Math.floor((dur % 3600) / 60) : null });
      const seconds = num("target-s", { inputmode: "numeric", min: "0", max: "59", placeholder: "s", "aria-label": "Secondes", value: dur !== null ? dur % 60 : null });
      const heartRate = num("target-hr", { inputmode: "numeric", min: "40", max: "230", placeholder: "150", value: target ? target.avgHeartRate : null });
      const temperature = num("target-temp", { step: "0.5", min: "-40", max: "55", placeholder: "15", value: target ? target.temperatureC : null });
      const elevation = num("target-elev", { inputmode: "numeric", min: "0", max: "20000", placeholder: "0", value: target ? target.elevationGainM : null });
      const error = h("p", { class: "error", role: "alert" });
      const previewPace = h("strong", {}, "—");
      const previewIndex = h("strong", { class: "preview-index" }, "—");
      const submit = h("button", { class: "btn", type: "submit" }, "Enregistrer");
      const cancel = h("button", { class: "btn ghost", type: "button", onclick: () => dialog.close() }, "Annuler");
      const remove = target && h("button", { class: "btn danger", type: "button", onclick: () => withBusy(remove, async () => {
        try { result = (await Api.deleteTarget()).user; dialog.close(); } catch (err) { error.textContent = err.message; }
      }) }, "Supprimer");

      const n = (input) => (input.value === "" ? NaN : Number(input.value.replace(",", ".")));
      const payload = () => ({
        distanceKm: n(distance),
        durationSec: (n(hours) || 0) * 3600 + (n(minutes) || 0) * 60 + (n(seconds) || 0),
        avgHeartRate: n(heartRate),
        temperatureC: n(temperature),
        elevationGainM: elevation.value === "" ? 0 : n(elevation),
      });

      let previewTimer, previewSeq = 0;
      function refreshPreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(async () => {
          const p = payload();
          const seq = ++previewSeq;
          if (!(p.distanceKm > 0 && p.durationSec > 0)) { previewPace.textContent = "—"; previewIndex.textContent = "—"; return; }
          previewPace.textContent = fmtPace(p.durationSec / p.distanceKm);
          if ([p.avgHeartRate, p.temperatureC].some(Number.isNaN)) { previewIndex.textContent = "—"; return; }
          try {
            const { performance } = await Api.previewRun(p);
            if (seq === previewSeq) previewIndex.textContent = fmtNum(performance.performanceIndex);
          } catch { if (seq === previewSeq) previewIndex.textContent = "—"; }
        }, 250);
      }

      const form = h("form", { class: "run-form", novalidate: true, oninput: refreshPreview, onsubmit: (e) => {
        e.preventDefault();
        error.textContent = "";
        const p = payload();
        if (Number.isNaN(p.temperatureC)) { error.textContent = "La température est obligatoire"; return; }
        withBusy(submit, async () => {
          try { result = (await Api.setTarget(p)).user; dialog.close(); } catch (err) { error.textContent = err.message; }
        });
      } },
        h("p", { class: "muted full target-intro" }, "Décrivez la course que vous visez : son indice sera tracé en pointillés sur le graphique."),
        field("Distance (km)", distance),
        h("div", { class: "field" }, h("label", { for: "target-h" }, "Durée (h : min : s)"),
          h("div", { class: "duration" }, hours, minutes, seconds)),
        field("FC moyenne (bpm)", heartRate),
        field("Température (°C)", temperature),
        field("Dénivelé positif (m)", elevation),
        h("div", { class: "run-preview full", "aria-live": "polite" },
          h("div", {}, h("span", { class: "muted" }, "Allure visée"), previewPace),
          h("div", {}, h("span", { class: "muted" }, "Indice objectif"), previewIndex)),
        h("div", { class: "full" }, error),
        h("div", { class: "confirm-actions full" }, remove, cancel, submit));

      let result = null;
      const dialog = h("dialog", { class: "confirm run-dialog", "aria-labelledby": "target-dialog-title" },
        h("h2", { id: "target-dialog-title" }, "Objectif d'indice"), form);
      const opener = document.activeElement;
      dialog.addEventListener("close", () => {
        clearTimeout(previewTimer);
        dialog.remove();
        if (opener && opener.isConnected) opener.focus({ preventScroll: true });
        resolve(result);
      });
      document.body.append(dialog);
      dialog.showModal();
      if (target) refreshPreview();
      distance.focus();
    });
  }

  // ---------- Courses : graphique d'évolution (SVG, sans bibliothèque) ----------
  const SVG_NS = "http://www.w3.org/2000/svg";
  function s(tag, attrs, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== undefined && v !== null) el.setAttribute(k, v);
    for (const child of children) el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return el;
  }

  function niceStep(span, count) {
    const raw = span / count;
    const mag = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => st >= raw);
  }

  // points : [{ date, performanceIndex, trend, avgPaceSecPerKm, avgHeartRate, ... }] dans l'ordre chronologique
  // targetIndex : indice objectif (ligne horizontale en pointillés), ou null
  function perfChart(points, targetIndex = null) {
    const wrap = h("div", { class: "chart" });
    const tooltip = h("div", { class: "chart-tip", role: "status" });
    tooltip.hidden = true;
    let selected = null;
    let geometry = null;

    function draw() {
      const W = Math.max(280, wrap.clientWidth || 600);
      const H = W < 520 ? 230 : 300;
      const m = { l: 40, r: 14, t: 14, b: 30 };
      const pw = W - m.l - m.r, ph = H - m.t - m.b;
      const values = points.flatMap((p) => [p.performanceIndex, p.trend]);
      if (targetIndex !== null) values.push(targetIndex);
      let lo = Math.min(...values), hi = Math.max(...values);
      if (hi - lo < 4) { lo -= 2; hi += 2; }
      const step = niceStep(hi - lo, 4);
      lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
      const n = points.length;
      // Axe des dates linéaire : la position dépend de la date, pas du rang de la course
      const times = points.map((p) => new Date(p.date).getTime());
      const t0 = times[0], span = times[n - 1] - t0;
      const xt = (t) => m.l + (span ? ((t - t0) / span) * pw : pw / 2);
      const x = (i) => xt(times[i]);
      const y = (v) => m.t + ph - ((v - lo) / (hi - lo)) * ph;

      const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart-svg", tabindex: "0", role: "img",
        "aria-label": `Évolution de l'indice de performance sur ${n} course(s). Flèches gauche et droite pour parcourir les courses.` });
      const grid = s("g", { class: "chart-grid" });
      for (let v = lo; v <= hi + step / 2; v += step) {
        grid.append(s("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }),
          s("text", { x: m.l - 8, y: y(v), class: "chart-ytick" }, fmtNum(v, step < 1 ? 1 : 0)));
      }
      // Graduations à intervalle régulier (en jours), espacées d'au moins 62 px pour ne jamais se chevaucher
      if (span) {
        const DAY = 86400000;
        const maxTicks = Math.max(2, Math.floor(pw / 62));
        const stepDays = [1, 2, 3, 7, 14, 28, 56, 91, 182, 365].find((d) => span / (d * DAY) <= maxTicks) || 730;
        const first = new Date(t0);
        first.setHours(0, 0, 0, 0);
        if (first.getTime() < t0) first.setDate(first.getDate() + 1);
        for (const d = first; d.getTime() <= times[n - 1]; d.setDate(d.getDate() + stepDays)) {
          grid.append(s("text", { x: xt(d.getTime()), y: H - 8, class: "chart-xtick" }, fmtShortDay(d)));
        }
      } else {
        grid.append(s("text", { x: x(0), y: H - 8, class: "chart-xtick" }, fmtShortDay(points[0].date)));
      }
      const line = (key) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
      const cross = s("line", { class: "chart-cross", y1: m.t, y2: m.t + ph, visibility: "hidden" });
      const dots = s("g", { class: "chart-dots" }, ...points.map((p, i) => s("circle", { cx: x(i), cy: y(p.performanceIndex), r: 4 })));
      const endTrend = points[n - 1];
      const target = targetIndex !== null && s("g", { class: "chart-target" },
        s("line", { x1: m.l, x2: W - m.r, y1: y(targetIndex), y2: y(targetIndex) }),
        s("text", { x: W - m.r, y: y(targetIndex) - 5 }, `Objectif ${fmtNum(targetIndex)}`));
      svg.append(grid, ...(target ? [target] : []), cross,
        s("path", { d: line("performanceIndex"), class: "chart-line index" }),
        s("path", { d: line("trend"), class: "chart-line trend" }),
        dots,
        s("circle", { class: "chart-trend-end", cx: x(n - 1), cy: y(endTrend.trend), r: 4 }));
      wrap.replaceChildren(svg, tooltip);
      geometry = { svg, cross, dots, x, y, m, W, pw, n };
      if (selected !== null) select(Math.min(selected, n - 1));
    }

    function select(i) {
      selected = i;
      const { cross, dots, x, W } = geometry;
      const p = points[i];
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      [...dots.children].forEach((c, k) => c.classList.toggle("active", k === i));
      const row = (cls, value, label) => h("div", { class: "tip-row" }, h("span", { class: `tip-key ${cls}` }), h("strong", {}, value), h("span", { class: "muted" }, label));
      tooltip.replaceChildren(
        h("div", { class: "tip-date" }, fmtDay(p.date)),
        row("index", fmtNum(p.performanceIndex), "indice"),
        row("trend", fmtNum(p.trend), `tendance (${TREND_WINDOW} courses)`),
        ...(targetIndex !== null ? [row("target", fmtNum(targetIndex), "objectif")] : []),
        h("div", { class: "tip-meta muted" }, `${fmtNum(p.distanceKm, 2)} km · ${fmtPace(p.avgPaceSecPerKm)} · ${p.avgHeartRate} bpm · ${fmtNum(p.temperatureC)} °C · D+ ${p.elevationGainM} m`));
      tooltip.hidden = false;
      // Infobulle du côté opposé au point pour ne pas le masquer
      const left = x(i) > W / 2;
      tooltip.classList.toggle("left", left);
      tooltip.style.left = left ? "" : `${x(i) + 12}px`;
      tooltip.style.right = left ? `${W - x(i) + 12}px` : "";
    }

    function hide() {
      selected = null;
      if (!geometry) return;
      geometry.cross.setAttribute("visibility", "hidden");
      [...geometry.dots.children].forEach((c) => c.classList.remove("active"));
      tooltip.hidden = true;
    }

    // Course la plus proche du pointeur (les points ne sont plus régulièrement espacés)
    function nearest(e) {
      const { svg, x, n } = geometry;
      const rect = svg.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * geometry.W;
      let best = 0;
      for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
      return best;
    }

    wrap.addEventListener("pointermove", (e) => { if (geometry) select(nearest(e)); });
    wrap.addEventListener("pointerdown", (e) => { if (geometry) select(nearest(e)); });
    wrap.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") hide(); });
    wrap.addEventListener("keydown", (e) => {
      if (!geometry) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const d = e.key === "ArrowRight" ? 1 : -1;
        select(selected === null ? (d > 0 ? 0 : geometry.n - 1) : Math.max(0, Math.min(geometry.n - 1, selected + d)));
      } else if (e.key === "Escape") hide();
    });
    wrap.addEventListener("focusout", hide);

    // Redessin à la taille du conteneur (rotation d'écran, redimensionnement)
    let lastWidth = 0;
    new ResizeObserver(() => {
      if (wrap.clientWidth && wrap.clientWidth !== lastWidth) { lastWidth = wrap.clientWidth; draw(); }
    }).observe(wrap);
    return wrap;
  }

  // Icônes des boutons d'action (tracés au trait, couleur du texte du bouton)
  const ICONS = {
    edit: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"],
    target: ["M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0", "M6 12a6 6 0 1 0 12 0a6 6 0 1 0 -12 0", "M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"],
    trash: ["M3 6h18", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6", "M10 11v6", "M14 11v6"],
  };
  const icon = (name) => s("svg", { class: "icon", viewBox: "0 0 24 24", width: 18, height: 18, "aria-hidden": "true", focusable: "false" },
    ...ICONS[name].map((d) => s("path", { d })));

  async function openNewRun() {
    const run = await runDialog();
    if (!run) return;
    toast(`Course ajoutée · indice ${fmtNum(run.performanceIndex)}`);
    const name = currentRoute();
    if (name === "home" || name === "runs") router();
    else location.hash = "#/home";
  }

  // ---------- Session / navigation ----------
  const isAdmin = () => Api.session.user && Api.session.user.role === "admin";

  function updateChrome(route) {
    const logged = !!Api.session.token;
    topbar.hidden = !logged;
    fab.hidden = !logged;
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

  fab.addEventListener("click", openNewRun);

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
    const remember = h("input", { id: "remember", type: "checkbox", checked: true });
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
            ? await Api.login(username.value, password.value, remember.checked)
            : await Api.register(username.value, displayName.value, password.value);
          Api.session.save(res.token, res.user, isLogin && remember.checked);
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
      isLogin && h("label", { class: "check full", for: "remember" }, remember, "Rester connecté"),
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

  // Tableau de bord : évolution de l'indice de performance course après course
  async function homeView() {
    const [{ user }, data] = await Promise.all([Api.me(), Api.listRuns({ order: "asc", limit: 500 })]);
    Api.session.save(null, user);
    updateChrome("home");
    const runs = withTrend(data.items);

    const hero = h("section", { class: "hero" },
      h("h1", {}, `Bienvenue ${user.displayName} !`),
      h("p", {}, trendMessage(runs)));

    if (!runs.length) {
      render(hero,
        h("section", { class: "card empty" },
          h("h2", {}, "Aucune course enregistrée"),
          h("button", { class: "btn", type: "button", onclick: openNewRun }, "+ Ajouter une course")));
      return;
    }

    const last = runs[runs.length - 1];
    const prev = runs[runs.length - 2];
    const trend = analyse(runs);
    const best = runs.reduce((a, b) => (b.performanceIndex > a.performanceIndex ? b : a));
    const signed = (v, unit = "") => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${fmtNum(Math.abs(v))}${unit}`;
    const icons = { up: "▲", down: "▼", flat: "▶", unknown: "…" };

    const tiles = h("div", { class: "tiles" },
      h("section", { class: "tile" },
        h("span", { class: "tile-label" }, "Dernière course"),
        h("span", { class: "tile-value" }, fmtNum(last.performanceIndex)),
        h("span", { class: "tile-sub muted" }, prev ? `${signed(last.performanceIndex - prev.performanceIndex)} vs la précédente` : fmtDay(last.date))),
      h("section", { class: "tile" },
        h("span", { class: "tile-label" }, "Tendance"),
        h("span", { class: `tile-status ${trend.status}` }, h("span", { "aria-hidden": "true" }, icons[trend.status]), trend.label),
        h("span", { class: "tile-sub muted" }, trend.change === null
          ? `Comparaison dès ${TREND_WINDOW + 1} courses`
          : `${signed(trend.change, " %")} : ${TREND_WINDOW} dernières vs ${TREND_WINDOW} précédentes`)),
      h("section", { class: "tile" },
        h("span", { class: "tile-label" }, "Meilleur indice"),
        h("span", { class: "tile-value" }, fmtNum(best.performanceIndex)),
        h("span", { class: "tile-sub muted" }, fmtDay(best.date))),
      h("section", { class: "tile" },
        h("span", { class: "tile-label" }, "Courses"),
        h("span", { class: "tile-value" }, String(runs.length)),
        h("a", { class: "tile-sub", href: "#/runs" }, "Voir la liste →")));

    // Période affichée : la tendance est calculée sur tout l'historique, puis découpée
    const periods = [["15", "15 dernières"], ["30", "30 dernières"], ["all", "Toutes"]];
    const period = h("select", { id: "period", "aria-label": "Courses affichées" },
      periods.map(([v, label]) => h("option", { value: v, selected: v === (runs.length > 30 ? "30" : "all") }, label)));
    // Objectif : indice d'une course « type » visée, enregistré sur le profil
    let target = user.target;
    const chartHolder = h("div");
    const targetLegend = h("span", {}, h("span", { class: "legend-key target" }), "");
    const targetBtn = h("button", { class: "btn ghost icon-btn target-btn", type: "button" }, icon("target"));
    const showChart = () => {
      chartHolder.replaceChildren(perfChart(period.value === "all" ? runs : runs.slice(-Number(period.value)), target ? target.performanceIndex : null));
      targetLegend.hidden = !target;
      targetLegend.lastChild.textContent = target ? `Objectif (${fmtNum(target.performanceIndex)})` : "";
      const label = target ? `Modifier l'objectif d'indice (${fmtNum(target.performanceIndex)})` : "Définir un objectif d'indice";
      targetBtn.title = label;
      targetBtn.setAttribute("aria-label", label);
      targetBtn.classList.toggle("active", !!target);
    };
    targetBtn.addEventListener("click", async () => {
      const updated = await targetDialog(target);
      if (!updated) return;
      Api.session.save(null, updated);
      target = updated.target;
      toast(target ? `Objectif fixé · indice ${fmtNum(target.performanceIndex)}` : "Objectif supprimé");
      showChart();
    });
    period.addEventListener("change", showChart);
    showChart();

    render(hero, tiles,
      h("section", { class: "card" },
        h("div", { class: "chart-head" },
          h("div", {}, h("h2", {}, "Évolution de l'indice de performance")),
          h("div", { class: "chart-tools" }, period, targetBtn)),
        chartHolder,
        h("div", { class: "legend" },
          h("span", {}, h("span", { class: "legend-key index" }), "Indice par course"),
          h("span", {}, h("span", { class: "legend-key trend" }), `Tendance (moyenne des ${TREND_WINDOW} dernières)`),
          targetLegend)));
  }

  // Explication complète du calcul de l'indice (menu « Explication »)
  function explanationView() {
    const table = (head, rows) => h("div", { class: "table-wrap" }, h("table", { class: "explain-table" },
      h("thead", {}, h("tr", {}, head.map((t) => h("th", {}, t)))),
      h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c) => h("td", {}, c)))))));
    const formula = (text) => h("p", { class: "mono formula" }, text);

    render(
      h("h1", {}, "Explication de l'indice de performance"),
      h("p", { class: "muted" }, "Comment RunX évalue votre progression course après course."),
      h("section", { class: "card explain" },
        h("h2", {}, "L'idée de départ"),
        h("p", {}, "L'indice mesure votre efficacité : la vitesse que vous tenez pour chaque battement de cœur. Courir plus vite ne suffit pas : si votre cœur doit battre beaucoup plus fort pour y parvenir, vous n'êtes pas plus performant, vous forcez davantage."),
        formula("Indice = 100 × vitesse équivalente plat (m/min) × correction température ÷ FC moyenne (bpm)"),
        h("p", {}, "Plus l'indice est élevé, plus vous êtes performant. Il se construit en quatre étapes.")),
      h("section", { class: "card explain" },
        h("h2", {}, "1. Vitesse équivalente plat : le dénivelé"),
        h("p", {}, "Monter coûte de l'énergie. Chaque 100 m de dénivelé positif compte comme 1 km supplémentaire à plat (règle du « kilomètre-effort » utilisée en trail)."),
        formula("distance effort (km) = distance + D+ ÷ 100\nvitesse (m/min) = distance effort × 1000 ÷ durée (min)"),
        h("p", {}, "Exemple : 10 km avec 150 m de D+ comptent comme 11,5 km à plat. Une sortie vallonnée n'est donc pas pénalisée par rapport à une sortie à plat.")),
      h("section", { class: "card explain" },
        h("h2", {}, "2. Correction de la température"),
        h("p", {}, "La chaleur fait monter la fréquence cardiaque (le corps envoie du sang vers la peau pour se refroidir) ; le froid a un effet plus faible. L'indice est relevé quand les conditions sont difficiles :"),
        table(["Température", "Facteur"], [
          ["De 5 à 12 °C (zone idéale)", "× 1"],
          ["Au-dessus de 12 °C", "+ 0,4 % par °C (25 °C → × 1,052)"],
          ["En dessous de 5 °C", "+ 0,2 % par °C (−5 °C → × 1,02)"],
        ]),
        h("p", { class: "muted" }, "Ces coefficients reprennent l'ordre de grandeur observé sur les marathons : environ 0,3 à 0,4 % de performance perdue par degré au-delà de 10-15 °C.")),
      h("section", { class: "card explain" },
        h("h2", {}, "3. Division par la fréquence cardiaque moyenne"),
        h("p", {}, "Si votre vitesse augmente de 3 % mais votre fréquence cardiaque de 8 %, le rapport baisse : l'indice diminue, ce n'est pas une progression. À l'inverse, la même allure tenue avec un cœur plus calme fait monter l'indice.")),
      h("section", { class: "card explain" },
        h("h2", {}, "4. Multiplication par 100"),
        h("p", {}, "Elle sert uniquement à obtenir un nombre lisible (de l'ordre de 100 à 160) plutôt que 1,35.")),
      h("section", { class: "card explain" },
        h("h2", {}, "Exemples"),
        table(["Course", "Calcul", "Indice"], [
          ["10 km en 50:00, plat, 15 °C, 150 bpm", "200 × 1,012 ÷ 150 × 100", "134,9"],
          ["Plus rapide (48:20) mais 162 bpm", "206,9 × 1,012 ÷ 162 × 100", "129,2 ↓"],
          ["Même allure qu'au départ, 145 bpm", "200 × 1,012 ÷ 145 × 100", "139,6 ↑"],
          ["50:00 avec 100 m de D+, 25 °C, 155 bpm", "220 × 1,052 ÷ 155 × 100", "149,3"],
        ]),
        h("p", {}, "La deuxième ligne illustre une fausse progression : l'allure s'améliore, mais le cœur s'emballe davantage. La troisième est une vraie progression. La dernière montre qu'une sortie lente au chrono peut être excellente une fois le dénivelé et la chaleur pris en compte.")),
      h("section", { class: "card explain" },
        h("h2", {}, "La tendance du tableau de bord"),
        h("p", {}, `Une course isolée varie selon la fatigue, le sommeil ou le vent. Le tableau de bord compare donc la moyenne de vos ${TREND_WINDOW} dernières courses à celle des ${TREND_WINDOW} précédentes :`),
        h("ul", {},
          h("li", {}, h("strong", {}, "En progression"), " : au-delà de +1,5 %"),
          h("li", {}, h("strong", {}, "Stable"), " : entre −1,5 % et +1,5 %"),
          h("li", {}, h("strong", {}, "En baisse"), " : en deçà de −1,5 %")),
        h("p", {}, `Sur le graphique, la courbe orange est la moyenne de vos ${TREND_WINDOW} dernières courses à chaque date.`)),
      h("section", { class: "card explain" },
        h("h2", {}, "Limites à connaître"),
        h("ul", {},
          h("li", {}, "Le type de séance compte : un fractionné ne fait pas monter la fréquence cardiaque moyenne comme une sortie en endurance. Les comparaisons sont plus fiables entre séances similaires."),
          h("li", {}, "La fréquence cardiaque est propre à chacun : l'indice sert à vous comparer à vous-même, pas à d'autres coureurs."),
          h("li", {}, "Les coefficients de dénivelé et de température sont des moyennes générales, pas calibrés sur vos données."))));
  }

  // Liste des courses : modification et suppression
  function runsView() {
    const state = { page: 1, limit: 20 };
    const results = h("div");

    async function load() {
      try {
        const data = await Api.listRuns(state);
        if (!data.items.length && state.page > 1) { state.page--; return load(); }
        const rows = data.items.map((r) => {
          const when = fmtDay(r.date);
          const edit = h("button", { class: "btn ghost icon-btn", type: "button", title: "Modifier", "aria-label": `Modifier la course du ${when}`, onclick: async () => {
            const saved = await runDialog(r);
            if (saved) { toast(`Course modifiée · indice ${fmtNum(saved.performanceIndex)}`); load(); }
          } }, icon("edit"));
          const del = h("button", { class: "btn danger icon-btn", type: "button", title: "Supprimer", "aria-label": `Supprimer la course du ${when}`, onclick: () => withBusy(del, async () => {
            const ok = await askConfirm(`Supprimer la course du ${fmtDay(r.date)} (${fmtNum(r.distanceKm, 2)} km) ? Cette action est irréversible.`,
              { title: "Supprimer la course", confirmLabel: "Supprimer", danger: true });
            if (!ok) return;
            try {
              await Api.deleteRun(r.id);
              toast("Course supprimée");
              load();
            } catch (err) { toast(err.message, true); }
          }) }, icon("trash"));
          return h("tr", {},
            // Date et heure regroupées : une seule valeur à côté du libellé en affichage cartes
            h("td", { "data-label": "Date", class: "col-date" }, h("span", {},
              h("span", {}, fmtDay(r.date)), " ",
              h("span", { class: "muted" }, new Date(r.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })))),
            h("td", { "data-label": "Distance", class: "num" }, `${fmtNum(r.distanceKm, 2)} km`),
            h("td", { "data-label": "Durée", class: "num" }, fmtDuration(r.durationSec)),
            h("td", { "data-label": "Allure", class: "num" }, fmtPace(r.avgPaceSecPerKm)),
            h("td", { "data-label": "FC moy.", class: "num" }, `${r.avgHeartRate} bpm`),
            h("td", { "data-label": "Temp.", class: "num" }, `${fmtNum(r.temperatureC)} °C`),
            h("td", { "data-label": "D+", class: "num" }, `${r.elevationGainM} m`),
            h("td", { "data-label": "Indice", class: "num" }, h("strong", {}, fmtNum(r.performanceIndex))),
            h("td", { class: "actions" }, edit, del));
        });
        results.replaceChildren(
          h("div", { class: "table-wrap" }, h("table", { class: "responsive runs-table" },
            h("thead", {}, h("tr", {}, ["Date", "Distance", "Durée", "Allure", "FC moy.", "Temp.", "D+", "Indice", ""].map((t) => h("th", {}, t)))),
            h("tbody", {}, rows.length ? rows : h("tr", {}, h("td", { colspan: 9, class: "muted" }, "Aucune course enregistrée"))))),
          ...(data.total > state.limit ? [pager(state, data.total, load)] : []));
      } catch (err) { toast(err.message, true); }
    }

    render(
      h("div", { class: "page-head" },
        h("div", {}, h("h1", {}, "Mes courses"), h("p", { class: "muted" }, "Toutes vos courses enregistrées, de la plus récente à la plus ancienne.")),
        h("button", { class: "btn", type: "button", onclick: openNewRun }, "+ Nouvelle course")),
      h("section", { class: "card" }, results));
    load();
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
    const delPwd = h("input", { id: "delete-password", type: "password", autocomplete: "current-password", required: true });
    const delBtn = h("button", { class: "btn danger", type: "submit" }, "Supprimer mon compte");
    const delError = h("p", { class: "error", role: "alert" });

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
          field("Confirmation", confirm), pwdError, savePwd)),
      h("form", { class: "card danger-zone", onsubmit: (e) => {
        e.preventDefault();
        delError.textContent = "";
        if (!delPwd.value) { delError.textContent = "Saisissez votre mot de passe pour confirmer"; return; }
        withBusy(delBtn, async () => {
          const ok = await askConfirm("Votre compte, toutes vos courses et votre objectif seront supprimés définitivement. Cette action est irréversible.",
            { title: "Supprimer mon compte", confirmLabel: "Supprimer définitivement", danger: true });
          if (!ok) return;
          try {
            await Api.deleteAccount(delPwd.value);
            Api.session.clear();
            toast("Compte supprimé");
            location.hash = "#/login";
          } catch (err) { delError.textContent = err.message; }
        });
      } }, h("h2", {}, "Supprimer mon compte"),
        h("p", { class: "muted" }, "Supprime définitivement votre compte et toutes vos données (courses, objectif). Vos autres appareils seront déconnectés."),
        field("Mot de passe", delPwd), delError, delBtn)
    );
  }

  function pager(state, total, reload) {
    const pages = Math.max(1, Math.ceil(total / state.limit));
    // Changement de page : retour en haut de l'écran une fois la nouvelle page affichée
    const go = async (delta) => {
      state.page += delta;
      await reload();
      window.scrollTo(0, 0);
    };
    return h("div", { class: "pager" },
      h("button", { class: "btn ghost small", type: "button", disabled: state.page <= 1, onclick: () => go(-1) }, "← Précédent"),
      h("span", { class: "muted" }, `Page ${state.page} / ${pages} · ${total} élément(s)`),
      h("button", { class: "btn ghost small", type: "button", disabled: state.page >= pages, onclick: () => go(1) }, "Suivant →"));
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
              const ok = await askConfirm(`Supprimer définitivement « ${u.username} » et toutes ses données ? Cette action est irréversible.`,
                { title: "Supprimer l'utilisateur", confirmLabel: "Supprimer", danger: true });
              if (!ok) return;
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
          // IP et client sur deux lignes : une IPv6 peut se couper sans élargir le tableau
          h("td", { "data-label": "Appelant", class: "mono col-caller" },
            h("div", {}, h("span", {}, l.ip || "?"), h("span", { class: "muted" }, l.client || "?")))));
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
    runs: { view: runsView },
    explication: { view: explanationView },
    account: { view: accountView },
    "admin/users": { admin: true, view: adminUsersView },
    "admin/logs": { admin: true, view: adminLogsView },
  };

  const currentRoute = () => location.hash.replace(/^#\/?/, "") || "home";

  async function router() {
    const name = currentRoute();
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
