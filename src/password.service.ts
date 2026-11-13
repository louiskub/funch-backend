import { Injectable } from '@nestjs/common';
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  ScryptOptions,
} from 'node:crypto';

const KEY_LENGTH = 64;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function derive(
  password: string,
  salt: Buffer,
  length: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, key) => {
      if (error) reject(error);
      else resolve(Buffer.from(key));
    });
  });
}

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await derive(password, salt, KEY_LENGTH, {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELIZATION,
      maxmem: 64 * 1024 * 1024,
    });
    return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString('hex')}$${key.toString('hex')}`;
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const [algorithm, costText, blockText, parallelText, saltText, keyText] =
      encoded.split('$');
    if (
      algorithm !== 'scrypt' ||
      !costText ||
      !blockText ||
      !parallelText ||
      !saltText ||
      !keyText
    )
      return false;
    const cost = Number(costText);
    const blockSize = Number(blockText);
    const parallelization = Number(parallelText);
    const salt = Buffer.from(saltText, 'hex');
    const expected = Buffer.from(keyText, 'hex');
    if (
      !Number.isSafeInteger(cost) ||
      !Number.isSafeInteger(blockSize) ||
      !Number.isSafeInteger(parallelization) ||
      salt.length < 16 ||
      expected.length !== KEY_LENGTH
    )
      return false;
    const actual = await derive(password, salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 64 * 1024 * 1024,
    });
    return timingSafeEqual(actual, expected);
  }
}
