import { JsonStore } from '../../core/json-store.js';
import type { Application } from './application.types.js';

const store = new JsonStore<Application>('applications.json');

export const applicationStore = {
  async listByUser(userId: string) {
    const applications = await store.all();
    return applications.filter((application) => application.userId === userId);
  },

  async findById(id: string) {
    return store.findById(id);
  },

  async create(application: Application) {
    return store.insert(application);
  },

  async update(id: string, changes: Partial<Application>) {
    return store.update(id, changes);
  },

  async remove(id: string) {
    return store.delete(id);
  },
};
