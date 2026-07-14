/**
 * Regras de password — partilhadas entre cliente (UI de requisitos) e
 * servidor (validação obrigatória em lib/auth.ts).
 *
 * Nota: o comprimento é a defesa mais eficaz; as regras de composição
 * existem para travar as escolhas mais fracas. A blocklist apanha as
 * passwords mais óbvias — o resto é travado pelo rate limiting.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: `Pelo menos ${MIN_PASSWORD_LENGTH} caracteres`,
    test: (p) => p.length >= MIN_PASSWORD_LENGTH,
  },
  { id: "lower", label: "Uma letra minúscula", test: (p) => /[a-z]/.test(p) },
  { id: "upper", label: "Uma letra maiúscula", test: (p) => /[A-Z]/.test(p) },
  { id: "digit", label: "Um número", test: (p) => /\d/.test(p) },
  {
    id: "symbol",
    label: "Um símbolo (ex.: ! ? @ #)",
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

/** Passwords demasiado óbvias, mesmo que cumpram as regras acima. */
const BLOCKLIST = [
  "password",
  "passw0rd",
  "123456",
  "12345678",
  "qwerty",
  "autoimport",
  "carro",
  "stand",
  "admin",
];

export interface PasswordCheck {
  valid: boolean;
  /** ids das regras por cumprir */
  failed: string[];
  /** primeira mensagem de erro legível, para o servidor devolver */
  message?: string;
}

export function checkPassword(password: string): PasswordCheck {
  const failed = PASSWORD_RULES.filter((r) => !r.test(password)).map((r) => r.id);

  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      valid: false,
      failed: ["length"],
      message: `A password não pode ter mais de ${MAX_PASSWORD_LENGTH} caracteres.`,
    };
  }

  const lowered = password.toLowerCase();
  if (BLOCKLIST.some((word) => lowered.includes(word))) {
    return {
      valid: false,
      failed: [...failed, "common"],
      message: "Essa password é demasiado comum. Escolhe outra.",
    };
  }

  if (failed.length > 0) {
    const labels = PASSWORD_RULES.filter((r) => failed.includes(r.id))
      .map((r) => r.label.toLowerCase())
      .join(", ");
    return { valid: false, failed, message: `A password precisa de: ${labels}.` };
  }

  return { valid: true, failed: [] };
}
