import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { adjudicate, LayeredEvaluationProvider, type EvaluationContext } from '@english/evaluation';

type Disposition = 'ACCEPT' | 'ACCEPT_WITH_FEEDBACK' | 'RETRY' | 'SYSTEM_REVIEW';
interface GoldenCase extends EvaluationContext {
  id: string;
  category: string;
  allowedDispositions: Disposition[];
}

const main = async (): Promise<void> => {
  const path = resolve('test/fixtures/evaluator-golden.v1.json');
  const fixture = JSON.parse(await readFile(path, 'utf8')) as {
    version: string;
    cases: GoldenCase[];
  };
  if (fixture.version !== '1.0' || fixture.cases.length < 7)
    throw new Error('Golden evaluator corpus is incomplete');
  const ids = new Set(fixture.cases.map((testCase) => testCase.id));
  if (ids.size !== fixture.cases.length)
    throw new Error('Golden evaluator case IDs must be unique');

  if (!process.argv.includes('--live')) {
    console.log(`Validated ${fixture.cases.length} evaluator golden cases (v${fixture.version}).`);
    return;
  }
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for --live');
  const provider = new LayeredEvaluationProvider(
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_MODEL || 'gpt-5-mini',
  );
  const caseArgument = process.argv.find((argument) => argument.startsWith('--case='));
  const selectedCases = caseArgument
    ? fixture.cases.filter((testCase) => testCase.id === caseArgument.slice('--case='.length))
    : fixture.cases;
  if (selectedCases.length === 0) throw new Error('Requested golden case was not found');
  let failures = 0;
  for (const testCase of selectedCases) {
    const { id, category, allowedDispositions, ...context } = testCase;
    const result = await provider.evaluate(context);
    const disposition = adjudicate(result.output);
    const passed = allowedDispositions.includes(disposition);
    if (!passed) failures += 1;
    console.log(JSON.stringify({ id, category, disposition, passed, trace: result.trace }));
  }
  if (failures > 0) throw new Error(`${failures} evaluator golden case(s) failed`);
};

void main();
