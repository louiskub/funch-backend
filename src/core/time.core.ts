import { DateTime } from 'luxon';
import type { IsoInstant } from './core.types';

export function parseIsoInstant(value: IsoInstant): DateTime {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value))
    throw new TypeError(`Instant must include a UTC offset: ${value}`);
  const instant = DateTime.fromISO(value, { setZone: true });
  if (!instant.isValid) throw new TypeError(`Invalid ISO instant: ${value}`);
  return instant;
}
