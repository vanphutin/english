export const consistencyPolicyVersion = 'gentle-consistency-v1' as const;

export const dailySurpriseSeeds = [
  [
    'A1_DAILY_ROUTINE',
    'A1',
    'MICRO_STORY',
    'Một buổi sáng rất ngắn',
    'Mai gets up at seven. She has breakfast and walks to work. Hãy để ý các động từ ở hiện tại đơn.',
    'DAILY_LIFE',
  ],
  [
    'A1_BE_PUZZLE',
    'A1',
    'ERROR_PUZZLE',
    'Tìm lỗi nhỏ',
    'Câu “They is at home” có một lỗi hòa hợp chủ ngữ – động từ. Bạn sửa được không?',
    'FAMILY',
  ],
  [
    'A2_TRAVEL_DETAIL',
    'A2',
    'CONTEXT_NOTE',
    'Một chi tiết khi đi xa',
    'Khi kể chuyến đi đã kết thúc, hãy neo câu bằng mốc thời gian rõ như yesterday hoặc last week.',
    'TRAVEL',
  ],
  [
    'B1_EXPERIENCE',
    'B1',
    'CONTEXT_NOTE',
    'Trải nghiệm hay thời điểm?',
    'Present perfect phù hợp khi trải nghiệm còn liên hệ hiện tại; past simple phù hợp khi thời điểm đã kết thúc.',
    'DAILY_LIFE',
  ],
  [
    'B2_HYPOTHESIS',
    'B2',
    'MICRO_STORY',
    'Một lựa chọn khác',
    'If Lan had left earlier, she would not have missed the train. Câu chuyện đổi hướng bằng điều kiện loại ba.',
    'TRAVEL',
  ],
  [
    'C1_HEDGING',
    'C1',
    'CONTEXT_NOTE',
    'Mềm hóa một lập luận',
    'It seems that và tends to giúp nhận định học thuật chính xác hơn mà không khẳng định quá mức.',
    'STUDY',
  ],
  [
    'C2_REGISTER',
    'C2',
    'CONTEXT_NOTE',
    'Cùng ý, khác register',
    'Một lựa chọn ngữ pháp tinh tế có thể chuyển giọng văn từ thân mật sang trang trọng mà không đổi nội dung cốt lõi.',
    'WORK',
  ],
] as const;

export const utcDate = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
export const dateKey = (value: Date): string => utcDate(value).toISOString().slice(0, 10);

export function isRestDateAllowed(date: Date, now: Date): boolean {
  const delta = utcDate(date).getTime() - utcDate(now).getTime();
  return delta >= -30 * 86_400_000 && delta <= 14 * 86_400_000;
}

/** Stable hash keeps a learner's published surprise unchanged for the entire UTC day. */
export function deterministicIndex(key: string, size: number): number {
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return size ? (hash >>> 0) % size : 0;
}
