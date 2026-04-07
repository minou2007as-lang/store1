-- MOHSTORE Database Schema (PostgreSQL)
-- Task-based ORDER PICKING marketplace for game services
-- This schema matches the actual Supabase database structure

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT DEFAULT 'customer',
  avatar_url TEXT,
  bio TEXT,
  points BIGINT DEFAULT 0,
  fee_percentage INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- Game Accounts table
CREATE TABLE IF NOT EXISTS game_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  game_id UUID,
  account_identifier TEXT NOT NULL,
  account_password_encrypted TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE INDEX IF NOT EXISTS idx_game_accounts_user_id ON game_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_game_accounts_game_id ON game_accounts (game_id);

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  platform TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  slug CHARACTER VARYING UNIQUE,
  image_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_games_is_active ON games (is_active);
-- Sellers table
CREATE TABLE IF NOT EXISTS sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE,
  fee_percentage INTEGER DEFAULT 10,
  verification_status TEXT DEFAULT 'pending',
  total_tasks_completed INTEGER DEFAULT 0,
  average_rating NUMERIC DEFAULT 0,
  is_suspended BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sellers_user_id ON sellers (user_id);
CREATE INDEX IF NOT EXISTS idx_sellers_verification_status ON sellers (verification_status);

-- Seller Game Assignments table
CREATE TABLE IF NOT EXISTS seller_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID,
  game_id UUID,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE,
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  CONSTRAINT unique_seller_game UNIQUE (seller_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_seller_games_seller_id ON seller_games (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_games_game_id ON seller_games (game_id);

-- Products table (admin-created)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_products_game_id ON products (game_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products (is_active);

-- Offers table (admin-created, linked to products)
CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID,
  name TEXT,
  quantity INTEGER NOT NULL,
  unit TEXT NOT NULL,
  points_price INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_offers_product_id ON offers (product_id);
CREATE INDEX IF NOT EXISTS idx_offers_is_active ON offers (is_active);

-- Orders table (CUSTOMER creates by selecting OFFER + GAME_ACCOUNT)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID,
  offer_id UUID,
  game_account_id UUID,
  assigned_seller_id UUID,
  status TEXT DEFAULT 'open',
  points_amount INTEGER NOT NULL,
  seller_earnings INTEGER,
  locked_at TIMESTAMP WITHOUT TIME ZONE,
  picked_at TIMESTAMP WITHOUT TIME ZONE,
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  approved_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  FOREIGN KEY (game_account_id) REFERENCES game_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_seller_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_seller_id ON orders (assigned_seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);

-- Point Transactions table
CREATE TABLE IF NOT EXISTS point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  amount INTEGER NOT NULL,
  type TEXT,
  reference_id UUID,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON point_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_type ON point_transactions (type);
CREATE INDEX IF NOT EXISTS idx_point_transactions_created_at ON point_transactions (created_at);

-- Point Top-ups table
CREATE TABLE IF NOT EXISTS point_topups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  amount_points INTEGER,
  proof_image TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_point_topups_user_id ON point_topups (user_id);
CREATE INDEX IF NOT EXISTS idx_point_topups_status ON point_topups (status);

-- Withdrawals table
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID,
  amount_requested INTEGER,
  fee_percentage INTEGER,
  final_amount INTEGER,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_seller_id ON withdrawals (seller_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals (status);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications (is_read);

-- Rate Limit Logs table (for API rate limiting)
CREATE TABLE IF NOT EXISTS rate_limit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint CHARACTER VARYING NOT NULL,
  ip_address CHARACTER VARYING NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  window_end TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_endpoint_ip_window ON rate_limit_logs (endpoint, ip_address, window_start);
CREATE INDEX IF NOT EXISTS idx_window_end ON rate_limit_logs (window_end);

-- Payment Methods (admin-managed)
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  instructions TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_active ON payment_methods (is_active);
CREATE INDEX IF NOT EXISTS idx_payment_methods_name ON payment_methods (name);

-- Payment Method Accounts (supports account rotation)
CREATE TABLE IF NOT EXISTS payment_method_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  usage_count BIGINT DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_method_accounts_method_id ON payment_method_accounts (payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_method_accounts_active ON payment_method_accounts (is_active);

INSERT INTO payment_methods (name, display_name, instructions)
VALUES
  (
    'baridimob',
    'BaridiMob',
    'Send payment to the account below, then upload proof. Keep reference as your email.'
  ),
  (
    'ccp',
    'CCP',
    'Transfer to the account below, then submit proof image and transaction reference.'
  )
ON CONFLICT (name) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  instructions = EXCLUDED.instructions;

INSERT INTO payment_method_accounts (payment_method_id, account_number, account_name)
SELECT id, '123456789', 'MOHSTORE'
FROM payment_methods
WHERE name = 'baridimob'
ON CONFLICT DO NOTHING;

INSERT INTO payment_method_accounts (payment_method_id, account_number, account_name)
SELECT id, '987654321', 'MOHSTORE'
FROM payment_methods
WHERE name = 'ccp'
ON CONFLICT DO NOTHING;

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_method_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_methods'
      AND policyname = 'payment_methods_read_all'
  ) THEN
    CREATE POLICY payment_methods_read_all
      ON payment_methods
      FOR SELECT
      USING (TRUE);
  END IF;
END
$$;

ALTER TABLE point_topups ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE point_topups ADD COLUMN IF NOT EXISTS payment_method_id UUID;
ALTER TABLE point_topups ADD COLUMN IF NOT EXISTS payment_account_id UUID;
ALTER TABLE point_topups ADD COLUMN IF NOT EXISTS payment_account_number TEXT;
ALTER TABLE point_topups ADD COLUMN IF NOT EXISTS payment_account_name TEXT;
ALTER TABLE point_topups ADD COLUMN IF NOT EXISTS transaction_reference TEXT;
ALTER TABLE point_topups ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE payment_method_accounts ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1;
ALTER TABLE payment_method_accounts ADD COLUMN IF NOT EXISTS last_used TIMESTAMP WITHOUT TIME ZONE;
UPDATE payment_method_accounts SET priority = 1 WHERE priority IS NULL;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'system';
ALTER TABLE point_transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_method_accounts'
      AND policyname = 'payment_method_accounts_read_all'
  ) THEN
    CREATE POLICY payment_method_accounts_read_all
      ON payment_method_accounts
      FOR SELECT
      USING (TRUE);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_methods'
      AND policyname = 'payment_methods_write_admin'
  ) THEN
    CREATE POLICY payment_methods_write_admin
      ON payment_methods
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM users
          WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM users
          WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_method_accounts'
      AND policyname = 'payment_method_accounts_write_admin'
  ) THEN
    CREATE POLICY payment_method_accounts_write_admin
      ON payment_method_accounts
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM users
          WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM users
          WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
      );
  END IF;
END
$$;
