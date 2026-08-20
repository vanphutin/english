import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

async function main(): Promise<void> {
  const schemaDirectory = resolve('packages/contracts/schemas');
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schemaFiles = (await readdir(schemaDirectory)).filter((file) => file.endsWith('.json'));

  for (const file of schemaFiles) {
    const schemaText = await readFile(resolve(schemaDirectory, file), 'utf8');
    ajv.compile(JSON.parse(schemaText) as object);
  }

  console.log(`Validated ${schemaFiles.length} JSON Schemas.`);
}

void main();
