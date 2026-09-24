import { createClient } from "@supabase/supabase-js";

// Cliente server-only com service_role key. Nunca importar este arquivo em
// componentes client ("use client") — a chave tem acesso total ao banco e
// as tabelas não têm policies de RLS para anon/authenticated.
function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`);
  }
  return value;
}

export function createSupabaseAdminClient() {
  const url = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
