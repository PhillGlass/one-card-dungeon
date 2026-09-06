// Sostituisci questi due valori con quelli del TUO progetto Supabase:
// Project Settings → API → "Project URL" e "anon public" (tab "Legacy anon, service_role API keys")
const SUPABASE_URL = "https://txgyuaulmbwbkaplhdxd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4Z3l1YXVsbWJ3YmthcGxoZHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NjM0NjEsImV4cCI6MjEwMzEzOTQ2MX0.Z_ovk_9uTyay1CMZDu68nvv6wIUteMUxtTryY3dy8Zs";
// URL pubblico di One Card Dungeon: usato come "redirectTo" nell'email di
// reset password, così il link riporta qui e non ad altre app ospitate
// nello stesso progetto Supabase. Deve essere anche presente nella lista
// "Redirect URLs" di Supabase (Authentication → URL Configuration) — se
// manca lì, Supabase rifiuta/reindirizza altrove a prescindere da questo.
const SITE_URL = "https://phillglass.github.io/one-card-dungeon/";
