import { syncTranscriptionBalancesForPlans } from "../src/lib/transcriptionCredits";
import clientPromise from "../src/lib/mongodb";

void (async () => {
  const result = await syncTranscriptionBalancesForPlans(
    ["basic", "growth"],
    "Initial admin-controlled Speech to Scripture allowance reset",
  );

  console.log(JSON.stringify(result));
  const client = await clientPromise;
  await client.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
