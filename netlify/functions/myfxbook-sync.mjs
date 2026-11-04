// Runs once a day and refreshes the stored Myfxbook snapshot.
import { syncPerformance } from "./_myfxbook.mjs";

export default async () => {
  try {
    const s = await syncPerformance();
    console.log("myfxbook sync ok", s.asOf, s.gain);
  } catch (e) {
    console.error("myfxbook sync failed:", e.message);
  }
};

export const config = { schedule: "@daily" };
