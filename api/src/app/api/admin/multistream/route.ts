import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";

const SESSION_TIMEOUT_MS = 90_000;
const MAX_LIVE_TAIL_SECONDS = 45;

function userDisplayName(user: Record<string, any> | undefined): string {
  if (!user) return "Unknown user";
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return String(user.name || user.username || fullName || "Unknown user");
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const rawDays = Number.parseInt(req.nextUrl.searchParams.get("days") || "30", 10);
    const days = [7, 30, 90].includes(rawDays) ? rawDays : 30;
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const client = await clientPromise;
    const db = client.db();
    const sessionsCol = db.collection("multistream_sessions");
    const errorsCol = db.collection("multistream_errors");
    const usersCol = db.collection("users");

    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [summaryRows, recentSessions, recentErrors, activeSessions, errorCount, perUserRows, perUserErrors, monthRows] = await Promise.all([
      sessionsCol.aggregate([
        { $match: { startedAt: { $gte: from } } },
        {
          $group: {
            _id: null,
            sessions: { $sum: 1 },
            usedSeconds: { $sum: "$usedSeconds" },
            users: { $addToSet: "$userId" },
          },
        },
      ]).toArray(),
      sessionsCol.find({ startedAt: { $gte: from } }).sort({ startedAt: -1 }).limit(250).toArray(),
      errorsCol.find({ createdAt: { $gte: from } }).sort({ createdAt: -1 }).limit(150).toArray(),
      sessionsCol.find({
        status: "active",
        startedAt: { $gte: from },
        lastHeartbeat: { $gte: new Date(now.getTime() - SESSION_TIMEOUT_MS) },
      }).toArray(),
      errorsCol.countDocuments({ createdAt: { $gte: from } }),
      // One row per church: how long they streamed, how often, to which platforms.
      sessionsCol.aggregate([
        { $match: { startedAt: { $gte: from } } },
        {
          $group: {
            _id: "$userId",
            sessions: { $sum: 1 },
            usedSeconds: { $sum: { $ifNull: ["$usedSeconds", 0] } },
            longestSeconds: { $max: { $ifNull: ["$usedSeconds", 0] } },
            sessionErrors: { $sum: { $ifNull: ["$errorCount", 0] } },
            interrupted: { $sum: { $cond: [{ $eq: ["$status", "interrupted"] }, 1, 0] } },
            firstAt: { $min: "$startedAt" },
            lastAt: { $max: "$startedAt" },
            platforms: { $addToSet: "$channels.platform" },
            profiles: { $addToSet: "$profileName" },
            maxDestinations: { $max: { $size: { $ifNull: ["$channels", []] } } },
          },
        },
        { $sort: { usedSeconds: -1 } },
        { $limit: 1000 },
      ]).toArray(),
      errorsCol.aggregate([
        { $match: { createdAt: { $gte: from } } },
        { $group: { _id: { userId: "$userId", code: "$code" }, count: { $sum: 1 }, lastAt: { $max: "$createdAt" } } },
      ]).toArray(),
      sessionsCol.aggregate([
        { $match: { startedAt: { $gte: monthStart } } },
        { $group: { _id: "$userId", usedSeconds: { $sum: { $ifNull: ["$usedSeconds", 0] } } } },
      ]).toArray(),
    ]);

    const summary = summaryRows[0] || { sessions: 0, usedSeconds: 0, users: [] };
    const latestUserIds = [...new Set([
      ...recentSessions.map((session) => String(session.userId || "")),
      ...recentErrors.map((error) => String(error.userId || "")),
      ...perUserRows.map((row) => String(row._id || "")),
      ...perUserErrors.map((row) => String(row._id?.userId || "")),
    ])].filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    const userDocs = latestUserIds.length
      ? await usersCol.find(
        { _id: { $in: latestUserIds } },
        { projection: { name: 1, username: 1, firstName: 1, lastName: 1, email: 1, country: 1, countryCode: 1, churchName: 1, plan: 1, multistreamHoursOverride: 1 } },
      ).toArray()
      : [];
    const userById = new Map(userDocs.map((user) => [String(user._id), user]));
    const activeIds = new Set(activeSessions.map((session) => String(session._id)));
    const liveTail = activeSessions.reduce((sum, session) => {
      const lastSeen = new Date(session.lastHeartbeat || session.startedAt).getTime();
      return sum + Math.max(0, Math.min(MAX_LIVE_TAIL_SECONDS, Math.floor((now.getTime() - lastSeen) / 1000)));
    }, 0);

    const sessions = recentSessions.map((session) => {
      const user = userById.get(String(session.userId));
      const isLive = session.status === "active" && activeIds.has(String(session._id));
      const lastSeen = new Date(session.lastHeartbeat || session.startedAt).getTime();
      const liveTailSeconds = isLive
        ? Math.max(0, Math.min(MAX_LIVE_TAIL_SECONDS, Math.floor((now.getTime() - lastSeen) / 1000)))
        : 0;
      return {
        id: String(session._id),
        userId: String(session.userId || ""),
        name: userDisplayName(user),
        email: String(user?.email || ""),
        country: String(user?.country || user?.signupCountry || user?.countryCode || session.countryCode || "Unknown"),
        churchName: String(user?.churchName || ""),
        profileName: String(session.profileName || ""),
        channels: Array.isArray(session.channels) ? session.channels : [],
        status: isLive ? "live" : session.status === "active" ? "interrupted" : session.status,
        startedAt: session.startedAt,
        lastHeartbeat: session.lastHeartbeat,
        endedAt: session.endedAt || null,
        durationSeconds: Math.max(0, Number(session.usedSeconds) || 0) + liveTailSeconds,
        errorCount: Number(session.errorCount) || 0,
        lastErrorCode: String(session.lastErrorCode || ""),
      };
    });

    const errors = recentErrors.map((error) => {
      const user = userById.get(String(error.userId));
      return {
        id: String(error._id),
        userId: String(error.userId || ""),
        name: userDisplayName(user),
        email: String(user?.email || ""),
        country: String(user?.country || user?.signupCountry || user?.countryCode || error.countryCode || "Unknown"),
        profileName: String(error.profileName || ""),
        channels: Array.isArray(error.channels) ? error.channels : [],
        stage: String(error.stage || "unknown"),
        code: String(error.code || "UNKNOWN"),
        message: String(error.message || "Multi-Stream action failed"),
        createdAt: error.createdAt,
      };
    });

    // Per-church summary (sessions in the period + errors in the period, even without a session).
    const errorsByUser = new Map<string, { total: number; codes: Array<{ code: string; count: number }>; lastAt: Date | null }>();
    for (const row of perUserErrors) {
      const uid = String(row._id?.userId || "");
      if (!uid) continue;
      const entry = errorsByUser.get(uid) || { total: 0, codes: [], lastAt: null };
      entry.total += Number(row.count) || 0;
      entry.codes.push({ code: String(row._id?.code || "UNKNOWN"), count: Number(row.count) || 0 });
      if (row.lastAt && (!entry.lastAt || row.lastAt > entry.lastAt)) entry.lastAt = row.lastAt;
      errorsByUser.set(uid, entry);
    }
    const monthByUser = new Map(monthRows.map((row) => [String(row._id || ""), Number(row.usedSeconds) || 0]));
    const churchIds = new Set<string>([...perUserRows.map((r) => String(r._id || "")), ...errorsByUser.keys()]);
    const sessionRowByUser = new Map(perUserRows.map((r) => [String(r._id || ""), r]));
    const churches = [...churchIds].filter(Boolean).map((uid) => {
      const row: Record<string, any> | undefined = sessionRowByUser.get(uid);
      const user = userById.get(uid);
      const errs = errorsByUser.get(uid);
      const platforms = Array.from(new Set(((row?.platforms || []) as unknown[]).flat().map(String).filter(Boolean)));
      return {
        userId: uid,
        name: userDisplayName(user),
        email: String(user?.email || ""),
        churchName: String(user?.churchName || ""),
        country: String(user?.country || user?.signupCountry || user?.countryCode || "Unknown"),
        plan: String(user?.plan || "free"),
        sessions: Number(row?.sessions) || 0,
        usedSeconds: Number(row?.usedSeconds) || 0,
        monthSeconds: monthByUser.get(uid) || 0,
        longestSeconds: Number(row?.longestSeconds) || 0,
        interrupted: Number(row?.interrupted) || 0,
        maxDestinations: Number(row?.maxDestinations) || 0,
        platforms,
        profiles: ((row?.profiles || []) as unknown[]).map(String).filter(Boolean).slice(0, 5),
        errors: Math.max(errs?.total || 0, Number(row?.sessionErrors) || 0),
        errorCodes: (errs?.codes || []).sort((a, b) => b.count - a.count).slice(0, 4),
        firstAt: row?.firstAt || null,
        lastAt: row?.lastAt || errs?.lastAt || null,
        triedOnlyWithErrors: !row && Boolean(errs?.total),
      };
    }).sort((a, b) => b.usedSeconds - a.usedSeconds || b.errors - a.errors);

    return NextResponse.json({
      days,
      churches,
      updatedAt: now.toISOString(),
      summary: {
        sessions: Number(summary.sessions) || 0,
        users: Array.isArray(summary.users) ? summary.users.filter(Boolean).length : 0,
        live: activeSessions.length,
        errors: errorCount,
        usedSeconds: (Number(summary.usedSeconds) || 0) + liveTail,
      },
      sessions,
      errors,
    });
  } catch (error) {
    console.error("[admin/multistream] Failed to load usage:", error);
    return NextResponse.json({ error: "Could not load multi-stream usage" }, { status: 500 });
  }
}
