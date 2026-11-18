import type { IClock } from '../domain/ports';

export class NodeClock implements IClock {
  now(): Date {
    return new Date();
  }
}
