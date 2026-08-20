import { isRestDateAllowed } from './consistency-policy.js';
import type { ConsistencyRepository } from './consistency-types.js';

export class ConsistencyService {
  constructor(private readonly repository: ConsistencyRepository) {}
  getCalendar(userId: string) {
    return this.repository.getCalendar(userId);
  }
  markRestDay(userId: string, dateText: string) {
    const date = new Date(`${dateText}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dateText) ||
      Number.isNaN(date.getTime()) ||
      !isRestDateAllowed(date, new Date())
    )
      throw new Error('INVALID_REST_DATE');
    return this.repository.markRestDay(userId, date);
  }
  getDailySurprise(userId: string) {
    return this.repository.getDailySurprise(userId);
  }
}
