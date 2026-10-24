/**
 * Synthetic reviewer accounts created by backend/scripts/seed.py. Not real credentials.
 * Shown on the login page so reviewers can switch roles quickly. Hide with
 * NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=false.
 */
export const DEMO_PASSWORD = "Dealer#2026";

export const SHOW_DEMO_ACCOUNTS = process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS !== "false";

export const DEMO_ACCOUNTS = [
  {
    dealership: "Northside Motors",
    users: [
      { email: "alice.admin@northside.test", name: "Alice Morgan", role: "admin" as const },
      { email: "bob.admin@northside.test", name: "Bob Chen", role: "admin" as const },
      { email: "victor.viewer@northside.test", name: "Victor Reyes", role: "viewer" as const },
    ],
  },
  {
    dealership: "Southgate Auto Group",
    users: [
      { email: "sara.admin@southgate.test", name: "Sara Patel", role: "admin" as const },
      { email: "tom.admin@southgate.test", name: "Tom Walker", role: "admin" as const },
      { email: "uma.viewer@southgate.test", name: "Uma Brooks", role: "viewer" as const },
    ],
  },
];
