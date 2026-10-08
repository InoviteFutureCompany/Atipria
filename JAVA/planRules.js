(function (global) {
  // מיפוי רמות של חבילות – ככל שהמספר גבוה יותר החבילה "גבוהה" יותר
  const PLAN_TIERS = {
    "Free Plan": 0,
    "Premium Plan": 1,
    "Business Plan": 2,
    "Enterprise Plan": 3,
  };

  function getPlanTier(planName) {
    return PLAN_TIERS[planName] ?? -1;
  }

  /**
   * מחזיר את הרכישה האחרונה של המשתמש באותו חודש (אם קיימת)
   */
  async function getLastPurchaseThisMonth(db, userUid) {
    if (!db || !userUid) return null;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-11

    const snap = await db
      .collection("purchases")
      .where("uidUsers", "==", userUid)
      .get();

    let last = null;

    snap.forEach((doc) => {
      const data = doc.data();
      let ts = null;

      if (data.timestamp && typeof data.timestamp.toDate === "function") {
        ts = data.timestamp.toDate();
      } else if (data.timestamp instanceof Date) {
        ts = data.timestamp;
      }

      if (!ts) return;

      if (ts.getFullYear() === year && ts.getMonth() === month) {
        if (!last || ts > last.timestamp) {
          last = {
            id: doc.id,
            ...data,
            timestamp: ts,
          };
        }
      }
    });

    return last;
  }

  /**
   * בודק אם מותר למשתמש לקנות חבילה מסוימת החודש
   * תנאים:
   * א. חבילה אחת ברמה מסוימת לחודש
   * ב. אם כבר קנה החודש – אסור לקנות חבילה זולה יותר
   * ג. מותר לרכוש באותו חודש רק חבילה גבוהה יותר (שדרוג)
   */
  async function canUserPurchasePlan(db, user, planName) {
    if (!user) {
      return {
        ok: false,
        code: "NO_USER",
        message: "עליך להתחבר לפני רכישה.",
      };
    }

    const requestedTier = getPlanTier(planName);
    if (requestedTier < 0) {
      return {
        ok: false,
        code: "UNKNOWN_PLAN",
        message: "סוג חבילה לא מוכר.",
      };
    }

    const lastPurchase = await getLastPurchaseThisMonth(db, user.uid);

    // לא הייתה בכלל רכישה בחודש הזה – הכל מותר
    if (!lastPurchase) {
      return {
        ok: true,
        code: "FIRST_PURCHASE_THIS_MONTH",
        previousPlan: null,
      };
    }

    const existingPlan = lastPurchase.plan || "Unknown";
    const existingTier = getPlanTier(existingPlan);

    // ב. אם המשתמש קנה חבילה החודש – הוא לא יכול לקנות חבילה זולה יותר
    if (requestedTier < existingTier) {
      return {
        ok: false,
        code: "DOWNGRADE_NOT_ALLOWED",
        message:
          "לא ניתן לרכוש באותו חודש חבילה זולה יותר מהחבילה שכבר נרכשה.",
        previousPlan: existingPlan,
      };
    }

    //אם אותה רמה – נחשב כאותה חבילה: פעם אחת בחודש
    if (requestedTier === existingTier) {
      return {
        ok: false,
        code: "SAME_LEVEL_LIMIT",
        message:
          "ניתן לרכוש חבילה אחת בלבד מאותה רמה בחודש. ניתן לבחור חבילה גבוהה יותר (שדרוג).",
        previousPlan: existingPlan,
      };
    }

    //חבילה גבוהה יותר – מותר לבצע שדרוג
    if (requestedTier > existingTier) {
      return {
        ok: true,
        code: "UPGRADE_ALLOWED",
        previousPlan: existingPlan,
      };
    }

    return {
      ok: false,
      code: "UNKNOWN_STATE",
      message: "לא ניתן להשלים את הבדיקה. נסה שוב מאוחר יותר.",
    };
  }

  /**
   * אחרי רכישה מוצלחת – מעדכן את מסמך המשתמש:
   * - plan: החבילה הנוכחית
   * - lastUpgradeFrom / lastUpgradeTo / lastUpgradeAt אם זה שדרוג
   * - מבטל דגל ביטול אם היה
   */
  async function recordPlanOnUser(usersDB, user, planName, options = {}) {
    if (!usersDB || !user) return;

    const { upgradedFrom = null } = options;

    const payload = {
      plan: planName,
      planStatus: "active",
      cancelAtPeriodEnd: false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    if (upgradedFrom && upgradedFrom !== planName) {
      payload.lastUpgradeFrom = upgradedFrom;
      payload.lastUpgradeTo = planName;
      payload.lastUpgradeAt = firebase.firestore.FieldValue.serverTimestamp();
    }

    await usersDB
      .collection("users")
      .doc(user.uid)
      .set(payload, { merge: true });
  }

  /**
   * ביטול חבילה – מסמן שבסוף החודש לא יתחדש (לוגיקה של חיוב עתידי תהיה בצד שרת/Cloud Functions)
   */
  async function requestCancelAtPeriodEnd(usersDB, user) {
    if (!usersDB || !user) return;

    await usersDB
      .collection("users")
      .doc(user.uid)
      .set(
        {
          cancelAtPeriodEnd: true,
          cancelRequestedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  global.PurchaseRules = {
    PLAN_TIERS,
    canUserPurchasePlan,
    recordPlanOnUser,
    requestCancelAtPeriodEnd,
  };
})(window);
