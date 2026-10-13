# AXDORO Clothing E-commerce Platform

A premium clothing e-commerce MVP using React + Node.js/Express + PostgreSQL (PERN).

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v20+ (tested on Node v24.15.0)
- **npm**: v10+ (tested on npm 11.12.1)
- **PostgreSQL**: v15+ (tested on PostgreSQL 16.13)

### 2. Local Database Provisioning
Run the provisioning script using Ubuntu's `postgres` administrative role to create the `axdoro_dev` and `axdoro_test` databases along with the least-privilege `axdoro_app` and `axdoro_migrator` roles:

```bash
sudo -u postgres psql -f scripts/setup-local-db.sql
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Database Migrations
Run the versioned migration runner against your local database:

```bash
# Check current migration status
npm run db:status

# Apply pending migrations
npm run db:migrate:local
```

### 5. Running Development Servers
Starts both backend Express API (port 5000) and frontend Vite application (port 5173):

```bash
npm run dev
```

---

## Quality & Build Commands

```bash
# Run unit and integration tests across workspaces
npm test

# Run TypeScript typechecks
npm run typecheck

# Run production build
npm run build
```

---

## Production (Neon) Separation

Local and production databases are strictly isolated:
- Local development connects strictly to local PostgreSQL (`localhost:5432`).
- Production connects to Neon PostgreSQL via `NEON_DATABASE_URL` configured in the hosting platform.
- Migration runner includes safety guards preventing accidental local execution against Neon production URLs.
