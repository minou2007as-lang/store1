-- migration-version: 002-safe-migration
-- rollback-file: scripts/rollback/002-safe-migration-rollback.sql
-- Safe, idempotent production migration for Supabase.

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id SERIAL PRIMARY KEY,
  version TEXT UNIQUE,
  applied_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.schema_migration_logs (
  id SERIAL PRIMARY KEY,
  version TEXT,
  executed_sql TEXT,
  success BOOLEAN,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.schema_migration_rollbacks (
  id SERIAL PRIMARY KEY,
  version TEXT UNIQUE,
  rollback_sql TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now()
);

DO $$
DECLARE
  migration_version CONSTANT TEXT := '002-safe-migration';
  rollback_sql CONSTANT TEXT := $rollback$
ALTER TABLE public.payment_method_accounts
  DROP CONSTRAINT IF EXISTS payment_method_accounts_priority_positive_check;
DROP INDEX IF EXISTS public.idx_payment_method_accounts_last_used;
DROP INDEX IF EXISTS public.idx_payment_method_accounts_priority;
DROP INDEX IF EXISTS public.idx_payment_method_accounts_active_priority_usage;
ALTER TABLE public.payment_method_accounts
  DROP COLUMN IF EXISTS last_used,
  DROP COLUMN IF EXISTS priority;

DROP INDEX IF EXISTS public.idx_point_topups_rejection_reason;
ALTER TABLE public.point_topups
  DROP COLUMN IF EXISTS rejection_reason;

ALTER TABLE public.point_transactions
  DROP CONSTRAINT IF EXISTS point_transactions_status_allowed_check;
DROP INDEX IF EXISTS public.idx_point_transactions_status;
DROP INDEX IF EXISTS public.idx_point_transactions_reference_status;
ALTER TABLE public.point_transactions
  DROP COLUMN IF EXISTS status;

DROP INDEX IF EXISTS public.idx_notifications_type;
DROP INDEX IF EXISTS public.idx_notifications_user_type_read;
ALTER TABLE public.notifications
  DROP COLUMN IF EXISTS type;

DELETE FROM public.schema_migrations
WHERE version = '002-safe-migration';
$rollback$;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.schema_migrations
    WHERE version = migration_version
  ) THEN
    INSERT INTO public.schema_migration_logs (version, executed_sql, success)
    VALUES (migration_version, 'MIGRATION_ALREADY_APPLIED', true);

    RAISE NOTICE '[migration] Version % already applied. Skipping.', migration_version;
    RETURN;
  END IF;

  INSERT INTO public.schema_migration_logs (version, executed_sql, success)
  VALUES (migration_version, 'MIGRATION_START', NULL);

  INSERT INTO public.schema_migration_rollbacks (version, rollback_sql)
  VALUES (migration_version, rollback_sql)
  ON CONFLICT (version) DO UPDATE
  SET rollback_sql = EXCLUDED.rollback_sql,
      updated_at = now();

  -- 1) payment_methods section
  INSERT INTO public.schema_migration_logs (version, executed_sql, success)
  VALUES (migration_version, 'SECTION_START: payment_methods', NULL);

  BEGIN
    IF to_regclass('public.payment_methods') IS NULL THEN
      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, 'SECTION_SKIPPED: payment_methods table missing', true);
    ELSE
      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, 'SECTION_SUCCESS: payment_methods no changes required', true);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, format('SECTION_FAILED: payment_methods - %s', SQLERRM), false);
      RAISE;
  END;

  -- 2) payment_method_accounts section
  INSERT INTO public.schema_migration_logs (version, executed_sql, success)
  VALUES (migration_version, 'SECTION_START: payment_method_accounts', NULL);

  BEGIN
    IF to_regclass('public.payment_method_accounts') IS NULL THEN
      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, 'SECTION_SKIPPED: payment_method_accounts table missing', true);
    ELSE
      ALTER TABLE public.payment_method_accounts
        ADD COLUMN IF NOT EXISTS last_used TIMESTAMP WITHOUT TIME ZONE;

      ALTER TABLE public.payment_method_accounts
        ADD COLUMN IF NOT EXISTS priority INTEGER;

      ALTER TABLE public.payment_method_accounts
        ALTER COLUMN priority SET DEFAULT 1;

      UPDATE public.payment_method_accounts
      SET priority = 1
      WHERE priority IS NULL;

      CREATE INDEX IF NOT EXISTS idx_payment_method_accounts_last_used
        ON public.payment_method_accounts (last_used);

      CREATE INDEX IF NOT EXISTS idx_payment_method_accounts_priority
        ON public.payment_method_accounts (priority);

      CREATE INDEX IF NOT EXISTS idx_payment_method_accounts_active_priority_usage
        ON public.payment_method_accounts (is_active, priority, usage_count);

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'payment_method_accounts_priority_positive_check'
          AND conrelid = 'public.payment_method_accounts'::regclass
      ) THEN
        ALTER TABLE public.payment_method_accounts
          ADD CONSTRAINT payment_method_accounts_priority_positive_check
          CHECK (priority >= 1);
      END IF;

      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, 'SECTION_SUCCESS: payment_method_accounts', true);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, format('SECTION_FAILED: payment_method_accounts - %s', SQLERRM), false);
      RAISE;
  END;

  -- 3) point_topups section
  INSERT INTO public.schema_migration_logs (version, executed_sql, success)
  VALUES (migration_version, 'SECTION_START: point_topups', NULL);

  BEGIN
    IF to_regclass('public.point_topups') IS NULL THEN
      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, 'SECTION_SKIPPED: point_topups table missing', true);
    ELSE
      ALTER TABLE public.point_topups
        ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

      CREATE INDEX IF NOT EXISTS idx_point_topups_rejection_reason
        ON public.point_topups (rejection_reason);

      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, 'SECTION_SUCCESS: point_topups', true);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, format('SECTION_FAILED: point_topups - %s', SQLERRM), false);
      RAISE;
  END;

  -- 4) point_transactions section
  INSERT INTO public.schema_migration_logs (version, executed_sql, success)
  VALUES (migration_version, 'SECTION_START: point_transactions', NULL);

  BEGIN
    IF to_regclass('public.point_transactions') IS NULL THEN
      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, 'SECTION_SKIPPED: point_transactions table missing', true);
    ELSE
      ALTER TABLE public.point_transactions
        ADD COLUMN IF NOT EXISTS status TEXT;

      ALTER TABLE public.point_transactions
        ALTER COLUMN status SET DEFAULT 'pending';

      UPDATE public.point_transactions
      SET status = 'pending'
      WHERE status IS NULL;

      CREATE INDEX IF NOT EXISTS idx_point_transactions_status
        ON public.point_transactions (status);

      CREATE INDEX IF NOT EXISTS idx_point_transactions_reference_status
        ON public.point_transactions (reference_id, status);

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'point_transactions_status_allowed_check'
          AND conrelid = 'public.point_transactions'::regclass
      ) THEN
        ALTER TABLE public.point_transactions
          ADD CONSTRAINT point_transactions_status_allowed_check
          CHECK (status IN ('pending', 'approved', 'rejected'));
      END IF;

      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, 'SECTION_SUCCESS: point_transactions', true);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, format('SECTION_FAILED: point_transactions - %s', SQLERRM), false);
      RAISE;
  END;

  -- 5) notifications section
  INSERT INTO public.schema_migration_logs (version, executed_sql, success)
  VALUES (migration_version, 'SECTION_START: notifications', NULL);

  BEGIN
    IF to_regclass('public.notifications') IS NULL THEN
      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, 'SECTION_SKIPPED: notifications table missing', true);
    ELSE
      ALTER TABLE public.notifications
        ADD COLUMN IF NOT EXISTS type TEXT;

      ALTER TABLE public.notifications
        ALTER COLUMN type SET DEFAULT 'system';

      UPDATE public.notifications
      SET type = 'system'
      WHERE type IS NULL;

      CREATE INDEX IF NOT EXISTS idx_notifications_type
        ON public.notifications (type);

      CREATE INDEX IF NOT EXISTS idx_notifications_user_type_read
        ON public.notifications (user_id, type, is_read);

      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, 'SECTION_SUCCESS: notifications', true);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, format('SECTION_FAILED: notifications - %s', SQLERRM), false);
      RAISE;
  END;

  -- 6) offers.name column
  INSERT INTO public.schema_migration_logs (version, executed_sql, success)
  VALUES (migration_version, 'SECTION_START: offers_name', NULL);

  BEGIN
    IF to_regclass('public.offers') IS NULL THEN
      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, 'SECTION_SKIPPED: offers table missing', true);
    ELSE
      ALTER TABLE public.offers
        ADD COLUMN IF NOT EXISTS name TEXT;

      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, 'SECTION_SUCCESS: offers_name', true);
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO public.schema_migration_logs (version, executed_sql, success)
      VALUES (migration_version, format('SECTION_FAILED: offers_name - %s', SQLERRM), false);
      RAISE;
  END;

  INSERT INTO public.schema_migrations (version)
  VALUES (migration_version)
  ON CONFLICT (version) DO NOTHING;

  INSERT INTO public.schema_migration_logs (version, executed_sql, success)
  VALUES (migration_version, 'MIGRATION_SUCCESS', true);

EXCEPTION
  WHEN OTHERS THEN
    INSERT INTO public.schema_migration_logs (version, executed_sql, success)
    VALUES ('002-safe-migration', format('MIGRATION_FAILED: %s', SQLERRM), false);
    RAISE;
END
$$;

