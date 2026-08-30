# Audevertax Backend - DETAILED FIXES & CODE CHANGES

## IMMEDIATE ACTIONS REQUIRED

### 1. FIX SSL CERTIFICATE ERROR (CRITICAL)

**Problem**: `self-signed certificate in certificate chain` error on both local and Vercel

**Root Cause**: 
- Connection string has `?sslmode=require` parameter
- Pool config SSL settings conflict with URL-level settings
- Development has `ssl: false` which conflicts with sslmode=require in URL

**Solution A: Recommended - Update .env**

**File**: `.env`

**Change**:
```diff
- DATABASE_URL=postgres://postgres.oisiwsbrcisvydfpqilh:1y6hCXYJmrF0FV2n@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
+ DATABASE_URL=postgres://postgres.oisiwsbrcisvydfpqilh:1y6hCXYJmrF0FV2n@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

Then update pool config in `db.ts` to handle SSL consistently:

**File**: `src/core/db.ts`

**Change**:
```diff
  export function getPool(): Pool {
    if (!pool) {
      pool = new Pool({
        connectionString: env.DATABASE_URL,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
-       ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
+       ssl: { rejectUnauthorized: false },
      });
```

**Why this works**:
- Removes conflicting sslmode parameter from URL
- Applies consistent SSL policy: allow self-signed certs everywhere
- Handles Supabase's self-signed certificate chain

---

### 2. FIX JsonStore PARAMETER BUG (CRITICAL)

**Problem**: `application.store.ts` passes incorrect parameters to JsonStore

**Current Code (WRONG)**:
```typescript
// applications.store.ts line 3
const store = new JsonStore<Application[]>('applications.json', []);  // ❌ Second param not accepted
```

**JsonStore Constructor**:
```typescript
// core/json-store.ts
constructor(private readonly filePath: string) {}  // Only accepts filePath
```

**But Usage Pattern is Wrong**:
The store is trying to handle `Application[]` but JsonStore expects `T extends { id: string }`

**Fix 1: Change Type and Usage Pattern**

**File**: `src/modules/applications/application.store.ts`

**Complete Replacement**:
```typescript
import { JsonStore } from '../../core/json-store.js';
import type { Application } from './application.types.js';

const store = new JsonStore<Application>(path.resolve('applications.json'));

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
```

**Why**: 
- JsonStore now handles individual Application objects
- The array handling is done internally by read/write
- Matches the pattern used in auth.store.ts

---

### 3. MIGRATE APPLICATIONS MODULE TO POSTGRES (CRITICAL)

**Problem**: Applications only use JSON, not Postgres even when configured

**Solution: Add Postgres Support to application.store.ts**

**File**: `src/modules/applications/application.store.ts`

**Full Replacement**:
```typescript
import path from 'node:path';
import { JsonStore } from '../../core/json-store.js';
import { getPool } from '../../core/db.js';
import { env } from '../../config/env.js';
import type { Application } from './application.types.js';

const store = new JsonStore<Application>(path.resolve('applications.json'));
const usePostgres = env.STORAGE_DRIVER === 'postgres' && env.DATABASE_URL;

function mapRowToApplication(row: any): Application {
  return {
    id: row.id,
    userId: row.user_id,
    serviceSlug: row.service_slug,
    packageSlug: row.package_slug || undefined,
    formationState: row.formation_state || undefined,
    currentStep: row.current_step,
    answers: row.answers || {},
    status: row.status,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

export const applicationStore = {
  async listByUser(userId: string) {
    if (usePostgres) {
      const pool = getPool();
      const result = await pool.query(
        'SELECT * FROM applications WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
      return result.rows.map(mapRowToApplication);
    }
    const applications = await store.all();
    return applications.filter((app) => app.userId === userId);
  },

  async findById(id: string) {
    if (usePostgres) {
      const pool = getPool();
      const result = await pool.query('SELECT * FROM applications WHERE id = $1', [id]);
      return result.rows.length > 0 ? mapRowToApplication(result.rows[0]) : null;
    }
    return store.findById(id);
  },

  async create(application: Application) {
    if (usePostgres) {
      const pool = getPool();
      const result = await pool.query(
        `INSERT INTO applications 
         (id, user_id, service_slug, package_slug, formation_state, current_step, answers, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          application.id,
          application.userId,
          application.serviceSlug,
          application.packageSlug || null,
          application.formationState || null,
          application.currentStep,
          JSON.stringify(application.answers),
          application.status,
          application.createdAt,
          application.updatedAt,
        ]
      );
      return mapRowToApplication(result.rows[0]);
    }
    return store.insert(application);
  },

  async update(id: string, changes: Partial<Application>) {
    if (usePostgres) {
      const pool = getPool();
      const now = new Date().toISOString();
      const fields = [];
      const values = [];
      let paramCount = 1;

      if (changes.serviceSlug !== undefined) {
        fields.push(`service_slug = $${paramCount++}`);
        values.push(changes.serviceSlug);
      }
      if (changes.packageSlug !== undefined) {
        fields.push(`package_slug = $${paramCount++}`);
        values.push(changes.packageSlug || null);
      }
      if (changes.formationState !== undefined) {
        fields.push(`formation_state = $${paramCount++}`);
        values.push(changes.formationState || null);
      }
      if (changes.currentStep !== undefined) {
        fields.push(`current_step = $${paramCount++}`);
        values.push(changes.currentStep);
      }
      if (changes.answers !== undefined) {
        fields.push(`answers = $${paramCount++}`);
        values.push(JSON.stringify(changes.answers));
      }
      if (changes.status !== undefined) {
        fields.push(`status = $${paramCount++}`);
        values.push(changes.status);
      }

      if (fields.length === 0) return await this.findById(id);

      fields.push(`updated_at = $${paramCount++}`);
      values.push(now);
      values.push(id);

      const query = `UPDATE applications SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
      const result = await pool.query(query, values);

      return result.rows.length > 0 ? mapRowToApplication(result.rows[0]) : null;
    }

    return store.update(id, { ...changes, updatedAt: new Date().toISOString() });
  },

  async remove(id: string) {
    if (usePostgres) {
      const pool = getPool();
      const result = await pool.query('DELETE FROM applications WHERE id = $1', [id]);
      return result.rowCount ? result.rowCount > 0 : false;
    }
    return store.delete(id);
  },
};
```

**Add to db.ts initialization** (in `initializeDatabase` function):

```typescript
// Create applications table
await client.query(`
  CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_slug VARCHAR(100) NOT NULL,
    package_slug VARCHAR(100),
    formation_state VARCHAR(255),
    current_step INTEGER NOT NULL DEFAULT 0,
    answers JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

await client.query('CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);');
await client.query('CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);');
```

---

### 4. MIGRATE BILLING MODULE TO POSTGRES (CRITICAL)

**Problem**: Billing orders only use JSON, not Postgres even when configured

**File**: `src/modules/billing/billing.store.ts`

**Full Replacement**:
```typescript
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { JsonStore } from '../../core/json-store.js';
import { getPool } from '../../core/db.js';
import { env } from '../../config/env.js';
import type { BillingOrder } from './billing.types.js';

const store = new JsonStore<BillingOrder>(path.resolve('billing-orders.json'));
const usePostgres = env.STORAGE_DRIVER === 'postgres' && env.DATABASE_URL;

function mapRowToOrder(row: any): BillingOrder {
  return {
    id: row.id,
    applicationId: row.application_id,
    userId: row.user_id,
    lineItems: row.line_items || [],
    subtotal: row.subtotal,
    total: row.total,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

export async function findOrder(applicationId: string, userId: string) {
  if (usePostgres) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM billing_orders WHERE application_id = $1 AND user_id = $2',
      [applicationId, userId]
    );
    return result.rows.length > 0 ? mapRowToOrder(result.rows[0]) : null;
  }

  const orders = await store.all();
  return orders.find(
    (order) => order.applicationId === applicationId && order.userId === userId,
  ) ?? null;
}

export async function createOrder(input: Omit<BillingOrder, 'id' | 'createdAt' | 'updatedAt'>) {
  const id = randomUUID();
  const now = new Date().toISOString();

  if (usePostgres) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO billing_orders 
       (id, application_id, user_id, line_items, subtotal, total, currency, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        input.applicationId,
        input.userId,
        JSON.stringify(input.lineItems),
        input.subtotal,
        input.total,
        input.currency,
        input.status,
        now,
        now,
      ]
    );
    return mapRowToOrder(result.rows[0]);
  }

  const order: BillingOrder = { ...input, id, createdAt: now, updatedAt: now };
  return store.insert(order);
}

export async function updateOrder(id: string, changes: Partial<BillingOrder>) {
  if (usePostgres) {
    const pool = getPool();
    const now = new Date().toISOString();
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (changes.lineItems !== undefined) {
      fields.push(`line_items = $${paramCount++}`);
      values.push(JSON.stringify(changes.lineItems));
    }
    if (changes.subtotal !== undefined) {
      fields.push(`subtotal = $${paramCount++}`);
      values.push(changes.subtotal);
    }
    if (changes.total !== undefined) {
      fields.push(`total = $${paramCount++}`);
      values.push(changes.total);
    }
    if (changes.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(changes.status);
    }

    if (fields.length === 0) return null;

    fields.push(`updated_at = $${paramCount++}`);
    values.push(now);
    values.push(id);

    const query = `UPDATE billing_orders SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);

    return result.rows.length > 0 ? mapRowToOrder(result.rows[0]) : null;
  }

  return store.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
}
```

**Add to db.ts initialization** (in `initializeDatabase` function):

```typescript
// Create billing_orders table
await client.query(`
  CREATE TABLE IF NOT EXISTS billing_orders (
    id UUID PRIMARY KEY,
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    line_items JSONB NOT NULL DEFAULT '[]',
    subtotal NUMERIC(10, 2) NOT NULL,
    total NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

await client.query('CREATE INDEX IF NOT EXISTS idx_billing_orders_application_id ON billing_orders(application_id);');
await client.query('CREATE INDEX IF NOT EXISTS idx_billing_orders_user_id ON billing_orders(user_id);');
```

---

### 5. REMOVE UNUSED CODE (LOW)

**File**: Delete `src/routes/health.ts` (entire file can be deleted)

**File**: `src/app.ts`

**Change**:
```diff
- import { healthRouter } from './routes/health.js';
```

This removes the unused import.

---

### 6. IMPROVE ERROR HANDLING IN db.ts

**File**: `src/core/db.ts`

**Update logging**:
```typescript
import { logger } from '../utils/logger.js';

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: { rejectUnauthorized: false },
    });

    pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected error on idle client');
    });
  }
  return pool;
}

export async function initializeDatabase() {
  const client = await getPool().connect();
  try {
    logger.info('Creating database tables...');

    // ... all table creation queries ...

    logger.info('Database initialized successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize database');
    throw error;
  } finally {
    client.release();
  }
}
```

---

### 7. ADD .env TO .gitignore

**File**: `.gitignore` (create if doesn't exist)

```
.env
.env.local
node_modules/
dist/
*.log
.DS_Store
```

---

### 8. CREATE .env.example

**File**: `.env.example`

```
NODE_ENV=development
PORT=5001
FRONTEND_URL=https://audvertax-front-end.vercel.app
postgres=postgres://user:password@host:5432/dbname
STORAGE_DRIVER=postgres
SESSION_SECRET=your-secret-key-at-least-32-characters-long
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
DATABASE_URL=postgres://user:password@host:5432/dbname
```

---

## DEPLOYMENT INSTRUCTIONS

### For Vercel:

1. **Set Environment Variables in Vercel Dashboard**:
   - `DATABASE_URL` = Supabase connection string (without ?sslmode=require)
   - `NODE_ENV` = production
   - `SESSION_SECRET` = Generate random 32+ char string
   - `GOOGLE_CLIENT_ID` = Your Google OAuth ID
   - `FRONTEND_URL` = Your frontend URL

2. **Current vercel.json will fail** - The build step needs to output correctly

   Update `vercel.json`:
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "src/server.ts",
         "use": "@vercel/node"
       }
     ],
     "routes": [
       {
         "src": "/(.*)",
         "dest": "src/server.ts"
       }
     ]
   }
   ```

3. **Or: Use default Vercel Node behavior** (delete vercel.json, let Vercel auto-detect)

### For Local Development:

1. **Update .env**:
   ```
   NODE_ENV=development
   DATABASE_URL=postgres://user:pass@localhost:5432/postgres
   ```

2. **Ensure Postgres is running locally** or use Supabase dev connection

3. **Run**: `npm run dev`

---

## VERIFICATION CHECKLIST

After making these changes:

- [ ] `npm run typecheck` passes with no errors
- [ ] `npm run dev` starts without SSL errors
- [ ] Can register a user via `/api/v1/auth/register`
- [ ] Can login via `/api/v1/auth/login`
- [ ] Can create application via `/api/v1/applications`
- [ ] Can create billing order via `/api/v1/billing/:appId/order`
- [ ] User data persists in Postgres (check admin panel or query)
- [ ] Application data persists in Postgres
- [ ] Vercel deployment succeeds and routes work
