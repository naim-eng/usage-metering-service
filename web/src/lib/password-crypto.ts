import {
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

const HASH_VERSION = "scrypt-v1";

const LEGACY_PARAMETERS = {
  N: 16384,
  r: 16,
  p: 1,
};

const CURRENT_PARAMETERS = {
  N: 32768,
  r: 8,
  p: 3,
};

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

type ScryptParameters = {
  N: number;
  r: number;
  p: number;
};

function deriveKey(
  password: string,
  salt: string,
  parameters: ScryptParameters
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      {
        ...parameters,
        maxmem: MAX_MEMORY,
      },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(key);
      }
    );
  });
}

export async function hashCustomerPassword(
  password: string
): Promise<string> {
  const salt = randomBytes(SALT_LENGTH).toString("hex");

  const key = await deriveKey(
    password,
    salt,
    CURRENT_PARAMETERS
  );

  return `${HASH_VERSION}:${salt}:${key.toString("hex")}`;
}

export async function verifyCustomerPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  const parts = hash.split(":");

  let salt: string;
  let storedKey: string;
  let parameters: ScryptParameters;

  if (parts.length === 2) {
    [salt, storedKey] = parts;
    parameters = LEGACY_PARAMETERS;
  } else if (
    parts.length === 3 &&
    parts[0] === HASH_VERSION
  ) {
    [, salt, storedKey] = parts;
    parameters = CURRENT_PARAMETERS;
  } else {
    return false;
  }

  if (
    salt.length !== SALT_LENGTH * 2 ||
    storedKey.length !== KEY_LENGTH * 2 ||
    !/^[0-9a-f]+$/.test(salt) ||
    !/^[0-9a-f]+$/.test(storedKey)
  ) {
    return false;
  }

  const expectedKey = Buffer.from(storedKey, "hex");

  const actualKey = await deriveKey(
    password,
    salt,
    parameters
  );

  return timingSafeEqual(actualKey, expectedKey);
}
