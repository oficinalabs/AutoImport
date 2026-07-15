/**
 * Validação dos dados do stand — partilhada entre cliente (feedback no
 * formulário) e servidor (validação obrigatória em lib/data.ts).
 *
 * Só o nome é obrigatório: é o único que o registo recolhe. NIF, morada e
 * telefone ficam por preencher até o dono os escrever — mas se escrever,
 * têm de estar certos.
 */

export const MAX_NAME = 80;
export const MAX_ADDRESS = 200;

/**
 * Valida um NIF português: 9 dígitos, primeiro dígito de um tipo existente,
 * e dígito de controlo (módulo 11) certo.
 * Stands são empresas — normalmente 5 (coletiva) ou 1/2/3 (nome individual).
 */
export function isValidNif(value: string): boolean {
  const digits = value.replace(/\s/g, "");
  if (!/^\d{9}$/.test(digits)) return false;
  if (!"12356789".includes(digits[0])) return false;

  const sum = digits
    .slice(0, 8)
    .split("")
    .reduce((acc, d, i) => acc + Number(d) * (9 - i), 0);
  const rest = sum % 11;
  const check = rest < 2 ? 0 : 11 - rest;
  return check === Number(digits[8]);
}

/** Telefone PT: 9 dígitos começados em 2 (fixo) ou 9 (móvel). Aceita +351 e espaços. */
export function isValidPhone(value: string): boolean {
  const digits = value.replace(/[\s()-]/g, "").replace(/^\+351/, "");
  return /^[29]\d{8}$/.test(digits);
}

export interface StandFields {
  name: string;
  nif: string;
  address: string;
  phone: string;
}

/** Devolve a primeira mensagem de erro, ou null se estiver tudo bem. */
export function checkStandFields(f: StandFields): string | null {
  const name = f.name.trim();
  if (name.length < 2) return "O nome do stand é obrigatório.";
  if (name.length > MAX_NAME) return `O nome não pode ter mais de ${MAX_NAME} caracteres.`;

  const nif = f.nif.trim();
  if (nif && !isValidNif(nif)) return "O NIF não é válido. São 9 dígitos.";

  const address = f.address.trim();
  if (address.length > MAX_ADDRESS) {
    return `A morada não pode ter mais de ${MAX_ADDRESS} caracteres.`;
  }

  const phone = f.phone.trim();
  if (phone && !isValidPhone(phone)) {
    return "O telefone não é válido. Ex.: 253 000 000 ou 912 345 678.";
  }

  return null;
}
