/**
 * The announcement stream was intentionally retired.
 *
 * Desktop clients now receive announcements in the authenticated
 * /api/device/license bootstrap response. Returning 204 keeps older clients
 * from holding a serverless function open while their polling fallback takes
 * over and avoids the Vercel runtime timeout.
 */
export function GET() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
