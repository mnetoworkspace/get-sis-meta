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

const PAGE_SIZE = 1000;

// O PostgREST corta qualquer select em 1000 linhas por padrão (db-max-rows),
// mesmo sem você pedir isso — sem paginar aqui, uma agregação (soma, aba
// "Detalhado", etc.) que devia cobrir 1130 linhas silenciosamente vira 1000,
// com números errados e nenhum erro pra avisar. queryFactory recebe o range
// (from/to) e deve montar a query do zero a cada página — um
// PostgrestFilterBuilder já executado não pode ser reaproveitado.
export async function fetchAllRows<T>(
  queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await queryFactory(from, to);
    if (error) throw new Error(error.message);

    const rows = data || [];
    all.push(...rows);

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}
