export interface ConsistencyDayView {
  date: string;
  type: 'LEARNING' | 'REST' | 'EMPTY';
  evidenceCount: number;
}
export interface ConsistencyCalendarView {
  policyVersion: 'gentle-consistency-v1';
  days: ConsistencyDayView[];
  meaningfulDayCount: number;
  currentRhythm: number;
  bestRhythm: number;
  messageVi: string;
}
export interface DailySurpriseView {
  date: string;
  contentKey: string;
  cefr: string;
  type: string;
  titleVi: string;
  bodyVi: string;
  topicCode: string;
  optional: true;
}
export interface ConsistencyRepository {
  getCalendar(userId: string, now?: Date): Promise<ConsistencyCalendarView>;
  markRestDay(userId: string, date: Date, now?: Date): Promise<ConsistencyCalendarView>;
  getDailySurprise(userId: string, now?: Date): Promise<DailySurpriseView | null>;
}
