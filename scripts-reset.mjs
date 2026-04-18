import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const email = "fdil.hm@gmail.com";
const { data: list, error: lerr } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
if (lerr) { console.error(lerr); process.exit(1); }
const u = list.users.find(x => x.email?.toLowerCase() === email);
if (!u) { console.error("user not found"); process.exit(1); }
const newPassword = "Temp1234!";
const { error } = await sb.auth.admin.updateUserById(u.id, { password: newPassword, email_confirm: true });
if (error) { console.error(error); process.exit(1); }
console.log("OK", u.id, "->", newPassword);
