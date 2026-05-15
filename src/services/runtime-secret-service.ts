import type { Env } from "../env";
import { SettingsRepository } from "../storage/settings-repository";

export type RuntimeSecrets = {
  api_auth_token: string;
  telegram_webhook_secret: string;
  linode_token_encryption_key: string;
};

const SETTINGS_KEY = "runtime_secrets";

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function explicitRuntimeSecrets(env: Pick<Env, "API_AUTH_TOKEN" | "TELEGRAM_WEBHOOK_SECRET" | "LINODE_TOKEN_ENCRYPTION_KEY">): Partial<RuntimeSecrets> {
  return {
    api_auth_token: hasValue(env.API_AUTH_TOKEN) ? env.API_AUTH_TOKEN : undefined,
    telegram_webhook_secret: hasValue(env.TELEGRAM_WEBHOOK_SECRET) ? env.TELEGRAM_WEBHOOK_SECRET : undefined,
    linode_token_encryption_key: hasValue(env.LINODE_TOKEN_ENCRYPTION_KEY) ? env.LINODE_TOKEN_ENCRYPTION_KEY : undefined
  };
}

export async function getRuntimeSecrets(env: Env): Promise<Partial<RuntimeSecrets>> {
  const explicit = explicitRuntimeSecrets(env);
  if (!env.DB) return explicit;
  const stored = await new SettingsRepository(env.DB).get<Partial<RuntimeSecrets>>(SETTINGS_KEY) ?? {};
  return {
    api_auth_token: explicit.api_auth_token ?? stored.api_auth_token,
    telegram_webhook_secret: explicit.telegram_webhook_secret ?? stored.telegram_webhook_secret,
    linode_token_encryption_key: explicit.linode_token_encryption_key ?? stored.linode_token_encryption_key
  };
}

export async function getLinodeTokenEncryptionKey(env: Env): Promise<string> {
  const secrets = await getRuntimeSecrets(env);
  if (!secrets.linode_token_encryption_key) throw new Error("Missing LINODE_TOKEN_ENCRYPTION_KEY; run setup initialize first");
  return secrets.linode_token_encryption_key;
}

export async function ensureRuntimeSecrets(env: Env): Promise<{ secrets: RuntimeSecrets; created: Array<keyof RuntimeSecrets>; existing: Array<keyof RuntimeSecrets> }> {
  if (!env.DB) throw new Error("Missing D1 binding DB");
  const repository = new SettingsRepository(env.DB);
  const current = await repository.get<Partial<RuntimeSecrets>>(SETTINGS_KEY) ?? {};
  const explicit = explicitRuntimeSecrets(env);
  const next: RuntimeSecrets = {
    api_auth_token: current.api_auth_token ?? explicit.api_auth_token ?? generateSecret("lg_api"),
    telegram_webhook_secret: current.telegram_webhook_secret ?? explicit.telegram_webhook_secret ?? generateSecret("lg_wh"),
    linode_token_encryption_key: current.linode_token_encryption_key ?? explicit.linode_token_encryption_key ?? generateSecret("lg_enc")
  };
  await repository.set(SETTINGS_KEY, next);
  const keys: Array<keyof RuntimeSecrets> = ["api_auth_token", "telegram_webhook_secret", "linode_token_encryption_key"];
  return {
    secrets: next,
    created: keys.filter((key) => !current[key] && !explicit[key]),
    existing: keys.filter((key) => Boolean(current[key] || explicit[key]))
  };
}

function generateSecret(prefix: string): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `${prefix}_${toBase64Url(bytes)}`;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
