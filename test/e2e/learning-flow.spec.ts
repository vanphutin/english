import { expect, test, type Page, type Route } from '@playwright/test';

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function mockLearningApi(page: Page): Promise<void> {
  let loggedIn = false;
  let sessionCompleted = false;

  await page.route('http://localhost:3001/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');

    if (path === '/auth/me')
      return loggedIn
        ? json(route, { id: 'user-1', username: 'learner', displayName: 'Người học' })
        : json(route, { message: 'Unauthorized' }, 401);
    if (path === '/auth/login' && request.method() === 'POST') {
      loggedIn = true;
      return json(route, { id: 'user-1', username: 'learner', displayName: 'Người học' });
    }
    if (path === '/me/progress')
      return json(route, {
        curriculum: { code: 'PERSONAL_ENGLISH', version: 4 },
        currentLevel: {
          id: 'level-a1',
          code: 'LEVEL_A1_FOUNDATIONS',
          cefr: 'A1',
          title: 'Nền tảng A1',
        },
        requiredPoints: 10,
        masteredPoints: 0,
        learningPoints: 0,
        unseenPoints: 10,
        dueReviewPoints: 0,
        progressPercent: 0,
        nextAction: { type: 'START_DAILY' },
      });
    if (path === '/sessions' && request.method() === 'POST')
      return json(route, { id: 'session-1' });
    if (path === '/sessions/session-1' && request.method() === 'GET')
      return json(route, {
        id: 'session-1',
        status: sessionCompleted ? 'COMPLETED' : 'ACTIVE',
        mode: 'DAILY',
        startedAt: '2026-08-17T00:00:00Z',
        completedAt: sessionCompleted ? '2026-08-17T00:05:00Z' : null,
        progress: {
          total: 1,
          completed: sessionCompleted ? 1 : 0,
          remaining: sessionCompleted ? 0 : 1,
        },
        currentItem: sessionCompleted
          ? null
          : {
              sessionItemId: 'item-1',
              exerciseId: 'exercise-1',
              type: 'TRANSLATE_CONTEXT',
              contextVi: 'Bạn nói về công việc của mình.',
              instructionVi: 'Dịch câu tiếng Việt sang tiếng Anh.',
              sourceTextVi: 'Tôi là một nhà thiết kế.',
              targets: [
                {
                  code: 'BE_PRESENT_AFFIRMATIVE',
                  title: 'Động từ be ở hiện tại',
                  cefr: 'A1',
                  learningObjectiveVi:
                    'Dùng am, is và are để mô tả danh tính hoặc trạng thái hiện tại.',
                  formPatterns: ['I + am + complement', 'he/she/it + is + complement'],
                  meaningUses: ['Mô tả danh tính hoặc trạng thái hiện tại.'],
                  usageNotes: ['Động từ be phải hòa hợp với chủ ngữ.'],
                  rules: [
                    {
                      code: 'BE_SUBJECT_AGREEMENT',
                      type: 'HARD_CONSTRAINT',
                      description: 'The form of be agrees with the subject.',
                    },
                  ],
                  examples: [
                    {
                      type: 'AFFIRMATIVE',
                      english: 'She is a teacher.',
                      vietnamese: 'Cô ấy là giáo viên.',
                      explanationVi: 'She đi với is.',
                    },
                  ],
                },
              ],
              attemptLimit: 3,
            },
        summary: null,
      });
    if (path === '/session-items/item-1/hints' && request.method() === 'GET')
      return json(route, []);
    if (path === '/session-items/item-1/hints/next' && request.method() === 'POST')
      return json(route, {
        id: 'hint-1',
        level: 1,
        textVi: 'Một nghề tạo ra kiểu dáng hoặc trải nghiệm.',
        lemma: null,
        partOfSpeech: null,
        revealedAt: '2026-08-17T00:01:00Z',
        hasMore: true,
      });
    if (path === '/session-items/item-1/attempts' && request.method() === 'POST') {
      sessionCompleted = true;
      return json(route, {
        attemptId: 'attempt-1',
        status: 'EVALUATED',
        evaluation: {
          disposition: 'ACCEPT',
          dimensions: { targetGrammar: 'PASS' },
          feedbackVi: 'Câu trả lời đúng và tự nhiên.',
          findings: [],
          canRetry: false,
        },
      });
    }
    if (path === '/sessions/session-1/complete' && request.method() === 'POST')
      return json(route, {
        sessionId: 'session-1',
        completedAt: '2026-08-17T00:05:00Z',
        totalItems: 1,
        completedItems: 1,
        acceptedItems: 1,
        retryItems: 0,
        durationSeconds: 300,
      });

    return json(route, { message: `Unmocked route: ${request.method()} ${path}` }, 500);
  });
}

test('learner completes the critical local learning flow', async ({ page }) => {
  await mockLearningApi(page);
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Đăng nhập để tiếp tục' })).toBeVisible();
  await page.getByLabel('Tên đăng nhập').fill('learner');
  await page.getByLabel('Mật khẩu').fill('local-test-password');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  await expect(page.getByRole('heading', { name: /A1 · Nền tảng A1/ })).toBeVisible();
  await page.getByRole('button', { name: 'Bắt đầu buổi học' }).click();
  await expect(page.getByRole('heading', { name: 'Tôi là một nhà thiết kế.' })).toBeVisible();
  await expect(page.getByText('A1 · Động từ be ở hiện tại')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cấu trúc' })).toBeVisible();
  await expect(page.getByText('I + am + complement')).toBeVisible();
  await expect(page.getByText('She is a teacher.')).toBeVisible();
  await expect(page.getByLabel('Câu trả lời của bạn')).toBeFocused();

  await page.getByRole('button', { name: 'Cần gợi ý từ vựng?' }).click();
  await expect(page.getByText('Một nghề tạo ra kiểu dáng hoặc trải nghiệm.')).toBeVisible();
  await page.getByLabel('Câu trả lời của bạn').fill('I am a designer.');
  await page.getByRole('button', { name: 'Kiểm tra câu' }).click();

  await expect(page.getByText('Chính xác')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Câu trả lời đúng và tự nhiên.' })).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục' }).click();
  await expect(page.getByRole('heading', { name: 'Một bước tiến tốt đẹp.' })).toBeVisible();
  await expect(page.getByText('1', { exact: true })).toHaveCount(2);
});

test('login screen has essential keyboard and semantic accessibility', async ({ page }) => {
  await mockLearningApi(page);
  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.getByLabel('Tên đăng nhập')).toBeVisible();
  await expect(page.getByLabel('Mật khẩu')).toHaveAttribute('type', 'password');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Về trang chính' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Tên đăng nhập')).toBeFocused();
});
