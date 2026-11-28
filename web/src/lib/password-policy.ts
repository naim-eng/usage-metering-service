export const MIN_PASSWORD_LENGTH = 15;
export const MAX_PASSWORD_LENGTH = 128;

export function validateNewPassword(
  password: string
): string | null {
  if (
    password.length < MIN_PASSWORD_LENGTH ||
    Array.from(password.normalize("NFKC")).length <
      MIN_PASSWORD_LENGTH
  ) {
    return `Password must contain at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must contain no more than ${MAX_PASSWORD_LENGTH} characters.`;
  }

  return null;
}
