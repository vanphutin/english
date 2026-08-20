'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ApiError,
  api,
  idempotencyKey,
  type AttemptView,
  type DailyChoiceView,
  type ErrorNotebookView,
  type InterestPreferencesView,
  type AchievementView,
  type WeeklyReflectionView,
  type ConsistencyCalendarView,
  type DailySurpriseView,
  type ProgressView,
  type SessionState,
  type SessionSummary,
  type StoryJourneyView,
  type UnitChallengeView,
  type UserView,
  type VocabularyHintView,
} from '../lib/api';

type Screen =
  | 'loading'
  | 'login'
  | 'dashboard'
  | 'notebook'
  | 'growth'
  | 'story'
  | 'exercise'
  | 'evaluating'
  | 'feedback'
  | 'summary'
  | 'challenge-result';
const pendingKey = 'grammar-path:pending-attempt';
const challengeKey = (sessionId: string) => `grammar-path:challenge:${sessionId}`;
const draftKey = (id: string) => `grammar-path:draft:${id}`;
const sessionInUrl = () => new URLSearchParams(window.location.search).get('session');
const updateUrl = (id?: string) => {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('session', id);
  else url.searchParams.delete('session');
  window.history.replaceState({}, '', url);
};
const activityLabels: Record<string, string> = {
  TRANSLATE_CONTEXT: 'Dịch theo ngữ cảnh',
  CORRECT_ERROR: 'Sửa lỗi',
  TRANSFORM_SENTENCE: 'Biến đổi câu',
  COMPLETE_SENTENCE: 'Hoàn thành câu',
  ORDER_WORDS: 'Sắp xếp từ',
  SELECT_IN_CONTEXT: 'Chọn trong ngữ cảnh',
  GUIDED_WRITING: 'Viết có hướng dẫn',
  MINI_DIALOGUE: 'Hội thoại ngắn',
};

export function LearningApp() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [user, setUser] = useState<UserView | null>(null);
  const [progress, setProgress] = useState<ProgressView | null>(null);
  const [dailyChoices, setDailyChoices] = useState<DailyChoiceView[]>([]);
  const [notebook, setNotebook] = useState<ErrorNotebookView | null>(null);
  const [interests, setInterests] = useState<InterestPreferencesView | null>(null);
  const [achievements, setAchievements] = useState<AchievementView[]>([]);
  const [weeklyReflection, setWeeklyReflection] = useState<WeeklyReflectionView | null>(null);
  const [consistency, setConsistency] = useState<ConsistencyCalendarView | null>(null);
  const [dailySurprise, setDailySurprise] = useState<DailySurpriseView | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [challenge, setChallenge] = useState<UnitChallengeView | null>(null);
  const [story, setStory] = useState<StoryJourneyView | null>(null);
  const [draft, setDraft] = useState('');
  const [hints, setHints] = useState<VocabularyHintView[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  const dashboard = useCallback(async () => {
    const [nextProgress, choices, nextConsistency, surprise] = await Promise.all([
      api<ProgressView | null>('/me/progress'),
      api<DailyChoiceView[]>('/me/daily-choices'),
      api<ConsistencyCalendarView>('/me/consistency-calendar'),
      api<DailySurpriseView | null>('/me/daily-surprise'),
    ]);
    setProgress(nextProgress);
    setDailyChoices(choices);
    setConsistency(nextConsistency);
    setDailySurprise(surprise);
    setSession(null);
    setAttempt(null);
    setSummary(null);
    updateUrl();
    setScreen('dashboard');
  }, []);

  const markRestToday = async () => {
    setBusy(true);
    setError('');
    try {
      const date = new Date().toISOString().slice(0, 10);
      setConsistency(
        await api<ConsistencyCalendarView>('/me/consistency-calendar/rest-days', {
          method: 'POST',
          body: JSON.stringify({ date }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chưa thể đánh dấu ngày nghỉ.');
    } finally {
      setBusy(false);
    }
  };

  const openSession = useCallback(async (id: string) => {
    const next = await api<SessionState>(`/sessions/${id}`);
    setSession(next);
    updateUrl(id);
    if (next.status === 'COMPLETED' && next.summary) {
      const challengeId = localStorage.getItem(challengeKey(id));
      if (challengeId) {
        setChallenge(await api<UnitChallengeView>(`/unit-challenges/${challengeId}`));
        setScreen('challenge-result');
        return;
      }
      setSummary(next.summary);
      setScreen('summary');
      return;
    }
    const pending = localStorage.getItem(pendingKey);
    if (pending) {
      const saved = JSON.parse(pending) as { attemptId: string; sessionId: string };
      if (saved.sessionId === id) {
        setAttempt({ attemptId: saved.attemptId, status: 'SUBMITTED' });
        setScreen('evaluating');
        return;
      }
    }
    if (!next.currentItem) {
      setError('Buổi học chưa có bài tiếp theo. Hãy thử tải lại.');
      setScreen('exercise');
      return;
    }
    setHints(
      await api<VocabularyHintView[]>(`/session-items/${next.currentItem.sessionItemId}/hints`),
    );
    setDraft(localStorage.getItem(draftKey(next.currentItem.sessionItemId)) || '');
    setScreen('exercise');
  }, []);

  const openNotebook = async () => {
    setBusy(true);
    setError('');
    setScreen('notebook');
    try {
      setNotebook(await api<ErrorNotebookView>('/me/error-notebook'));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chưa thể mở sổ tay lỗi.');
    } finally {
      setBusy(false);
    }
  };

  const openStory = async () => {
    setBusy(true);
    setError('');
    setScreen('story');
    try {
      setStory(await api<StoryJourneyView>('/me/story'));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chưa thể mở hành trình câu chuyện.');
    } finally {
      setBusy(false);
    }
  };

  const openGrowth = async () => {
    setBusy(true);
    setError('');
    setScreen('growth');
    try {
      const [nextInterests, nextAchievements, nextReflection] = await Promise.all([
        api<InterestPreferencesView>('/me/interests'),
        api<AchievementView[]>('/me/achievements'),
        api<WeeklyReflectionView>('/me/weekly-reflections'),
      ]);
      setInterests(nextInterests);
      setAchievements(nextAchievements);
      setWeeklyReflection(nextReflection);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chưa thể mở góc tiến bộ.');
    } finally {
      setBusy(false);
    }
  };

  const toggleInterest = (topicCode: string) =>
    setInterests((current) => {
      if (!current) return current;
      const selected = current.selectedTopics.includes(topicCode)
        ? current.selectedTopics.filter((code) => code !== topicCode)
        : current.selectedTopics.length < 5
          ? [...current.selectedTopics, topicCode]
          : current.selectedTopics;
      return { ...current, selectedTopics: selected };
    });

  const saveInterests = async () => {
    if (!interests) return;
    setBusy(true);
    setError('');
    try {
      setInterests(
        await api<InterestPreferencesView>('/me/interests', {
          method: 'PUT',
          body: JSON.stringify({ topicCodes: interests.selectedTopics }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chưa thể lưu chủ đề.');
    } finally {
      setBusy(false);
    }
  };

  const chooseStory = async (sceneId: string, choiceId: string) => {
    setBusy(true);
    setError('');
    try {
      setStory(
        await api<StoryJourneyView>(`/me/story/scenes/${sceneId}/choices`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey(`story-choice-${sceneId}`) },
          body: JSON.stringify({ choiceId }),
        }),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chưa thể lưu lựa chọn câu chuyện.');
    } finally {
      setBusy(false);
    }
  };

  const continueStory = async (sceneId: string) => {
    setBusy(true);
    setError('');
    try {
      setStory(
        await api<StoryJourneyView>(`/me/story/scenes/${sceneId}/continue`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey(`story-next-${sceneId}`) },
        }),
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chưa thể chuyển sang cảnh tiếp theo.');
    } finally {
      setBusy(false);
    }
  };

  const practiceStory = async (sceneId: string) => {
    setBusy(true);
    setError('');
    try {
      const created = await api<{ id: string }>(`/me/story/scenes/${sceneId}/practice`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey(`story-practice-${sceneId}`) },
      });
      await openSession(created.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chưa thể mở bài học trong cảnh này.');
    } finally {
      setBusy(false);
    }
  };

  const practiceError = async (patternId: string) => {
    setBusy(true);
    setError('');
    try {
      const created = await api<{ id: string }>(`/me/error-notebook/${patternId}/practice`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey(`error-${patternId}`) },
      });
      await openSession(created.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chưa thể tạo bài luyện lỗi này.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const me = await api<UserView>('/auth/me');
        setUser(me);
        const id = sessionInUrl();
        if (id) await openSession(id);
        else await dashboard();
      } catch (cause) {
        if (!(cause instanceof ApiError && cause.status === 401))
          setError('Không thể mở ứng dụng. Kiểm tra API và thử lại.');
        setScreen('login');
      }
    })();
  }, [dashboard, openSession]);

  useEffect(() => {
    if (screen !== 'evaluating' || !attempt || !session) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<AttemptView>(`/attempts/${attempt.attemptId}`);
        if (cancelled) return;
        setAttempt(next);
        if (['EVALUATED', 'NEEDS_REVIEW', 'FAILED'].includes(next.status)) {
          localStorage.removeItem(pendingKey);
          if (!next.evaluation) {
            setError(
              'AI chưa thể hoàn tất đánh giá. Câu này không ảnh hưởng tiến độ; bạn có thể thử lại.',
            );
            setScreen('exercise');
            return;
          }
          setScreen('feedback');
          return;
        }
        timer = setTimeout(() => void poll(), 1200);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          setScreen('login');
          return;
        }
        if (!cancelled) timer = setTimeout(() => void poll(), 2500);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [attempt?.attemptId, screen, session]);
  useEffect(() => {
    if (screen === 'exercise') setTimeout(() => answerRef.current?.focus(), 0);
  }, [screen, session?.currentItem?.sessionItemId]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const me = await api<UserView>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      });
      setUser(me);
      await dashboard();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 401
          ? 'Tên đăng nhập hoặc mật khẩu chưa đúng.'
          : 'Không thể đăng nhập lúc này.',
      );
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    setBusy(true);
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem(pendingKey);
      setUser(null);
      updateUrl();
      setScreen('login');
      setBusy(false);
    }
  };
  const start = async (mode: 'DAILY' | 'REVIEW' = 'DAILY', targetMinutes = 10) => {
    setBusy(true);
    setError('');
    try {
      const created = await api<{ id: string }>('/sessions', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey('session') },
        body: JSON.stringify({ mode, targetMinutes }),
      });
      await openSession(created.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chưa thể bắt đầu buổi học.');
    } finally {
      setBusy(false);
    }
  };
  const startChallenge = async (unitId: string) => {
    setBusy(true);
    setError('');
    try {
      const created = await api<{ challengeId: string; sessionId: string }>(
        `/curriculum-units/${unitId}/challenge`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey(`challenge-${unitId}`) },
        },
      );
      localStorage.setItem(challengeKey(created.sessionId), created.challengeId);
      await openSession(created.sessionId);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chưa thể bắt đầu thử thách unit.');
    } finally {
      setBusy(false);
    }
  };

  const remediateChallenge = async () => {
    if (!challenge) return;
    setBusy(true);
    setError('');
    try {
      const created = await api<{ id: string }>(`/unit-challenges/${challenge.id}/remediation`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey(`challenge-fix-${challenge.id}`) },
      });
      await openSession(created.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chưa thể tạo bài luyện bù.');
    } finally {
      setBusy(false);
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const item = session?.currentItem;
    if (!item || !draft.trim()) return;
    setBusy(true);
    setError('');
    try {
      const next = await api<AttemptView>(`/session-items/${item.sessionItemId}/attempts`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey('attempt') },
        body: JSON.stringify({ answer: draft }),
      });
      localStorage.removeItem(draftKey(item.sessionItemId));
      localStorage.setItem(
        pendingKey,
        JSON.stringify({ attemptId: next.attemptId, sessionId: session.id }),
      );
      setAttempt(next);
      setScreen(next.evaluation ? 'feedback' : 'evaluating');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 422 && item) {
        localStorage.removeItem(draftKey(item.sessionItemId));
      }
      setError(
        cause instanceof ApiError && cause.status === 422
          ? 'Bạn đã dùng hết 3 lượt cho câu này. Hãy nhấn Sang câu tiếp theo để tiếp tục.'
          : cause instanceof ApiError
            ? cause.message
            : 'Chưa thể gửi câu trả lời.',
      );
    } finally {
      setBusy(false);
    }
  };
  const revealHint = async () => {
    if (!session?.currentItem) return;
    setBusy(true);
    setError('');
    try {
      const hint = await api<VocabularyHintView>(
        `/session-items/${session.currentItem.sessionItemId}/hints/next`,
        { method: 'POST' },
      );
      setHints((current) => [...current.filter((item) => item.id !== hint.id), hint]);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 404
          ? 'Không còn gợi ý nào khác cho câu này.'
          : 'Chưa thể mở gợi ý.',
      );
    } finally {
      setBusy(false);
    }
  };
  const next = async (forceAdvance = false) => {
    if (!session) return;
    if (
      !forceAdvance &&
      attempt?.evaluation?.disposition === 'RETRY' &&
      attempt.evaluation.canRetry
    ) {
      setAttempt(null);
      setDraft('');
      setScreen('exercise');
      return;
    }
    if (!forceAdvance && attempt?.evaluation?.disposition === 'SYSTEM_REVIEW') {
      await dashboard();
      return;
    }
    setBusy(true);
    setError('');
    setDraft('');
    try {
      const refreshed = await api<SessionState>(`/sessions/${session.id}`);
      setSession(refreshed);
      setAttempt(null);
      if (refreshed.currentItem) {
        setHints(
          await api<VocabularyHintView[]>(
            `/session-items/${refreshed.currentItem.sessionItemId}/hints`,
          ),
        );
        setDraft(localStorage.getItem(draftKey(refreshed.currentItem.sessionItemId)) || '');
        setScreen('exercise');
      } else {
        const done = await api<SessionSummary>(`/sessions/${session.id}/complete`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey('complete') },
        });
        const challengeId = localStorage.getItem(challengeKey(session.id));
        if (challengeId) {
          setChallenge(await api<UnitChallengeView>(`/unit-challenges/${challengeId}`));
          setScreen('challenge-result');
          return;
        }
        setSummary(done);
        setScreen('summary');
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chưa thể chuyển sang bài tiếp theo.');
    } finally {
      setBusy(false);
    }
  };

  const roadmap = progress?.roadmap ?? [];

  return (
    <main className="app-shell" suppressHydrationWarning>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => user && void dashboard()}
          aria-label="Về trang chính"
        >
          <span className="brand-mark">G</span>
          <span>Grammar Path</span>
        </button>
        {user && (
          <div className="user-actions">
            <button className="text-button" onClick={() => void openNotebook()} disabled={busy}>
              Sổ tay lỗi
            </button>
            <button className="text-button" onClick={() => void openStory()} disabled={busy}>
              Hành trình
            </button>
            <button className="text-button" onClick={() => void openGrowth()} disabled={busy}>
              Góc tiến bộ
            </button>
            <span>Chào, {user.displayName}</span>
            <button className="text-button" onClick={() => void logout()} disabled={busy}>
              Đăng xuất
            </button>
          </div>
        )}
      </header>
      {screen === 'loading' && (
        <section className="center-card" aria-live="polite">
          <div className="spinner" />
          <p>Đang mở lộ trình của bạn…</p>
        </section>
      )}
      {screen === 'login' && (
        <section className="login-layout">
          <div className="login-story">
            <p className="eyebrow">Học từng bước, nhớ thật lâu</p>
            <h1>
              Ngữ pháp rõ ràng.
              <br />
              Tiến bộ mỗi ngày.
            </h1>
            <p>
              Luyện dịch theo ngữ cảnh tiếng Việt, nhận phản hồi thông minh và ôn đúng phần bạn còn
              yếu.
            </p>
          </div>
          <form className="login-card" onSubmit={(e) => void login(e)}>
            <div>
              <p className="step-label">Chào mừng trở lại</p>
              <h2>Đăng nhập để tiếp tục</h2>
            </div>
            <label>
              Tên đăng nhập
              <input name="username" autoComplete="username" required />
            </label>
            <label>
              Mật khẩu
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                minLength={8}
                required
              />
            </label>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button" disabled={busy}>
              {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </button>
            <p className="privacy-note">Dữ liệu học được lưu trên máy của bạn.</p>
          </form>
        </section>
      )}
      {screen === 'dashboard' && (
        <section className="dashboard">
          <header className="roadmap-header">
            <div>
              <p className="eyebrow">Lộ trình ngữ pháp A1 → C2</p>
              <h1>Con đường học của bạn</h1>
              <p>Đi từng chặng, luyện từng chủ điểm và luôn ôn lại kiến thức đã học.</p>
            </div>
            <div className="roadmap-summary">
              <strong>{progress?.currentLevel.cefr || 'A1'}</strong>
              <span>Level hiện tại</span>
            </div>
          </header>
          <section className="daily-choice-section" aria-labelledby="daily-choice-title">
            <div>
              <p className="step-label">Hôm nay bạn muốn học thế nào?</p>
              <h2 id="daily-choice-title">Chọn một nhịp học phù hợp</h2>
            </div>
            <div className="daily-choice-grid">
              {dailyChoices.map((choice) => (
                <button
                  className={`daily-choice-card daily-choice-${choice.type.toLowerCase()}`}
                  key={choice.type}
                  disabled={busy}
                  onClick={() => void start(choice.action.mode, choice.action.targetMinutes)}
                >
                  <span>{choice.estimatedMinutes} phút</span>
                  <strong>{choice.titleVi}</strong>
                  <small>{choice.descriptionVi}</small>
                  <b>Bắt đầu →</b>
                </button>
              ))}
            </div>
          </section>
          <section className="gentle-dashboard" aria-label="Nhịp học nhẹ nhàng">
            <article className="consistency-card">
              <div className="consistency-heading">
                <div>
                  <p className="step-label">Nhịp học của bạn</p>
                  <h2>{consistency?.meaningfulDayCount ?? 0} ngày học có ý nghĩa</h2>
                </div>
                <div className="rhythm-stats">
                  <strong>{consistency?.currentRhythm ?? 0}</strong>
                  <span>nhịp hiện tại</span>
                  <strong>{consistency?.bestRhythm ?? 0}</strong>
                  <span>nhịp tốt nhất</span>
                </div>
              </div>
              <div className="consistency-calendar">
                {consistency?.days.map((day) => (
                  <span
                    key={day.date}
                    className={`calendar-day day-${day.type.toLowerCase()}`}
                    title={`${day.date}: ${day.type}`}
                    aria-label={`${day.date}: ${day.type}`}
                  >
                    {new Date(`${day.date}T00:00:00Z`).getUTCDate()}
                  </span>
                ))}
              </div>
              <p>{consistency?.messageVi}</p>
              <button className="text-button" disabled={busy} onClick={() => void markRestToday()}>
                Hôm nay tôi nghỉ ngơi
              </button>
            </article>
            {dailySurprise && (
              <article className="surprise-card">
                <span>Bất ngờ hôm nay · {dailySurprise.cefr}</span>
                <h2>{dailySurprise.titleVi}</h2>
                <p>{dailySurprise.bodyVi}</p>
                <small>Tùy chọn · Không ảnh hưởng lộ trình hay mastery</small>
              </article>
            )}
          </section>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="learning-roadmap">
            {roadmap.map((level, index) => (
              <article
                className={`roadmap-level roadmap-level-${level.status.toLowerCase()}`}
                key={level.id}
              >
                <div className="roadmap-track" aria-hidden="true">
                  <div
                    className="level-orbit"
                    style={
                      { '--level-progress': `${level.progressPercent}%` } as React.CSSProperties
                    }
                  >
                    <div>
                      <strong>{level.cefr}</strong>
                      <span>
                        {level.status === 'COMPLETED'
                          ? '✓ Hoàn thành'
                          : level.status === 'CURRENT'
                            ? `${level.progressPercent}%`
                            : '🔒'}
                      </span>
                    </div>
                  </div>
                  {index < roadmap.length - 1 && <span className="roadmap-line" />}
                </div>
                <div className="level-content">
                  <div className="level-heading">
                    <div>
                      <p className="step-label">
                        {level.status === 'CURRENT'
                          ? 'Bạn đang ở đây'
                          : level.status === 'COMPLETED'
                            ? 'Đã hoàn thành'
                            : 'Chặng tiếp theo'}
                      </p>
                      <h2>{level.title}</h2>
                    </div>
                    <span>{level.units.flatMap((unit) => unit.grammarPoints).length} chủ điểm</span>
                  </div>
                  <div className="level-units">
                    {level.units.map((unit) => (
                      <section className="roadmap-unit" key={unit.id}>
                        <h3>{unit.title}</h3>
                        <ul>
                          {unit.grammarPoints.map((point) => (
                            <li key={point.code}>{point.title}</li>
                          ))}
                        </ul>
                        {level.status === 'CURRENT' && (
                          <button
                            className="challenge-button"
                            disabled={busy}
                            onClick={() => void startChallenge(unit.id)}
                          >
                            Thử thách unit
                          </button>
                        )}
                      </section>
                    ))}
                  </div>
                  {level.status === 'CURRENT' && progress && (
                    <div className="current-level-action">
                      <div>
                        <strong>
                          {progress.nextAction.type === 'RESUME_SESSION'
                            ? 'Buổi học đang chờ bạn'
                            : 'Sẵn sàng cho bài tiếp theo'}
                        </strong>
                        <span>
                          {progress.masteredPoints}/{progress.requiredPoints} chủ điểm thành thạo
                        </span>
                      </div>
                      <button
                        className="primary-button"
                        disabled={busy}
                        onClick={() =>
                          progress.nextAction.type === 'RESUME_SESSION'
                            ? void openSession(progress.nextAction.sessionId)
                            : void start(
                                progress.nextAction.type === 'START_REVIEW' ? 'REVIEW' : 'DAILY',
                              )
                        }
                      >
                        {busy
                          ? 'Đang chuẩn bị…'
                          : progress.nextAction.type === 'RESUME_SESSION'
                            ? 'Tiếp tục học'
                            : 'Bắt đầu học'}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {screen === 'notebook' && (
        <section className="notebook-layout">
          <button className="back-button" onClick={() => void dashboard()}>
            ← Về lộ trình
          </button>
          <header className="notebook-header">
            <div>
              <p className="eyebrow">Nhìn lại để tiến bộ</p>
              <h1>Sổ tay lỗi của bạn</h1>
              <p>Mỗi lỗi là một tín hiệu để ứng dụng chọn đúng phần bạn cần luyện thêm.</p>
            </div>
            <span>{notebook?.patterns.length ?? 0} mẫu lỗi</span>
          </header>
          {busy && !notebook && <p className="notebook-empty">Đang tổng hợp lịch sử học…</p>}
          {!busy && notebook?.patterns.length === 0 && (
            <div className="notebook-empty">
              <strong>Chưa có lỗi lặp lại cần ôn</strong>
              <p>Hãy tiếp tục học; các lỗi hữu ích sẽ tự xuất hiện ở đây.</p>
            </div>
          )}
          <div className="error-pattern-list">
            {notebook?.patterns.map((pattern) => (
              <article
                className={`error-pattern-card state-${pattern.state.toLowerCase()}`}
                key={pattern.id}
              >
                <div className="error-pattern-heading">
                  <div>
                    <span>{pattern.state}</span>
                    <h2>{pattern.grammarTitle}</h2>
                  </div>
                  <strong>{pattern.occurrenceCount} lần gặp</strong>
                </div>
                <p className="error-pattern-code">
                  {pattern.category} · {pattern.code}
                </p>
                <blockquote>{pattern.representative.answer}</blockquote>
                <p>{pattern.representative.feedbackVi}</p>
                {pattern.representative.correctedAnswer && (
                  <p className="error-correction">
                    Gợi ý sửa: <strong>{pattern.representative.correctedAnswer}</strong>
                  </p>
                )}
                <footer>
                  <small>
                    Gần nhất: {new Date(pattern.lastSeenAt).toLocaleDateString('vi-VN')}
                  </small>
                  <button
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void practiceError(pattern.id)}
                  >
                    Luyện lỗi này
                  </button>
                </footer>
              </article>
            ))}
          </div>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
      {screen === 'growth' && (
        <section className="growth-layout">
          <button className="back-button" onClick={() => void dashboard()}>
            ← Về lộ trình
          </button>
          <header className="notebook-header">
            <div>
              <p className="eyebrow">Cá nhân hóa có mục đích</p>
              <h1>Góc tiến bộ của bạn</h1>
              <p>
                Sở thích giúp bài học gần gũi hơn; thành tựu và báo cáo chỉ dựa trên bằng chứng học
                thật.
              </p>
            </div>
          </header>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="growth-grid">
            <section className="growth-panel">
              <p className="step-label">Chủ đề yêu thích</p>
              <h2>Chọn tối đa 5 chủ đề</h2>
              <p>Ứng dụng ưu tiên ngữ cảnh phù hợp nhưng vẫn giữ đầy đủ lộ trình ngữ pháp.</p>
              <div className="topic-chips">
                {interests?.approvedTopics.map((code) => (
                  <button
                    key={code}
                    className={
                      interests.selectedTopics.includes(code) ? 'topic-chip selected' : 'topic-chip'
                    }
                    onClick={() => toggleInterest(code)}
                  >
                    {code.replaceAll('_', ' ')}
                  </button>
                ))}
              </div>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => void saveInterests()}
              >
                {busy ? 'Đang lưu…' : 'Lưu sở thích'}
              </button>
            </section>
            <section className="growth-panel">
              <p className="step-label">Nhìn lại tuần này</p>
              <h2>
                {weeklyReflection?.weekStart} → {weeklyReflection?.weekEnd}
              </h2>
              <ul className="weekly-claims">
                {weeklyReflection?.claims.map((claim) => (
                  <li key={claim.code}>{claim.textVi}</li>
                ))}
              </ul>
              {weeklyReflection && (
                <div className="next-focus">
                  <strong>Gợi ý tiếp theo</strong>
                  <span>{weeklyReflection.nextFocus.textVi}</span>
                </div>
              )}
            </section>
          </div>
          <section className="growth-panel achievement-section">
            <p className="step-label">Bộ sưu tập thành tựu</p>
            <h2>Những cột mốc có ý nghĩa</h2>
            <div className="achievement-grid">
              {achievements.map((item) => (
                <article
                  className={item.granted ? 'achievement-card granted' : 'achievement-card locked'}
                  key={item.code}
                >
                  <span>{item.granted ? '★' : '○'}</span>
                  <div>
                    <h3>{item.titleVi}</h3>
                    <p>{item.descriptionVi}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>
      )}
      {screen === 'story' && (
        <section className="story-layout">
          <button className="back-button" onClick={() => void dashboard()}>
            ← Về lộ trình
          </button>
          {story && (
            <>
              <header className="story-header">
                <div>
                  <p className="eyebrow">Story Journey · {story.series.cefr}</p>
                  <h1>{story.series.title}</h1>
                  <p>{story.series.description}</p>
                </div>
                <strong>
                  {story.completedSceneCount}/{story.totalSceneCount} cảnh
                </strong>
              </header>
              {story.currentScene ? (
                <article className="story-scene-card">
                  <p className="step-label">{story.currentScene.chapterTitle}</p>
                  <h2>{story.currentScene.title}</h2>
                  <p className="story-narrative">{story.currentScene.narrativeVi}</p>
                  <div className="story-dialogue">
                    {story.currentScene.dialogue.map((line, index) => (
                      <p key={`${line.speaker}-${index}`}>
                        <strong>{line.speaker}</strong>
                        <span>{line.text}</span>
                      </p>
                    ))}
                  </div>
                  <div className="story-actions">
                    {story.currentScene.hasLearningAction && (
                      <button
                        className="primary-button"
                        disabled={busy}
                        onClick={() => void practiceStory(story.currentScene!.id)}
                      >
                        Luyện ngữ pháp trong cảnh
                      </button>
                    )}
                    {story.currentScene.choices.map((choice) => (
                      <button
                        className="story-choice"
                        disabled={busy}
                        key={choice.id}
                        onClick={() => void chooseStory(story.currentScene!.id, choice.id)}
                      >
                        {choice.labelVi}
                      </button>
                    ))}
                    {story.currentScene.choices.length === 0 && (
                      <button
                        className="story-choice"
                        disabled={busy}
                        onClick={() => void continueStory(story.currentScene!.id)}
                      >
                        {story.completedSceneCount + 1 === story.totalSceneCount
                          ? 'Hoàn thành câu chuyện'
                          : 'Sang cảnh tiếp theo'}
                      </button>
                    )}
                  </div>
                  <small className="skip-note">
                    Bạn có thể bỏ qua phần kể chuyện; bài luyện ngữ pháp tương đương luôn ở phía
                    trên.
                  </small>
                </article>
              ) : (
                <div className="notebook-empty">
                  <strong>Bạn đã hoàn thành câu chuyện!</strong>
                  <p>Các kết quả ngữ pháp vẫn được lưu trong tiến độ học bình thường.</p>
                </div>
              )}
            </>
          )}
          {busy && !story && <p>Đang mở câu chuyện…</p>}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
      {(screen === 'exercise' || screen === 'evaluating') && session && (
        <section className="lesson-layout">
          <div className="lesson-meta">
            <button className="back-button" onClick={() => void dashboard()}>
              ← Thoát buổi học
            </button>
            <span>
              Bài {Math.min(session.progress.completed + 1, session.progress.total)} /{' '}
              {session.progress.total}
            </span>
          </div>
          <div className="lesson-progress">
            <span
              style={{
                width: `${session.progress.total ? (session.progress.completed / session.progress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <article className="exercise-card">
            <div className="target-row">
              <span className="step-label">
                {activityLabels[session.currentItem?.type ?? ''] ?? 'Ngữ pháp mục tiêu'}
              </span>
              {session.currentItem?.targets.map((t) => (
                <span className="target-chip" key={t.code}>
                  {t.title}
                </span>
              ))}
            </div>
            <div className="grammar-guides">
              {session.currentItem?.targets.map((target) => (
                <details className="grammar-guide" key={target.code} open>
                  <summary>
                    <span>
                      {target.cefr ? `${target.cefr} · ` : ''}
                      {target.title}
                    </span>
                    <small>Xem cấu trúc chi tiết</small>
                  </summary>
                  <div className="grammar-guide-content">
                    {target.learningObjectiveVi && (
                      <p className="grammar-objective">{target.learningObjectiveVi}</p>
                    )}
                    <div className="grammar-columns">
                      <section>
                        <h2>Cấu trúc</h2>
                        <ul className="formula-list">
                          {(target.formPatterns ?? []).map((pattern) => (
                            <li key={pattern}>
                              <code>{pattern}</code>
                            </li>
                          ))}
                        </ul>
                      </section>
                      <section>
                        <h2>Cách dùng</h2>
                        <ul>
                          {(target.meaningUses ?? []).map((meaning) => (
                            <li key={meaning}>{meaning}</li>
                          ))}
                          {(target.usageNotes ?? []).map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      </section>
                    </div>
                    {(target.rules?.length ?? 0) > 0 && (
                      <section className="grammar-rules">
                        <h2>Quy tắc cần nhớ</h2>
                        <ul>
                          {(target.rules ?? []).map((rule) => (
                            <li key={rule.code}>{rule.description}</li>
                          ))}
                        </ul>
                      </section>
                    )}
                    {(target.examples?.length ?? 0) > 0 && (
                      <section className="grammar-examples">
                        <h2>Ví dụ</h2>
                        <div className="example-list">
                          {(target.examples ?? []).map((example, index) => (
                            <article key={`${example.type}-${index}`}>
                              <strong>{example.english}</strong>
                              <span>{example.vietnamese}</span>
                              <small>{example.explanationVi}</small>
                            </article>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                </details>
              ))}
            </div>
            <p className="context">{session.currentItem?.contextVi}</p>
            {session.currentItem?.type === 'ORDER_WORDS' &&
              Array.isArray(session.currentItem.promptPayload.wordBank) && (
                <div className="word-bank" aria-label="Các từ cần sắp xếp">
                  {(session.currentItem.promptPayload.wordBank as string[]).map((word, index) => (
                    <span key={`${word}-${index}`}>{word}</span>
                  ))}
                </div>
              )}
            {session.currentItem?.type === 'COMPLETE_SENTENCE' &&
              typeof session.currentItem.promptPayload.starter === 'string' && (
                <p className="sentence-starter">
                  Bắt đầu với: <strong>{session.currentItem.promptPayload.starter}…</strong>
                </p>
              )}
            {session.currentItem?.type === 'MINI_DIALOGUE' && (
              <p className="dialogue-cue">💬 Người đối thoại đang chờ câu trả lời của bạn.</p>
            )}
            {session.currentItem?.type === 'CORRECT_ERROR' &&
              typeof session.currentItem.promptPayload.incorrectSentence === 'string' && (
                <div className="error-sentence">
                  <span>Câu có lỗi</span>
                  <strong>{session.currentItem.promptPayload.incorrectSentence}</strong>
                </div>
              )}
            {session.currentItem?.type === 'TRANSFORM_SENTENCE' &&
              typeof session.currentItem.promptPayload.sourceSentence === 'string' && (
                <div className="transform-cue">
                  <span>Câu ban đầu</span>
                  <strong>{session.currentItem.promptPayload.sourceSentence}</strong>
                  {typeof session.currentItem.promptPayload.transformationGoalVi === 'string' && (
                    <small>{session.currentItem.promptPayload.transformationGoalVi}</small>
                  )}
                </div>
              )}
            {session.currentItem?.type === 'SELECT_IN_CONTEXT' &&
              Array.isArray(session.currentItem.promptPayload.choices) && (
                <div className="context-choices">
                  {(session.currentItem.promptPayload.choices as string[]).map((choice) => (
                    <button
                      type="button"
                      key={choice}
                      onClick={() => {
                        setDraft(choice);
                        if (session.currentItem)
                          localStorage.setItem(draftKey(session.currentItem.sessionItemId), choice);
                      }}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}
            {session.currentItem?.type === 'GUIDED_WRITING' &&
              Array.isArray(session.currentItem.promptPayload.requiredElements) && (
                <div className="guided-elements">
                  <span>Yêu cầu cần có</span>
                  <ul>
                    {(session.currentItem.promptPayload.requiredElements as string[]).map(
                      (element) => (
                        <li key={element}>{element}</li>
                      ),
                    )}
                  </ul>
                </div>
              )}
            <h1>{session.currentItem?.sourceTextVi}</h1>
            <p className="instruction">{session.currentItem?.instructionVi}</p>
            {screen === 'evaluating' ? (
              <div className="evaluating" aria-live="polite">
                <div className="pulse-mark">AI</div>
                <div>
                  <h2>Đang xem câu trả lời…</h2>
                  <p>
                    Mình đang kiểm tra ý nghĩa và ngữ pháp mục tiêu. Bạn có thể rời trang và quay
                    lại sau.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="hint-area">
                  {hints.map((hint) => (
                    <div className="hint-card" key={hint.id}>
                      <span>Gợi ý {hint.level}</span>
                      <p>{hint.textVi}</p>
                    </div>
                  ))}
                  {(hints.length === 0 || hints.at(-1)?.hasMore) && (
                    <button
                      className="hint-button"
                      type="button"
                      onClick={() => void revealHint()}
                      disabled={busy}
                    >
                      ✦ {hints.length ? 'Mở gợi ý tiếp theo' : 'Cần gợi ý từ vựng?'}
                    </button>
                  )}
                </div>
                <form onSubmit={(e) => void submit(e)}>
                  <label className="answer-label">
                    Câu trả lời của bạn
                    <textarea
                      ref={answerRef}
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        if (session.currentItem)
                          localStorage.setItem(
                            draftKey(session.currentItem.sessionItemId),
                            e.target.value,
                          );
                      }}
                      placeholder="Viết câu tiếng Anh ở đây…"
                      rows={4}
                      maxLength={2000}
                      required
                    />
                  </label>
                  <div className="submit-row">
                    <span>{draft.trim() ? draft.trim().split(/\s+/).length : 0} từ</span>
                    <button className="primary-button" disabled={busy || !draft.trim()}>
                      {busy ? 'Đang gửi…' : 'Kiểm tra câu'}
                    </button>
                  </div>
                </form>
              </>
            )}
            {error && (
              <div>
                <p className="error-message" role="alert">
                  {error}
                </p>
                {error.includes('3 lượt') && (
                  <button
                    className="primary-button"
                    type="button"
                    style={{ marginTop: '12px' }}
                    onClick={() => void next(true)}
                  >
                    Sang câu tiếp theo →
                  </button>
                )}
              </div>
            )}
          </article>
        </section>
      )}
      {screen === 'feedback' && attempt?.evaluation && (
        <section className="feedback-layout" aria-live="polite">
          <article
            className={`feedback-card disposition-${attempt.evaluation.disposition.toLowerCase()}`}
          >
            <div className="feedback-symbol">
              {attempt.evaluation.disposition === 'RETRY'
                ? '↻'
                : attempt.evaluation.disposition === 'SYSTEM_REVIEW'
                  ? '…'
                  : '✓'}
            </div>
            <p className="step-label">
              {attempt.evaluation.disposition === 'ACCEPT'
                ? 'Chính xác'
                : attempt.evaluation.disposition === 'ACCEPT_WITH_FEEDBACK'
                  ? 'Đúng, có góp ý nhỏ'
                  : attempt.evaluation.disposition === 'RETRY' && attempt.evaluation.canRetry
                    ? 'Thử lại một lần nữa'
                    : attempt.evaluation.disposition === 'RETRY'
                      ? 'Đã dùng hết lượt trả lời'
                      : 'Chưa thể đánh giá'}
            </p>
            <h1>{attempt.evaluation.feedbackVi}</h1>
            {attempt.evaluation.findings.length > 0 && (
              <div className="finding-list">
                {attempt.evaluation.findings.map((f, i) => (
                  <div className="finding" key={`${f.category}-${i}`}>
                    <strong>{f.category.replaceAll('_', ' ')}</strong>
                    <p>{f.messageVi}</p>
                    {f.suggestedFix && <span>Gợi ý: {f.suggestedFix}</span>}
                  </div>
                ))}
              </div>
            )}
            {attempt.evaluation.correctedAnswer && (
              <div className="correction">
                <span>Câu gợi ý</span>
                <strong>{attempt.evaluation.correctedAnswer}</strong>
              </div>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button className="primary-button" disabled={busy} onClick={() => void next()}>
              {busy
                ? 'Đang chuẩn bị…'
                : attempt.evaluation.disposition === 'RETRY' && attempt.evaluation.canRetry
                  ? 'Viết lại câu'
                  : attempt.evaluation.disposition === 'RETRY'
                    ? 'Sang câu tiếp theo'
                    : attempt.evaluation.disposition === 'SYSTEM_REVIEW'
                      ? 'Về trang chính'
                      : 'Tiếp tục'}
            </button>
          </article>
        </section>
      )}
      {screen === 'summary' && summary && (
        <section className="summary-layout">
          <article className="summary-card">
            <div className="celebration">✦</div>
            <p className="eyebrow">Hoàn thành buổi học</p>
            <h1>Một bước tiến tốt đẹp.</h1>
            <p>Bạn vừa củng cố thêm nền tảng ngữ pháp của mình.</p>
            <div className="summary-stats">
              <div>
                <strong>{summary.completedItems}</strong>
                <span>Câu hoàn thành</span>
              </div>
              <div>
                <strong>{summary.acceptedItems}</strong>
                <span>Câu được chấp nhận</span>
              </div>
              <div>
                <strong>{Math.max(1, Math.round(summary.durationSeconds / 60))}</strong>
                <span>Phút tập trung</span>
              </div>
            </div>
            <button className="primary-button" onClick={() => void dashboard()}>
              Xem tiến độ
            </button>
          </article>
        </section>
      )}
      {screen === 'challenge-result' && challenge && (
        <section className="summary-layout">
          <article className="summary-card challenge-result-card">
            <div className="celebration">◆</div>
            <p className="eyebrow">Kết quả thử thách unit</p>
            <h1>{challenge.unitTitle}</h1>
            <p>Mỗi chủ điểm được đánh giá riêng; lỗi hệ thống không bị tính là câu sai.</p>
            <div className="challenge-target-list">
              {challenge.targets.map((target) => (
                <div
                  className={`challenge-target outcome-${target.outcome.toLowerCase()}`}
                  key={target.grammarPointId}
                >
                  <span>
                    {target.outcome === 'PASSED'
                      ? 'Đã đạt'
                      : target.outcome === 'NEEDS_PRACTICE'
                        ? 'Cần luyện thêm'
                        : 'Chưa đủ dữ liệu'}
                  </span>
                  <strong>{target.grammarTitle}</strong>
                </div>
              ))}
            </div>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <div className="challenge-actions">
              {challenge.remediationGrammarPointIds.length > 0 && (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void remediateChallenge()}
                >
                  {busy ? 'Đang chuẩn bị…' : 'Luyện các phần chưa đạt'}
                </button>
              )}
              <button className="text-button" onClick={() => void dashboard()}>
                Về lộ trình
              </button>
            </div>
          </article>
        </section>
      )}
    </main>
  );
}
