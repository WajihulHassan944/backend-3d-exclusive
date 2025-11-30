// controllers/liveVisitorsController.js
import { Video } from "../models/b2Upload.js";
import page from "../models/frontend/page.js";
import { Invoice } from "../models/invoice.js";
import { pusher } from "../utils/pusher.js";

let liveVisitors = 0;

// called when user connects (frontend triggers)
export const userConnected = async (req, res) => {
  try {
    liveVisitors++;

    // ✅ Get isComingSoon from ANY page (since you update all pages at once)
    const anyPage = await page.findOne().select("isComingSoon");
    const isComingSoon = anyPage?.isComingSoon ?? false;

    // 🔥 Push live update
    await pusher.trigger("exclusive", "live-visitors-update", {
      count: liveVisitors,
      isComingSoon, // include in event too
    });

    return res.status(200).json({
      success: true,
      count: liveVisitors,
      isComingSoon,
    });
  } catch (error) {
    console.error("Pusher liveVisitors error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};


// called when user disconnects (frontend triggers on unload/leave)
export const userDisconnected = async (req, res) => {
  try {
    if (liveVisitors > 0) liveVisitors--;
    await pusher.trigger("exclusive", "live-visitors-update", {
      count: liveVisitors,
    });
    return res.status(200).json({ success: true, count: liveVisitors });
  } catch (error) {
    console.error("Pusher liveVisitors error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// optional — get current count
export const getLiveVisitors = (req, res) => {
  return res.status(200).json({ success: true, count: liveVisitors });
};




export const getAdminStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1
    );
    const endOfYesterday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 1,
      23,
      59,
      59
    );

   // 🌍 Exchange rate setup (convert everything to EUR)
const apiKeys = [
  "85b74576b01e8837973975c5",
  "551a0a522ee35a6b81ab564c",
  "18e51cab9c3d220d0e11fc18",
];

let rates = {};
for (const key of apiKeys) {
  const response = await fetch(
    `https://v6.exchangerate-api.com/v6/${key}/latest/EUR`
  );
  const data = await response.json();

  if (data.result === "success") {
    rates = data.conversion_rates;
    break;
  }
}


    // 💰 Total Revenue This Month (only non-manual orders)
    const monthlyInvoices = await Invoice.find({
      issuedAt: { $gte: startOfMonth },
    });

    let totalRevenueThisMonth = 0;
    for (const inv of monthlyInvoices) {
      const hasAutoCredits = inv.credits?.some((c) => !c.isManual);
      if (!hasAutoCredits) continue;

      const total = inv.total || 0;
      const currency = (inv.actualCurrency || "EUR").toUpperCase();

      if (currency === "EUR") {
        totalRevenueThisMonth += total;
      } else if (rates[currency]) {
        const rateToEUR = 1 / rates[currency];
        totalRevenueThisMonth += total * rateToEUR;
      }
    }

    // 💰 Last month revenue (for % comparison)
    const lastMonthInvoices = await Invoice.find({
      issuedAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
    });

    let totalRevenueLastMonth = 0;
    for (const inv of lastMonthInvoices) {
      const hasAutoCredits = inv.credits?.some((c) => !c.isManual);
      if (!hasAutoCredits) continue;

      const total = inv.total || 0;
      const currency = (inv.actualCurrency || "EUR").toUpperCase();
      if (currency === "EUR") {
        totalRevenueLastMonth += total;
      } else if (rates[currency]) {
        const rateToEUR = 1 / rates[currency];
        totalRevenueLastMonth += total * rateToEUR;
      }
    }

    const revenueChange =
      totalRevenueLastMonth > 0
        ? ((totalRevenueThisMonth - totalRevenueLastMonth) /
            totalRevenueLastMonth) *
          100
        : 0;

    // 📦 Orders Today
    const ordersToday = await Invoice.find({
      issuedAt: { $gte: startOfToday },
      "credits.isManual": false,
    }).countDocuments();

    // 📦 Orders Yesterday
    const ordersYesterday = await Invoice.find({
      issuedAt: { $gte: startOfYesterday, $lte: endOfYesterday },
      "credits.isManual": false,
    }).countDocuments();

   const ordersChange =
  ordersYesterday === 0 && ordersToday > 0
    ? 100
    : ordersYesterday > 0
    ? ((ordersToday - ordersYesterday) / ordersYesterday) * 100
    : 0;

    // 🎯 Conversion Rate (completion rate)
    const totalConversions = await Video.countDocuments();
    const completed = await Video.countDocuments({ status: "completed" });
    const prevWeekStart = new Date(now);
    prevWeekStart.setDate(now.getDate() - 7);

    const prevWeekCompleted = await Video.countDocuments({
      status: "completed",
      createdAt: { $gte: prevWeekStart, $lt: now },
    });

    const conversionRate =
      totalConversions > 0 ? (completed / totalConversions) * 100 : 0;

    const conversionChange =
      prevWeekCompleted > 0
        ? ((completed - prevWeekCompleted) / prevWeekCompleted) * 100
        : 0;

    // 👥 Live Visitors (from memory or another source)
    const liveVisitorsCount = liveVisitors;

    // 🧾 Final structured response
    return res.status(200).json({
      success: true,
      stats: {
        totalRevenueThisMonth: {
          value: totalRevenueThisMonth.toFixed(2),
          currency: "€",
          change: revenueChange.toFixed(1),
        },
        ordersToday: {
          value: ordersToday,
          change: ordersChange.toFixed(1),
        },
        conversionRate: {
          value: conversionRate.toFixed(1),
          change: conversionChange.toFixed(1),
        },
        liveVisitors: {
          value: liveVisitorsCount,
        },
      },
    });
  } catch (err) {
    console.error("❌ Error in getAdminStats:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin dashboard stats",
    });
  }
};
