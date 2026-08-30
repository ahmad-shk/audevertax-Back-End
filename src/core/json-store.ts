import { promises as fs } from 'node:fs';
import path from 'node:path';

export class JsonStore<T extends { id: string }> {
  constructor(private readonly filePath: string) {}

  private async read(): Promise<T[]> {
    try {
      return JSON.parse(await fs.readFile(this.filePath, 'utf8')) as T[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await this.write([]);
      return [];
    }
  }

  private async write(items: T[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(items, null, 2));
  }

  async all(): Promise<T[]> {
    return this.read();
  }

  async findById(id: string): Promise<T | null> {
    return (await this.read()).find((item) => item.id === id) ?? null;
  }

  async insert(item: T): Promise<T> {
    const items = await this.read();
    items.push(item);
    await this.write(items);
    return item;
  }

  async update(id: string, changes: Partial<T>): Promise<T | null> {
    const items = await this.read();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return null;

    items[index] = { ...items[index], ...changes };
    await this.write(items);
    return items[index];
  }

  async delete(id: string): Promise<boolean> {
    const items = await this.read();
    const filtered = items.filter((item) => item.id !== id);
    if (filtered.length === items.length) return false;
    await this.write(filtered);
    return true;
  }
}
