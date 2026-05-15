const GENERIC_SECRET_PATTERNS = [
  /Bearer\s+[^\s]+/gi,
  /linode_[A-Za-z0-9_\-]{20,}/g,
  /bot\d+:[A-Za-z0-9_\-]{10,}/g
];

export function sanitizeSensitiveText(input: string, explicitSecrets: Array<string | undefined | null> = []): string {
  let sanitized = input;
  for (const pattern of GENERIC_SECRET_PATTERNS) sanitized = sanitized.replace(pattern, "[REDACTED]");
  for (const secret of explicitSecrets) {
    if (!secret) continue;
    sanitized = sanitized.split(secret).join("[REDACTED]");
  }
  return sanitized;
}
