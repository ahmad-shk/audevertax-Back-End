import { JsonStore } from '../../core/json-store.js';
import type { Application } from './application.types.js';

const store = new JsonStore<Application[]>('applications.json', []);

export const applicationStore = {
  async listByUser(userId: string) {
    const applications = await store.read();
    return applications.filter((application) => application.userId === userId);
  },

  async findById(id: string) {
    const applications = await store.read();
    return applications.find((application) => application.id === id) ?? null;
  },

  async create(application: Application) {
    const applications = await store.read();
    applications.push(application);
    await store.write(applications);
    return application;
  },

  async update(id: string, changes: Partial<Application>) {
    const applications = await store.read();
    const index = applications.findIndex((application) => application.id === id);

    if (index === -1) return null;

    applications[index] = { ...applications[index], ...changes };
    await store.write(applications);
    return applications[index];
  },

  async remove(id: string) {
    const applications = await store.read();
    const remaining = applications.filter((application) => application.id !== id);

    if (remaining.length === applications.length) return false;

    await store.write(remaining);
    return true;
  },
};
