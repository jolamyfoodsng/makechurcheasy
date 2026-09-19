/**
 * GET /api/admin/churches — Aggregated church data.
 *
 * Groups users by churchName and returns per-church stats
 * including user counts, plan distribution, and AI usage.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) return authResult.response;

    const client = await clientPromise;
    const db = client.db();
    const usersCol = db.collection("users");
    const eventsCol = db.collection("activity_events");

    // Aggregate AI/voice events per church
    const voiceEventsByChurch = await eventsCol
      .aggregate([
        { $match: { event: { $in: ["voice_session_started", "voice_session_completed"] } } },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: false } },
        { $match: { "user.churchName": { $ne: "" } } },
        {
          $group: {
            _id: "$user.churchName",
            voiceCount: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const voiceMap: Record<string, number> = {};
    for (const doc of voiceEventsByChurch) {
      voiceMap[doc._id] = doc.voiceCount;
    }

    const churches = await usersCol
      .aggregate([
        { $match: { churchName: { $ne: "" } } },
        {
          $group: {
            _id: "$churchName",
            userCount: { $sum: 1 },
            plans: { $push: "$plan" },
            lastActive: { $max: "$lastLogin" },
          },
        },
        {
          $addFields: {
            paidCount: {
              $size: {
                $filter: {
                  input: "$plans",
                  cond: { $in: ["$$this", ["basic", "growth"]] },
                },
              },
            },
            topPlan: {
              $let: {
                vars: {
                  counts: {
                    $reduce: {
                      input: "$plans",
                      initialValue: {},
                      in: {
                        $mergeObjects: [
                          "$$value",
                          {
                            $arrayToObject: [
                              [{ k: "$$this", v: { $add: [{ $ifNull: [{ $getField: { field: "$$this", input: "$$value" } }, 0] }, 1] } }],
                            ],
                          },
                        ],
                      },
                    },
                  },
                },
                in: {
                  $let: {
                    vars: {
                      sorted: {
                        $sortArray: {
                          input: { $objectToArray: "$$counts" },
                          sortBy: { v: -1 },
                        },
                      },
                    },
                    in: { $arrayElemAt: ["$$sorted.k", 0] },
                  },
                },
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            id: "$_id",
            name: "$_id",
            country: "—",
            userCount: 1,
            paidCount: 1,
            plan: { $ifNull: ["$topPlan", "free"] },
            lastActive: {
              $cond: {
                if: { $ne: ["$lastActive", null] },
                then: { $toString: "$lastActive" },
                else: null,
              },
            },
          },
        },
        { $sort: { userCount: -1 } },
      ])
      .toArray();

    // Attach AI usage counts
    const enriched = churches.map((c) => ({
      ...c,
      aiUsage: +(Math.round((voiceMap[c.name] || 0) * 0.025 * 10) / 10), // ~1.5 min per event → hours
    }));

    return NextResponse.json({ churches: enriched });
  } catch (error) {
    console.error("Admin churches error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
