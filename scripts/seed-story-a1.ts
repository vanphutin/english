import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const storyPrompts = [
    {
      code: 'BE_PRESENT_AFFIRMATIVE',
      source: 'Tôi là Minh. Tôi là hàng xóm mới của Lan.',
      answers: ["I am Minh. I am Lan's new neighbor.", "I'm Minh. I'm Lan's new neighbour."],
      context: 'Minh tự giới thiệu khi gặp Lan lần đầu.',
    },
    {
      code: 'THERE_IS_ARE',
      source: 'Có một quán cà phê nhỏ cạnh công viên.',
      answers: [
        'There is a small café next to the park.',
        'There is a small cafe next to the park.',
      ],
      context: 'Lan chỉ cho Minh địa điểm gần nhà.',
    },
    {
      code: 'THERE_IS_ARE',
      source: 'Có nhiều quầy đồ ăn ở khu chợ này.',
      answers: [
        'There are many food stalls in this market.',
        'There are many food stalls at this market.',
      ],
      context: 'Lan giới thiệu khu chợ nhỏ trong khu phố.',
    },
    {
      code: 'HAVE_GOT_POSSESSION',
      source: 'Tôi đã có sách và vở trong cặp.',
      answers: [
        'I have got my books and my notebook in my bag.',
        "I've got my books and my notebook in my bag.",
      ],
      context: 'Minh kiểm tra đồ dùng trước khi đến lớp.',
    },
    {
      code: 'BE_PRESENT_AFFIRMATIVE',
      source: 'Tôi rất vui khi có mặt ở đây.',
      answers: ['I am very happy to be here.', "I'm very happy to be here."],
      context: 'Minh đáp lại lời chào mừng của cô giáo.',
    },
  ];
  const exercises: Array<{ id: string }> = [];
  for (const [index, prompt] of storyPrompts.entries()) {
    const version = await prisma.grammarPointVersion.findFirst({
      where: { status: 'PUBLISHED', locale: 'vi', grammarPoint: { code: prompt.code } },
      orderBy: { versionNo: 'desc' },
      select: { id: true },
    });
    if (!version) throw new Error(`Published grammar point ${prompt.code} is required`);
    const contentKey = `story-a1-first-week-scene-${index + 1}-v1`;
    const exercise = await prisma.exercise.upsert({
      where: { contentKey },
      create: {
        contentKey,
        origin: 'CURATED_STORY',
        type: 'TRANSLATE_CONTEXT',
        contentStatus: 'PUBLISHED',
        generatorVersion: 'story-journey-v1',
        evaluatorRubricVersion: 'evaluation-rubric-v1',
        difficulty: 1,
        promptContextVi: prompt.context,
        instructionVi: 'Dịch câu trong câu chuyện sang tiếng Anh.',
        semanticHash: contentKey,
        topicCode: 'DAILY_LIFE',
        constraintsJson: { storyCode: 'A1_FIRST_WEEK_IN_HANOI', sceneNo: index + 1 },
        contentSnapshotJson: { source: 'CURATED_STORY', policyVersion: 'story-journey-v1' },
        targets: {
          create: { grammarPointVersionId: version.id, targetRole: 'PRIMARY', weight: 1 },
        },
        sentences: {
          create: {
            position: 1,
            sourceTextVi: prompt.source,
            referenceAnswersJson: prompt.answers,
            semanticRequirementsJson: { preserveMeaning: true, targetGrammarCode: prompt.code },
          },
        },
      },
      update: {},
      select: { id: true },
    });
    exercises.push(exercise);
  }

  const series = await prisma.storySeries.upsert({
    where: { code: 'A1_FIRST_WEEK_IN_HANOI' },
    create: {
      code: 'A1_FIRST_WEEK_IN_HANOI',
      title: 'Tuần đầu tiên ở Hà Nội',
      description: 'Giúp Minh làm quen hàng xóm, tìm quán ăn và chuẩn bị cho ngày đầu đi học.',
      cefrLevel: 'A1',
      versionNo: 1,
      status: 'PUBLISHED',
    },
    update: { status: 'PUBLISHED' },
  });
  const chapter1 = await prisma.storyChapter.upsert({
    where: { seriesId_code: { seriesId: series.id, code: 'ARRIVAL' } },
    create: { seriesId: series.id, code: 'ARRIVAL', title: 'Một nơi ở mới', sortOrder: 1 },
    update: {},
  });
  const chapter2 = await prisma.storyChapter.upsert({
    where: { seriesId_code: { seriesId: series.id, code: 'FIRST_DAY' } },
    create: { seriesId: series.id, code: 'FIRST_DAY', title: 'Ngày đầu tiên', sortOrder: 2 },
    update: {},
  });

  const definitions = [
    {
      chapterId: chapter1.id,
      code: 'MEET_LAN',
      title: 'Người hàng xóm mới',
      narrativeVi:
        'Minh vừa chuyển đến một căn hộ nhỏ. Lan, người hàng xóm cùng tầng, đến chào hỏi và muốn biết Minh là ai.',
      dialogueJson: [
        { speaker: 'Lan', text: 'Hi! I am Lan. Are you new here?' },
        { speaker: 'Minh', text: 'Yes, I am Minh.' },
      ],
      memoryFactsJson: [{ key: 'met_lan', value: 'Minh met his neighbor Lan.' }],
      sortOrder: 1,
      exerciseId: exercises[0]!.id,
    },
    {
      chapterId: chapter1.id,
      code: 'CAFE_ROUTE',
      title: 'Đi tới quán cà phê',
      narrativeVi:
        'Minh chọn đi cùng Lan tới quán cà phê gần nhà. Trên đường đi, Lan giới thiệu những nơi quen thuộc trong khu phố.',
      dialogueJson: [{ speaker: 'Lan', text: 'There is a small café next to the park.' }],
      memoryFactsJson: [{ key: 'route', value: 'Minh walked to the café with Lan.' }],
      sortOrder: 2,
      exerciseId: exercises[1]!.id,
    },
    {
      chapterId: chapter1.id,
      code: 'MARKET_ROUTE',
      title: 'Ghé khu chợ nhỏ',
      narrativeVi:
        'Minh chọn ghé khu chợ nhỏ. Lan chỉ cho Minh nơi mua đồ ăn và những vật dụng cần thiết.',
      dialogueJson: [{ speaker: 'Lan', text: 'There are many food stalls here.' }],
      memoryFactsJson: [{ key: 'route', value: 'Minh visited the market with Lan.' }],
      sortOrder: 3,
      exerciseId: exercises[2]!.id,
    },
    {
      chapterId: chapter2.id,
      code: 'PREPARE_CLASS',
      title: 'Chuẩn bị đến lớp',
      narrativeVi: 'Sáng hôm sau, Minh kiểm tra cặp sách và chuẩn bị cho buổi học đầu tiên.',
      dialogueJson: [{ speaker: 'Minh', text: 'I have got my books and my notebook.' }],
      memoryFactsJson: [{ key: 'prepared', value: 'Minh prepared his school bag.' }],
      sortOrder: 1,
      exerciseId: exercises[3]!.id,
    },
    {
      chapterId: chapter2.id,
      code: 'MEET_TEACHER',
      title: 'Lời chào trong lớp học',
      narrativeVi: 'Minh đến lớp đúng giờ. Cô giáo mỉm cười và chào đón Minh trước cả lớp.',
      dialogueJson: [
        { speaker: 'Teacher', text: 'Welcome, Minh. We are happy you are here.' },
        { speaker: 'Minh', text: 'Thank you. I am happy too.' },
      ],
      memoryFactsJson: [{ key: 'first_day', value: 'Minh completed his first school day.' }],
      sortOrder: 2,
      exerciseId: exercises[4]!.id,
    },
  ];
  const scenes = new Map<string, { id: string }>();
  for (const definition of definitions) {
    const scene = await prisma.storyScene.upsert({
      where: { chapterId_code: { chapterId: definition.chapterId, code: definition.code } },
      create: definition,
      update: {
        title: definition.title,
        narrativeVi: definition.narrativeVi,
        dialogueJson: definition.dialogueJson,
        memoryFactsJson: definition.memoryFactsJson,
        exerciseId: definition.exerciseId,
      },
      select: { id: true },
    });
    scenes.set(definition.code, scene);
  }
  const scene = (code: string) => scenes.get(code)!.id;
  await prisma.storyScene.update({
    where: { id: scene('CAFE_ROUTE') },
    data: { defaultNextSceneId: scene('PREPARE_CLASS') },
  });
  await prisma.storyScene.update({
    where: { id: scene('MARKET_ROUTE') },
    data: { defaultNextSceneId: scene('PREPARE_CLASS') },
  });
  await prisma.storyScene.update({
    where: { id: scene('PREPARE_CLASS') },
    data: { defaultNextSceneId: scene('MEET_TEACHER') },
  });
  await prisma.storyChoice.upsert({
    where: { sceneId_code: { sceneId: scene('MEET_LAN'), code: 'GO_CAFE' } },
    create: {
      sceneId: scene('MEET_LAN'),
      nextSceneId: scene('CAFE_ROUTE'),
      code: 'GO_CAFE',
      labelVi: 'Đi tới quán cà phê cùng Lan',
      memoryFactsJson: [{ key: 'choice', value: 'Minh chose the café.' }],
      sortOrder: 1,
    },
    update: {},
  });
  await prisma.storyChoice.upsert({
    where: { sceneId_code: { sceneId: scene('MEET_LAN'), code: 'GO_MARKET' } },
    create: {
      sceneId: scene('MEET_LAN'),
      nextSceneId: scene('MARKET_ROUTE'),
      code: 'GO_MARKET',
      labelVi: 'Ghé khu chợ nhỏ cùng Lan',
      memoryFactsJson: [{ key: 'choice', value: 'Minh chose the market.' }],
      sortOrder: 2,
    },
    update: {},
  });
  console.log('Published A1 story journey with 2 chapters, 5 scenes, and 2 branches.');
}

void main().finally(() => prisma.$disconnect());
