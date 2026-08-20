export interface StoryMemoryFact {
  key: string;
  value: string;
}

export interface StoryChoiceView {
  id: string;
  code: string;
  labelVi: string;
}

export interface StorySceneView {
  id: string;
  code: string;
  chapterTitle: string;
  title: string;
  narrativeVi: string;
  dialogue: Array<{ speaker: string; text: string }>;
  choices: StoryChoiceView[];
  hasDefaultContinuation: boolean;
  hasLearningAction: boolean;
  exerciseId: string | null;
}

export interface StoryJourneyView {
  series: { id: string; code: string; title: string; description: string; cefr: string };
  status: 'ACTIVE' | 'COMPLETED';
  completedSceneCount: number;
  totalSceneCount: number;
  currentScene: StorySceneView | null;
  memoryFacts: StoryMemoryFact[];
}

export interface StoryRepository {
  getJourney(userId: string): Promise<StoryJourneyView | null>;
  chooseBranch(
    userId: string,
    sceneId: string,
    choiceId: string,
    idempotencyKey: string,
  ): Promise<StoryJourneyView | null>;
  continueScene(
    userId: string,
    sceneId: string,
    idempotencyKey: string,
  ): Promise<StoryJourneyView | null>;
  getSceneExercise(userId: string, sceneId: string): Promise<string | null>;
}
