# Backend Database

The backend now uses MySQL through `mysql2`. Images are still stored locally in `backend/uploads`; the database stores the public `/uploads/...` path.

## Setup

1. Create a MySQL database:

```sql
CREATE DATABASE gym_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. Copy `.env.example` to `.env` and set:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=gym_admin
```

You can also use a single URL:

```env
DATABASE_URL=mysql://your_user:your_password@localhost:3306/gym_admin
```

3. Start the app:

```bash
npm start
```

On startup the server runs `backend/schema.sql` automatically. If `backend/data/db.json` exists and the MySQL `members` table is empty, the server imports the old JSON data once.

## Tables

See `backend/schema.sql` for the full table descriptions: `app_settings`, `members`, `attendance`, `checkins`, and `payments`.
