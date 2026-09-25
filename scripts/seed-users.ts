/**
 * Creates (or updates) the two demo users and sets their roles.
 * Idempotent: safe to run any number of times.
 *
 *   npm run seed:users
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY),
 * SEED_ADVISER_PASSWORD and SEED_OWNER_PASSWORD. The service key is only ever used
 * here and in no code that reaches the browser.
 */
import { createClient, type User } from "@supabase/supabase-js";
import { SERVICE_KEY, SUPABASE_URL, USERS, need } from "./env";

const admin = createClient(SUPABASE_URL(), SERVICE_KEY(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(email: string): Promise<User | null> {
  for (let page = 1; page < 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function upsertUser(spec: (typeof USERS)[keyof typeof USERS]) {
  const password = need(spec.passwordVar);
  if (password.length < 8) {
    console.error(`${spec.passwordVar} must be at least 8 characters.`);
    process.exit(2);
  }

  const existing = await findUserByEmail(spec.email);
  let userId: string;
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: spec.fullName },
    });
    if (error) throw error;
    userId = existing.id;
    console.log(`updated  ${spec.email}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: spec.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: spec.fullName },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`created  ${spec.email}`);
  }

  // The auth trigger already created an adviser profile; set name and role.
  const { error } = await admin
    .from("profiles")
    .upsert({ id: userId, full_name: spec.fullName, email: spec.email, role: spec.role }, { onConflict: "id" });
  if (error) throw error;
  console.log(`         role = ${spec.role}`);
}

async function main() {
  await upsertUser(USERS.adviser);
  await upsertUser(USERS.owner);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
