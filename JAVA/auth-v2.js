/* Atipria v2 account system: Firebase auth + user profile + plan-aware UI */
(function () {
  const USERS_CONFIG = {
    apiKey: "AIzaSyAh7N979o2VZ5tJGsbFkBRUZcJwISxfCoI",
    authDomain: "atipria-users.firebaseapp.com",
    projectId: "atipria-users",
    storageBucket: "atipria-users.appspot.com",
    messagingSenderId: "277286791911",
    appId: "1:277286791911:web:827ddeffe9d217b8521042",
    measurementId: "G-GMH2GCM7JY"
  };

  const WEB_CONFIG = {
    apiKey: "AIzaSyChVy3pcEIBaUIAw3yXyABozLzeuAtMKNE",
    authDomain: "atipria-web.firebaseapp.com",
    projectId: "atipria-web",
    storageBucket: "atipria-web.appspot.com",
    messagingSenderId: "817765154697",
    appId: "1:817765154697:web:c50354276e11368c4fab58",
    measurementId: "G-K3LCQT6MZM"
  };

  if (!window.firebase) {
    console.warn("Firebase SDK was not loaded. Account features are disabled.");
    return;
  }

  const rootPrefix = location.pathname.includes("/dashboard/") ? "../" : "";
  const pickDefined = obj => Object.fromEntries(Object.entries(obj).filter(([,v]) => v !== undefined && v !== null && v !== ""));

  function getOrInitApp(name, config) {
    try { return firebase.app(name); }
    catch (_) { return firebase.initializeApp(config, name); }
  }

  const usersApp = getOrInitApp("usersApp", USERS_CONFIG);
  const usersAuth = usersApp.auth();
  const usersDB = usersApp.firestore();

  let webApp, webDB, webAuth;
  try {
    webApp = firebase.apps.find(a => a.name === "[DEFAULT]") || firebase.initializeApp(WEB_CONFIG);
    webDB = webApp.firestore();
    webAuth = webApp.auth();
  } catch (e) {
    console.warn("Web Firebase app not available:", e);
  }

  window.AtipriaAccount = { usersAuth, usersDB, webDB };

  function planLabel(raw) {
    const p = (raw || "Free Plan").toString();
    if (/enterprise/i.test(p)) return "Enterprise Plan";
    if (/business/i.test(p)) return "Business Plan";
    if (/premium/i.test(p)) return "Premium Plan";
    return "Free Plan";
  }
  function planTier(raw) {
    const p = planLabel(raw);
    return {"Free Plan":0,"Premium Plan":1,"Business Plan":2,"Enterprise Plan":3}[p] || 0;
  }
  function deviceLimit(raw) {
    const p = planLabel(raw);
    if (p === "Premium Plan") return "5 devices";
    if (p === "Business Plan") return "20 devices";
    if (p === "Enterprise Plan") return "Unlimited devices";
    return "1 device";
  }
  function scanLimit(raw) {
    const p = planLabel(raw);
    if (p === "Premium Plan") return "Advanced protection";
    if (p === "Business Plan") return "Team protection";
    if (p === "Enterprise Plan") return "Unlimited protection";
    return "Basic protection";
  }

  async function ensureUserDoc(user) {
    if (!user) return null;
    const ref = usersDB.collection("users").doc(user.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set(pickDefined({
        uid: user.uid,
        email: user.email || null,
        name: user.displayName || null,
        isAnonymous: !!user.isAnonymous,
        plan: "Free Plan",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }));
      return { plan: "Free Plan", email: user.email, name: user.displayName };
    }
    await ref.set(pickDefined({
      email: user.email || undefined,
      name: user.displayName || undefined,
      isAnonymous: !!user.isAnonymous,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }), { merge: true });
    return snap.data() || {};
  }

  async function upsertUserDoc(user, extra = {}) {
    if (!user) return;
    await ensureUserDoc(user);
    await usersDB.collection("users").doc(user.uid).set(pickDefined({
      uid: user.uid,
      email: user.email || undefined,
      name: extra.name ?? user.displayName ?? undefined,
      phone: extra.phone,
      company: extra.company,
      isAnonymous: extra.isAnonymous ?? !!user.isAnonymous,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      ...extra
    }), { merge: true });
  }

  async function ensureOrdersAuth() {
    if (!webAuth) return null;
    return new Promise((resolve, reject) => {
      const unsub = webAuth.onAuthStateChanged(async user => {
        try {
          if (!user) await webAuth.signInAnonymously();
          unsub();
          resolve(webAuth.currentUser);
        } catch (e) { reject(e); }
      });
    });
  }

  function toast(msg, type = "info") {
    let el = document.querySelector(".atipria-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "atipria-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.dataset.type = type;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3200);
  }

  function renderHeader(user, profile = {}) {
    document.querySelectorAll(".header-actions").forEach(actions => {
      if (!user) {
        actions.innerHTML = `
          <a class="btn btn-ghost" href="${rootPrefix}dashboard/index.html">Log in</a>
          <a class="btn btn-primary" href="${rootPrefix}downloads.html"><i class="fa-brands fa-chrome"></i> Install Free Extension</a>`;
        return;
      }
      const name = (profile.name || user.displayName || user.email || "Account").split("@")[0];
      actions.innerHTML = `
        <a class="btn btn-ghost account-pill" href="${rootPrefix}dashboard/index.html"><i class="fa-regular fa-user"></i> ${name}</a>
        <button class="btn btn-primary" id="header-signout"><i class="fa-solid fa-arrow-right-from-bracket"></i> Sign out</button>`;
      actions.querySelector("#header-signout")?.addEventListener("click", async () => {
        await usersAuth.signOut();
        toast("Signed out", "ok");
        if (location.pathname.includes("/dashboard/")) location.reload();
      });
    });
  }

  function updatePricingButtons(profile = {}) {
    const current = planLabel(profile.plan);
    const currentTier = planTier(current);
    document.querySelectorAll("[data-plan]").forEach(card => {
      const cardPlan = planLabel(card.dataset.plan);
      const btn = card.querySelector("button,.btn");
      const badge = card.querySelector(".current-plan-badge") || document.createElement("span");
      badge.className = "current-plan-badge";
      if (cardPlan === current) {
        badge.textContent = "Current Plan";
        if (!badge.parentNode) card.appendChild(badge);
        if (btn) { btn.textContent = "Manage plan"; btn.onclick = () => location.href = rootPrefix + "dashboard/index.html#subscription"; }
      } else if (planTier(cardPlan) < currentTier) {
        badge.textContent = "Included";
        if (!badge.parentNode) card.appendChild(badge);
        if (btn) { btn.textContent = "Already included"; btn.disabled = true; }
      } else if (btn) {
        btn.onclick = () => {
          if (!usersAuth.currentUser) location.href = rootPrefix + "dashboard/index.html?login=1";
          else location.href = rootPrefix + "pricing.html#pricing";
        };
      }
    });
  }

  function dashboardLoginMarkup() {
    return `
      <section class="auth-gate page-card">
        <div class="auth-copy">
          <p class="eyebrow">ATIPRIA ACCOUNT</p>
          <h1>Sign in to manage your protection.</h1>
          <p>Access your plan, downloads, previous versions, purchases, profile and devices.</p>
        </div>
        <div class="auth-panel">
          <div class="auth-tabs"><button class="active" data-auth-tab="signin">Sign in</button><button data-auth-tab="signup">Create account</button></div>
          <form id="signin-form" class="auth-form active">
            <label>Email<input id="signin-email" type="email" autocomplete="email" required></label>
            <label>Password<input id="signin-password" type="password" autocomplete="current-password" required></label>
            <label class="checkline"><input id="remember-me" type="checkbox" checked> Remember me</label>
            <button class="btn btn-primary" type="submit">Sign in</button>
            <button class="btn btn-ghost" type="button" id="google-signin"><i class="fa-brands fa-google"></i> Continue with Google</button>
            <a href="#" id="forgot-link">Forgot password?</a>
            <p class="form-feedback" id="signin-feedback"></p>
          </form>
          <form id="signup-form" class="auth-form">
            <label>Name<input id="signup-name" type="text" autocomplete="name" required></label>
            <label>Email<input id="signup-email" type="email" autocomplete="email" required></label>
            <label>Phone<input id="signup-phone" type="tel" autocomplete="tel"></label>
            <label>Company<input id="signup-company" type="text" autocomplete="organization"></label>
            <label>Password<input id="signup-password" type="password" autocomplete="new-password" required></label>
            <label>Confirm password<input id="signup-password2" type="password" autocomplete="new-password" required></label>
            <button class="btn btn-primary" type="submit">Create account</button>
            <button class="btn btn-ghost" type="button" id="google-signup"><i class="fa-brands fa-google"></i> Sign up with Google</button>
            <p class="form-feedback" id="signup-feedback"></p>
          </form>
        </div>
      </section>`;
  }

  function dashboardMarkup(user, profile = {}) {
    const name = profile.name || user.displayName || "Atipria user";
    const email = user.email || profile.email || "";
    const plan = planLabel(profile.plan);
    return `
      <div class="dash-hero page-card">
        <div><p class="eyebrow">WELCOME BACK</p><h1>Hello, ${escapeHTML(name.split(" ")[0] || "there")} 👋</h1><p>Manage your Atipria account, subscription, downloads and purchase history.</p></div>
        <a class="btn btn-primary" href="../downloads.html"><i class="fa-brands fa-chrome"></i> Download Extension</a>
      </div>
      <section class="dash-cards">
        <article class="page-card metric-card"><span>Current Plan</span><strong id="dash-plan">${plan}</strong><p>${scanLimit(plan)}</p></article>
        <article class="page-card metric-card"><span>Devices</span><strong>${deviceLimit(plan)}</strong><p>Connected browser devices</p></article>
        <article class="page-card metric-card"><span>Latest Version</span><strong>1.1.7</strong><p>Stable Chrome extension</p></article>
        <article class="page-card metric-card"><span>Account</span><strong>${email ? "Verified" : "Profile"}</strong><p>${escapeHTML(email || "Add your email")}</p></article>
      </section>
      <section class="page-card" id="profile"><h2>Profile</h2><p>These details are stored in your Atipria user profile.</p>
        <div class="account-form">
          <label>Name<input id="ua-name" value="${escapeAttr(profile.name || user.displayName || "")}"></label>
          <label>Email<input id="ua-email" value="${escapeAttr(email)}" disabled></label>
          <label>Phone<input id="ua-phone" value="${escapeAttr(profile.phone || "")}"></label>
          <label>Company<input id="ua-company" value="${escapeAttr(profile.company || "")}"></label>
        </div>
        <div class="account-actions"><button class="btn btn-primary" id="ua-save">Save changes</button><button class="btn btn-ghost" id="ua-reset">Reset password</button><button class="btn btn-ghost danger-button" id="ua-delete">Delete account</button></div>
        <p class="form-feedback" id="ua-feedback"></p>
      </section>
      <section class="page-card" id="subscription"><h2>Subscription</h2><div class="subscription-row"><div><b>${plan}</b><p>${deviceLimit(plan)} · ${scanLimit(plan)}</p></div><a class="btn btn-primary" href="../pricing.html">View plans</a></div></section>
      <section class="page-card" id="downloads"><h2>Downloads</h2><div class="version-list compact-versions">
        <div class="version-row"><strong>Atipria 1.1.7</strong><span class="badge">Latest stable</span><span>Chrome Extension</span><a class="btn btn-primary" href="../Versions/Atipria (1.1.7).rar" download>Download</a></div>
        <div class="version-row"><strong>Atipria 1.1.6</strong><span>Previous</span><span>Chrome Extension</span><a class="btn btn-ghost" href="../Versions/Atipria (1.1.6).rar" download>Download</a></div>
        <div class="version-row"><strong>Atipria 1.1.5</strong><span>Archive</span><span>Chrome Extension</span><a class="btn btn-ghost" href="../Versions/Atipria (1.1.5).rar" download>Download</a></div>
      </div></section>
      <section class="page-card" id="devices"><h2>Devices</h2><div class="device-grid">
        <article><i class="fa-brands fa-chrome"></i><b>Chrome / Windows</b><span>Current browser</span><small>Last seen: now</small></article>
        <article><i class="fa-solid fa-plus"></i><b>Add device</b><span>${deviceLimit(plan)}</span><small>Install Atipria on another browser</small></article>
      </div></section>
      <section class="page-card" id="billing"><h2>Purchases</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>Plan</th><th>Method</th><th>Amount ($)</th><th>Card</th></tr></thead><tbody id="ua-purchases"><tr><td colspan="5">Loading purchases…</td></tr></tbody></table></div></section>`;
  }

  function escapeHTML(s) { return String(s ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch])); }
  function escapeAttr(s) { return escapeHTML(s).replace(/`/g, "&#96;"); }

  async function loadPurchases(user) {
    const tbody = document.getElementById("ua-purchases");
    if (!tbody || !webDB || !user?.email) return;
    try {
      await ensureOrdersAuth();
      let qs;
      try {
        qs = await webDB.collection("purchases").where("email", "==", user.email).orderBy("timestamp", "desc").limit(20).get();
      } catch (_) {
        qs = await webDB.collection("purchases").where("email", "==", user.email).limit(20).get();
      }
      if (qs.empty) {
        tbody.innerHTML = '<tr><td colspan="5">No purchases yet</td></tr>';
        return;
      }
      const rows = [];
      qs.forEach(d => {
        const p = d.data();
        const ts = p.timestamp?.toDate ? p.timestamp.toDate() : null;
        rows.push(`<tr><td>${ts ? ts.toLocaleString() : "-"}</td><td>${escapeHTML(p.plan || "-")}</td><td>${escapeHTML(p.paymentMethod || "-")}</td><td>${escapeHTML(p.price ?? "-")}</td><td>${p.last4Digits ? "•••• " + escapeHTML(p.last4Digits) : "-"}</td></tr>`);
      });
      tbody.innerHTML = rows.join("");
    } catch (e) {
      console.error(e);
      tbody.innerHTML = '<tr><td colspan="5">Failed to load purchases</td></tr>';
    }
  }

  function wireAuthForms() {
    document.querySelectorAll("[data-auth-tab]").forEach(btn => btn.addEventListener("click", () => {
      document.querySelectorAll("[data-auth-tab]").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".auth-form").forEach(f => f.classList.remove("active"));
      document.getElementById(btn.dataset.authTab === "signup" ? "signup-form" : "signin-form")?.classList.add("active");
    }));

    document.getElementById("signin-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const fb = document.getElementById("signin-feedback");
      fb.textContent = "Signing you in…";
      try {
        const remember = document.getElementById("remember-me")?.checked;
        await usersAuth.setPersistence(remember ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
        await usersAuth.signInWithEmailAndPassword(document.getElementById("signin-email").value.trim(), document.getElementById("signin-password").value);
        fb.textContent = "Signed in.";
      } catch (err) { fb.textContent = err.message || "Sign in failed"; }
    });

    document.getElementById("signup-form")?.addEventListener("submit", async e => {
      e.preventDefault();
      const fb = document.getElementById("signup-feedback");
      const pass1 = document.getElementById("signup-password").value;
      const pass2 = document.getElementById("signup-password2").value;
      if (pass1 !== pass2) { fb.textContent = "Passwords do not match"; return; }
      fb.textContent = "Creating account…";
      try {
        const name = document.getElementById("signup-name").value.trim();
        const cred = await usersAuth.createUserWithEmailAndPassword(document.getElementById("signup-email").value.trim(), pass1);
        await cred.user.updateProfile({ displayName: name });
        await upsertUserDoc(cred.user, { name, phone: document.getElementById("signup-phone").value.trim(), company: document.getElementById("signup-company").value.trim(), plan: "Free Plan", isAnonymous: false });
        fb.textContent = "Account created.";
      } catch (err) { fb.textContent = err.message || "Sign up failed"; }
    });

    const googleProvider = new firebase.auth.GoogleAuthProvider();
    async function googleFlow() {
      try {
        const cred = await usersAuth.signInWithPopup(googleProvider);
        await upsertUserDoc(cred.user, { name: cred.user.displayName, isAnonymous: false });
      } catch (err) { toast("Google sign-in failed: " + (err.message || ""), "error"); }
    }
    document.getElementById("google-signin")?.addEventListener("click", googleFlow);
    document.getElementById("google-signup")?.addEventListener("click", googleFlow);
    document.getElementById("forgot-link")?.addEventListener("click", async e => {
      e.preventDefault();
      const email = document.getElementById("signin-email")?.value.trim();
      if (!email) { toast("Enter your email first", "error"); return; }
      try { await usersAuth.sendPasswordResetEmail(email); toast("Password reset email sent", "ok"); }
      catch (err) { toast(err.message || "Failed to send reset email", "error"); }
    });
  }

  function wireDashboardActions(user) {
    document.getElementById("ua-save")?.addEventListener("click", async () => {
      const fb = document.getElementById("ua-feedback"); fb.textContent = "Saving…";
      try {
        const name = document.getElementById("ua-name").value.trim();
        if (name && name !== (user.displayName || "")) await user.updateProfile({ displayName: name });
        await usersDB.collection("users").doc(user.uid).set(pickDefined({ name, phone: document.getElementById("ua-phone").value.trim(), company: document.getElementById("ua-company").value.trim(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }), { merge: true });
        fb.textContent = "Saved."; toast("Profile updated", "ok");
      } catch (e) { fb.textContent = "Failed to save changes"; }
    });
    document.getElementById("ua-reset")?.addEventListener("click", async () => {
      if (!user.email) return toast("No email on this account", "error");
      try { await usersAuth.sendPasswordResetEmail(user.email); toast("Password reset email sent", "ok"); }
      catch(e) { toast(e.message || "Failed", "error"); }
    });
    document.getElementById("ua-delete")?.addEventListener("click", async () => {
      if (!confirm("Delete your Atipria account? This cannot be undone.")) return;
      try { await user.delete(); toast("Account deleted", "ok"); location.reload(); }
      catch(e) { toast("Recent login required before deleting", "error"); }
    });
  }

  async function renderDashboard(user, profile) {
    const mount = document.getElementById("dashboard-root");
    if (!mount) return;
    if (!user) {
      mount.innerHTML = dashboardLoginMarkup();
      wireAuthForms();
      return;
    }
    mount.innerHTML = dashboardMarkup(user, profile);
    wireDashboardActions(user);
    loadPurchases(user);
  }

  usersAuth.onAuthStateChanged(async user => {
    let profile = {};
    if (user) profile = await ensureUserDoc(user) || {};
    renderHeader(user, profile);
    updatePricingButtons(profile);
    renderDashboard(user, profile);
  });
})();
