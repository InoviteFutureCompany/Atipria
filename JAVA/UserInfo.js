  document.addEventListener("DOMContentLoaded", () => {
    const navAccount = document.getElementById("nav-Account");
    if (navAccount) {
      navAccount.addEventListener("click", (e) => {
        e.preventDefault();
        document.querySelectorAll("body > *:not(header):not(footer)").forEach(el => el.style.display = "none");
        document.getElementById("UserArea").style.display = "block";
        if (usersAuth.currentUser) renderUserArea(usersAuth.currentUser);
      });
    }
  });

  usersAuth.onAuthStateChanged((user) => {
    const navAccount = document.getElementById("nav-Account");
    if (navAccount) navAccount.style.display = user ? "inline-block" : "none";
    if (user && document.getElementById("UserArea").style.display !== "none") {
      renderUserArea(user);
    }
  });

  async function renderUserArea(user) {
    const fb = document.getElementById("ua-feedback");
    const nameEl    = document.getElementById("ua-name");
    const emailEl   = document.getElementById("ua-email");
    const phoneEl   = document.getElementById("ua-phone");
    const companyEl = document.getElementById("ua-company");
    const planP     = document.getElementById("ua-plan");
    const tbody     = document.getElementById("ua-purchases");

    fb.textContent = "";
    emailEl.value  = user.email || "";

    try {
      const udoc = await usersDB.collection("users").doc(user.uid).get();
      const u = udoc.exists ? udoc.data() : {};
      nameEl.value    = user.displayName || u.name || "";
      phoneEl.value   = u.phone   || "";
      companyEl.value = u.company || "";

      const snap = await db.collection("purchases")
        .where("uid","==", user.uid)
        .orderBy("timestamp","desc")
        .limit(20)
        .get();

      if (snap.empty) {
        tbody.innerHTML = '<tr><td style="padding:8px;" colspan="5">No purchases yet</td></tr>';
        planP.textContent = u.plan ? `Plan: ${u.plan}` : "Plan: Free";
      } else {
        const rows = [];
        let newestPlan = u.plan || null;

        snap.forEach(doc => {
          const p = doc.data();
          const ts = p.timestamp?.toDate ? p.timestamp.toDate() : null;
          const when = ts ? ts.toLocaleString() : "-";
          if (!newestPlan) newestPlan = p.plan || null;

          rows.push(`
            <tr>
              <td style="padding:8px;border-bottom:1px solid #f3f4f6;">${when}</td>
              <td style="padding:8px;border-bottom:1px solid #f3f4f6;">${p.plan || "-"}</td>
              <td style="padding:8px;border-bottom:1px solid #f3f4f6;">${p.paymentMethod || "-"}</td>
              <td style="padding:8px;border-bottom:1px solid #f3f4f6;">${(p.price ?? "-")}</td>
              <td style="padding:8px;border-bottom:1px solid #f3f4f6;">${p.last4Digits ? ("•••• " + p.last4Digits) : "-"}</td>
            </tr>
          `);
        });

        tbody.innerHTML = rows.join("");
        planP.textContent = `Plan: ${newestPlan || "Free"}`;
      }

    } catch (err) {
      console.error(err);
      fb.textContent = "❌ Failed to load account data";
    }
  }

  document.getElementById("ua-save").addEventListener("click", async () => {
    const user = usersAuth.currentUser;
    if (!user) return;
    const fb = document.getElementById("ua-feedback");
    fb.textContent = "Saving…";

    const name    = document.getElementById("ua-name").value.trim();
    const phone   = document.getElementById("ua-phone").value.trim();
    const company = document.getElementById("ua-company").value.trim();

    try {
      if (name && name !== (user.displayName||"")) {
        await user.updateProfile({ displayName: name });
      }
      await usersDB.collection("users").doc(user.uid).set({
        name, phone, company, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      fb.textContent = "✅ Saved!";
    } catch (e) {
      console.error(e);
      fb.textContent = "❌ Failed to save changes";
    }
  });

  document.getElementById("ua-reset").addEventListener("click", async () => {
    const user = usersAuth.currentUser;
    if (!user?.email) { alert("No email on this account."); return; }
    try {
      await usersAuth.sendPasswordResetEmail(user.email);
      alert("Password reset email sent.");
    } catch (e) {
      alert("Failed: " + (e.message || "Unknown error"));
    }
  });

  document.getElementById("ua-delete").addEventListener("click", async () => {
    const user = usersAuth.currentUser;
    if (!user) return;
    if (!confirm("Are you sure you want to delete your account? This action cannot be undone.")) return;

    try {
      if (user.email) {
        const pass = prompt("Please confirm your password to continue:");
        if (!pass) return;
        const cred = firebase.auth.EmailAuthProvider.credential(user.email, pass);
        await user.reauthenticateWithCredential(cred);
      }
      await user.delete();
      alert("Account deleted.");
      window.location.href = "index.html";
    } catch (e) {
      if (e.code === "auth/requires-recent-login") {
        try {
          await usersAuth.currentUser.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
          await usersAuth.currentUser.delete();
          alert("Account deleted.");
          window.location.href = "index.html";
          return;
        } catch (e2) {
          alert("Failed to delete: " + (e2.message || ""));
        }
      } else {
        alert("Failed: " + (e.message || ""));
      }
    }
  });

