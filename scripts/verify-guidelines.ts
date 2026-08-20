import { readFile } from 'node:fs/promises';

interface GuidelineBlock {
  version: number;
  scope: string;
  commands: {
    format: string;
    lint: string;
    test: string;
  };
}

async function main(): Promise<void> {
  const agents = await readFile('AGENTS.md', 'utf8');
  const match = agents.match(/```codex-guidelines\s*([\s\S]*?)```/);
  if (!match?.[1]) throw new Error('Missing fenced codex-guidelines block in AGENTS.md');

  const parsed = JSON.parse(match[1]) as Partial<GuidelineBlock>;
  if (parsed.version !== 1 || parsed.scope !== '.') {
    throw new Error('codex-guidelines must use version=1 and root scope "."');
  }

  for (const command of ['format', 'lint', 'test'] as const) {
    if (!parsed.commands?.[command]?.trim()) {
      throw new Error(`codex-guidelines is missing commands.${command}`);
    }
  }

  console.log('Verified AGENTS.md codex-guidelines block.');
}

void main();
