# Audevertax Backend - Comprehensive Codebase Analysis

## 1. PROJECT STRUCTURE OVERVIEW

### Root Level Files
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `vercel.json` - Vercel deployment configuration
- `.env` - Environment variables
- `applications.json` - Applications data store
- `data/sessions.json` - Session data
- `data/users.json` - User data

### Source Code Structure
```
src/
├── app.ts                          # Express app setup
├── server.ts                       # Server entry point
├── config/
│   └── env.ts                      # Environment validation (Zod)
├── core/
│   ├── db.ts                       # PostgreSQL connection pool
│   ├── errors.ts                   # AppError class
│   └── json-store.ts               # JSON file storage abstraction
├── middleware/
│   └── error-handler.ts            # Global error handling
├── modules/
│   ├── auth/
│   │   ├── auth.controller.ts      # Auth endpoints
│   │   ├── auth.middleware.ts      # Session verification
│   │   ├── auth.service.ts         # Business logic (register, login, Google auth)
│   │   ├── auth.store.ts           # Data access layer (Postgres + JSON)
│   │   ├── auth.routes.ts          # Route definitions
│   │   ├── auth.schemas.ts         # Zod validation schemas
│   │   └── auth.types.ts           # TypeScript types
│   ├── users/
│   │   ├── user.controller.ts
│   │   ├── user.routes.ts
│   │   ├── user.service.ts
│   │   └── user.types.ts
│   ├── applications/
│   │   ├── application.controller.ts
│   │   ├── application.routes.ts
│   │   ├── application.service.ts  # Complex status management
│   │   ├── application.store.ts    # JSON only (no Postgres migration)
│   │   ├── application.types.ts
│   │   ├── application.service.test.ts
│   │   └── (implicit exports via .js)
│   ├── billing/
│   │   ├── billing.controller.ts
│   │   ├── billing.routes.ts
│   │   ├── billing.service.ts      # Payment logic with locking
│   │   ├── billing.store.ts        # JSON only (no Postgres migration)
│   │   ├── billing.pricing.ts      # Pricing configuration
│   │   └── billing.types.ts
│   └── health/
│       └── health.routes.ts        # Health check endpoint
├── routes/
│   └── health.ts                   # Unused (duplicated in app.ts)
└── utils/
    └── logger.ts                   # Pino logger
```

---

## 2. DATABASE INTEGRATION ANALYSIS

### Current Setup: HYBRID - Postgres + JSON Files

**Environment Configuration:**
```
STORAGE_DRIVER=postgres              # Set to postgres
DATABASE_URL=<Supabase connection>   # Pooled connection string
```

### Database Architecture

#### Auth Module (Postgres + JSON)
- **Dual Mode**: `usePostgres = env.STORAGE_DRIVER === 'postgres' && env.DATABASE_URL`
- **If Postgres enabled**: Uses `pg` pool to connect
- **If disabled**: Falls back to JSON files
- **Tables created**:
  - `users` (with indexes on email, google_subject)
  - `sessions` (with index on user_id)

#### Applications Module (JSON ONLY)
- **File**: `applications.json`
- **Class**: `JsonStore<Application[]>` 
- **Status**: NO Postgres migration
- **Issue**: Still using JSON file storage even when Postgres is configured

#### Billing Module (JSON ONLY)
- **File**: `billing-orders.json`
- **Class**: `JsonStore<BillingOrder[]>`
- **Status**: NO Postgres migration
- **Issue**: Still using JSON file storage even when Postgres is configured

#### Data Files (JSON ONLY)
- **File**: `data/users.json`, `data/sessions.json`
- **Status**: Fallback only if Postgres disabled

### Database Connection Details
```typescript
// From db.ts
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false }  // ⚠️ SSL issue handling
    : false,
});
```

---

## 3. SSL CERTIFICATE ISSUE - ROOT CAUSE

### The Problem
```
Error: self-signed certificate in certificate chain
```

### Why It's Happening

1. **Supabase Connection String Analysis**:
   ```
   DATABASE_URL=postgres://postgres.oisiwsbrcisvydfpqilh:password@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
   ```
   - Uses `sslmode=require` in connection string
   - This enforces SSL connection
   - AWS RDS with self-signed certificates

2. **Current Mitigation (Partial)**:
   ```typescript
   ssl: process.env.NODE_ENV === 'production' 
     ? { rejectUnauthorized: false }  // Allows self-signed certs
     : false                           // NO SSL in dev
   ```
   - **Problem**: In development, SSL is disabled entirely
   - **Problem**: Vercel runs in production mode, so rejectUnauthorized is set to false, BUT...
   - **Real Issue**: The connection string still has `sslmode=require`, conflicting with dev settings

### Why It Fails on npm run dev
- NODE_ENV=development
- SSL is disabled in pool config: `ssl: false`
- But `DATABASE_URL` includes `?sslmode=require`
- The `pg` driver respects the URL parameter, causing conflict
- Result: SSL error when trying to connect

### Why It Fails on Vercel
- NODE_ENV=production
- rejectUnauthorized=false should allow self-signed
- But there's a mismatch between URL-level and pool-level SSL config
- Possible Node.js version differences on Vercel

---

## 4. AUTHENTICATION SYSTEM

### Flow: Registration
1. `POST /api/v1/auth/register` → `registerUser()` controller
2. Validates with `registerSchema` (Zod)
3. Calls `register()` service
4. Email normalized (lowercase)
5. Account creation lock ensures no race conditions
6. Password hashed with Argon2
7. User created in auth.store (Postgres or JSON)
8. Session created
9. Session cookie set (httpOnly, sameSite=lax)
10. Public user returned (no password)

### Flow: Login
1. `POST /api/v1/auth/login` → `loginUser()` controller
2. Find user by email, verify password with Argon2
3. Create session
4. Set session cookie
5. Return public user

### Flow: Google OAuth
1. `POST /api/v1/auth/google` → `googleLoginUser()`
2. Verify Google credential (JWT validation)
3. Extracts email, name, Google subject ID
4. Links to existing user or creates new
5. Creates session and returns public user

### Session Management
- **Storage**: Postgres `sessions` table or `data/sessions.json`
- **Expiry**: 7 days (604,800,000ms)
- **Cookie**: `audevertax_session` (httpOnly, sameSite=lax)
- **Verification**: `requireAuth` middleware checks cookie validity

### Protected Routes
- All routes under `/api/v1/users`, `/api/v1/applications`, `/api/v1/billing` require auth
- `requireAuth` middleware verifies session

---

## 5. ALL CURRENT ISSUES & ROOT CAUSES

### CRITICAL ISSUES

#### 1. SSL/CERTIFICATE ERROR (Primary Issue)
**Status**: 🔴 BLOCKING - Both npm run dev and Vercel fail
**Location**: PostgreSQL connection in `db.ts`
**Root Cause**: Mismatch between connection string `sslmode=require` and pool SSL config
**Affects**: 
- Local development: Cannot connect
- Vercel production: Cannot connect

#### 2. Incomplete Postgres Migration
**Status**: 🔴 BLOCKING - Data inconsistency
**Location**: `applications.store.ts`, `billing.store.ts`
**Root Cause**: Auth migrated to Postgres, but applications and billing still use JSON
**Details**:
- `JsonStore<Application[]>` still loads entire array into memory
- No persistence when Postgres is enabled
- Can lose application data on restart

#### 3. Vercel Configuration Incorrect
**Status**: 🟡 MEDIUM
**Location**: `vercel.json`
**Root Cause**: Points to `src/app.ts` but should be a serverless function
**Details**:
```json
{
  "src": "src/app.ts",      // ❌ This is not a Vercel function
  "use": "@vercel/node"
}
```
- Should use `src/server.ts` or create an API handler
- Vercel expects a handler export, not an app file

#### 4. JsonStore Constructor Parameter Mismatch
**Status**: 🔴 CODE ERROR
**Location**: `src/modules/applications/application.store.ts` line 3
**Root Cause**: `new JsonStore<Application[]>('applications.json', [])`
**Details**:
```typescript
// JsonStore constructor only takes filePath, not default value
constructor(private readonly filePath: string) {}

// But usage tries to pass []
const store = new JsonStore<Application[]>('applications.json', []);  // ❌ Wrong
```
- This should be: `new JsonStore<Application>('applications.json')`
- But actual usage pattern is different - it's trying to store arrays

### HIGH PRIORITY ISSUES

#### 5. Environment Variable Schema Issue
**Status**: 🟡 HIGH
**Location**: `src/config/env.ts`
**Root Cause**: `DATABASE_URL` is optional but Postgres requires it
**Details**:
```typescript
DATABASE_URL: z.string().url().optional(),  // ❌ Optional
```
- If `.env` missing DATABASE_URL but STORAGE_DRIVER='postgres', system tries to connect to undefined

#### 6. Missing Postgres Migration for Applications & Billing
**Status**: 🟡 HIGH
**Location**: `application.store.ts`, `billing.store.ts`
**Root Cause**: Not updated when auth was migrated to Postgres
**Details**:
- No dual-mode support like auth.store
- No table creation in `db.ts`
- Data loss when switching between JSON/Postgres

#### 7. .env File Exposed with Real Credentials
**Status**: 🔴 SECURITY
**Location**: `.env` file (currently tracked in git)
**Details**:
- Contains Supabase password, Google Client ID
- Should not be in version control
- Add to `.gitignore`

#### 8. Cookie Security in Development
**Status**: 🟡 MEDIUM
**Location**: `auth.controller.ts`
**Details**:
```typescript
secure: process.env.NODE_ENV === 'production'
```
- Won't work with http://localhost in development
- Cookies won't be sent/received over HTTP
- Need to disable secure flag in development

### MEDIUM PRIORITY ISSUES

#### 9. Unused Routes File
**Status**: 🟠 CODE SMELL
**Location**: `src/routes/health.ts`
**Details**: Unused healthRouter, health check duplicated in `app.ts`

#### 10. Type Safety Issues
**Status**: 🟠 MEDIUM
**Location**: Multiple files
**Details**:
- `any` types in mapping functions: `function mapRowToUser(row: any)`
- No proper error handling for database failures
- Pool errors only logged to console, not integrated with logger

#### 11. Google Keys Caching
**Status**: 🟠 MEDIUM
**Location**: `auth.service.ts`
**Details**:
- Global variables `googleKeys` and `googleKeysExpiresAt` for caching
- No thread-safety concerns (Node.js is single-threaded) but could be refactored

#### 12. Missing Database Error Handling
**Status**: 🟠 MEDIUM
**Location**: `db.ts`, `auth.store.ts`
**Details**:
- `pool.on('error', ...)` only logs to console
- No graceful degradation
- No retry logic for failed connections

#### 13. Incomplete Auth Store Implementation
**Status**: 🟠 MEDIUM
**Location**: `auth.store.ts` - sessionStore only
**Details**:
- Only reads/writes sessions via JSON or Postgres
- No batch operations
- No transaction support (important for billing)

#### 14. Applications & Billing - Hybrid Load/Save Issue
**Status**: 🟠 MEDIUM
**Location**: `application.store.ts`, `billing.store.ts`
**Details**:
```typescript
// This pattern loads entire file into memory:
const store = new JsonStore<Application[]>('applications.json', []);
async listByUser(userId: string) {
  const applications = await store.read();  // Reads entire array
  return applications.filter(...);
}
```
- Scales poorly with large datasets
- No pagination support

### LOW PRIORITY ISSUES

#### 15. Console.log vs Logger
**Status**: 🟡 LOW
**Location**: `db.ts` initialization
**Details**:
```typescript
console.log('Database initialized successfully');  // Should use logger
console.error('Failed to initialize database:', error);
```

#### 16. Missing Test Coverage
**Status**: 🟡 LOW
**Location**: `application.service.test.ts` exists but empty (likely)
**Details**: No visible tests in codebase

#### 17. CORS Configuration
**Status**: 🟡 LOW
**Location**: `app.ts`
**Details**:
```typescript
cors({ origin: env.FRONTEND_URL, credentials: true })
```
- Assumes single frontend URL
- Won't work if frontend deployed to multiple URLs

#### 18. Rate Limiting
**Status**: 🟡 LOW
**Location**: `app.ts`
**Details**:
```typescript
rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, ... })
```
- Global rate limit of 300 requests per 15 minutes
- No per-endpoint customization

---

## 6. COMPLETE FIX CHECKLIST

### CRITICAL FIXES (Do First)

- [ ] **Fix SSL Certificate Issue**
  - Remove `sslmode=require` from DATABASE_URL connection string
  - Use only pool-level SSL configuration
  - Create separate pooled connection URL for dev vs prod

- [ ] **Fix Vercel Deployment**
  - Create `api/index.ts` serverless function handler
  - Update vercel.json to point to correct handler
  - Ensure DATABASE_URL available on Vercel

- [ ] **Migrate Applications to Postgres**
  - Create `applications` table schema
  - Update application.store.ts to support dual mode
  - Add table creation to db.ts initialization

- [ ] **Migrate Billing to Postgres**
  - Create `billing_orders` table schema
  - Update billing.store.ts to support dual mode
  - Add table creation to db.ts initialization

- [ ] **Fix JsonStore Parameter Bug**
  - Correct the JsonStore instantiation in application.store.ts
  - Ensure proper type usage

### HIGH PRIORITY FIXES

- [ ] **Fix Environment Validation**
  - Make DATABASE_URL required when STORAGE_DRIVER='postgres'
  - Add validation that dependencies match

- [ ] **Secure Credentials**
  - Add .env to .gitignore
  - Create .env.example with placeholders
  - Use Vercel environment variables for secrets

- [ ] **Fix Cookie Security**
  - Handle development environment properly
  - Use dynamic secure flag or development-specific settings

- [ ] **Add Database Error Handling**
  - Replace console logging with logger
  - Add retry logic for failed connections
  - Implement graceful degradation

### MEDIUM PRIORITY FIXES

- [ ] **Remove Unused Code**
  - Delete `src/routes/health.ts`
  - Clean up duplicate health check

- [ ] **Improve Type Safety**
  - Replace `any` types with proper types
  - Add database result row types

- [ ] **Better Error Handling**
  - Map database errors to AppError
  - Add specific error codes for auth failures

---

## 7. REQUIRED CODE CHANGES

### Fix 1: Connection String (database.ts format)

**Current (BROKEN)**:
```typescript
DATABASE_URL=postgres://postgres.oisiwsbrcisvydfpqilh:password@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require
```

**Fixed**:
```typescript
DATABASE_URL=postgres://postgres.oisiwsbrcisvydfpqilh:password@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```
Remove the `?sslmode=require` parameter entirely, let pool-level config handle SSL.

### Fix 2: DB Pool Configuration (db.ts)

```typescript
// Current - problematic
ssl: process.env.NODE_ENV === 'production' 
  ? { rejectUnauthorized: false }
  : false,

// Fixed - better approach
ssl: process.env.NODE_ENV === 'production'
  ? { rejectUnauthorized: false }
  : { rejectUnauthorized: false },  // Dev also needs self-signed support
```

### Fix 3: Vercel Handler (create `api/index.ts`)

```typescript
import { app } from '../src/app.js';

export default app;
```

### Fix 4: Application Store Migration

Needs dual-mode support like auth.store.ts

### Fix 5: Billing Store Migration  

Needs dual-mode support like auth.store.ts

---

## 8. ARCHITECTURE SUMMARY

### Request Flow
1. Client → Express app.ts
2. CORS + Security (helmet) + Rate limiting
3. Route specific handlers (modules)
4. Auth middleware verification
5. Business logic (service layer)
6. Data access (store layer - Postgres/JSON)
7. Response formatting + Error handling

### Data Flow
- **Auth**: User registration → Postgres/JSON → Session cookie
- **Applications**: User creates/updates → JSON only (should be Postgres)
- **Billing**: Pricing calc → Payment lock → Order creation (JSON only)

### Storage Strategy (Current)
- **Production (intended)**: Postgres for all
- **Development**: JSON files or Postgres based on STORAGE_DRIVER env
- **Reality**: Auth uses Postgres, Applications/Billing use JSON always

---

## 9. NEXT STEPS (In Priority Order)

1. Fix SSL certificate error (remove sslmode=require from URL)
2. Test local connection with `npm run dev`
3. Migrate applications module to Postgres
4. Migrate billing module to Postgres
5. Fix Vercel deployment configuration
6. Add .env to .gitignore
7. Secure credentials on Vercel
8. Add proper error handling and logging
9. Write tests for critical flows
10. Performance optimization (pagination, caching)
