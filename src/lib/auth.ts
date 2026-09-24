// Autenticação simples (usuário/senha compartilhados) pra proteger o painel
// interno. Não é multi-usuário nem tem controle de permissões — é só um
// portão de acesso, já que a ferramenta lida com tokens da Meta e gastos.
export const AUTH_COOKIE = "rk_session";

export const AUTH_USER = process.env.APP_LOGIN_USER || "rakebet";
export const AUTH_PASSWORD = process.env.APP_LOGIN_PASSWORD || "rkbt123";

// Token de sessão: derivado do usuário/senha configurados, não de um
// segredo aleatório — suficiente pra esse nível de proteção (portão único,
// sem sessões por usuário).
export const AUTH_TOKEN = process.env.APP_AUTH_TOKEN || `rk-session-${AUTH_USER}-${AUTH_PASSWORD}`;

export function checkCredentials(username: string, password: string): boolean {
  return username === AUTH_USER && password === AUTH_PASSWORD;
}
