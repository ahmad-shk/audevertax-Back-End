import { promises as fs } from 'node:fs';
import path from 'node:path';

const DOCUMENT_ROOT = path.resolve(process.env.DOCUMENT_STORAGE_PATH ?? path.join(process.cwd(), 'data', 'documents'));

export async function writeDocument(storageKey: string, data: Buffer) {
  const filePath = path.join(DOCUMENT_ROOT, storageKey);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data, { flag: 'wx' });
}

export async function readDocument(storageKey: string) {
  const filePath = path.join(DOCUMENT_ROOT, storageKey);
  return fs.readFile(filePath);
}

export async function deleteDocument(storageKey: string) {
  const filePath = path.join(DOCUMENT_ROOT, storageKey);
  await fs.rm(filePath, { force: true });
}
