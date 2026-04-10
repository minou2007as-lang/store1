-- Performance indexes for frequently-queried columns.
-- Safe to run multiple times (IF NOT EXISTS).

-- Orders: filter by customer, seller, and status
CREATE INDEX IF NOT EXISTS idx_orders_customer_id     ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id       ON orders (assigned_seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_status          ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at      ON orders (created_at DESC);

-- Sellers: join from users
CREATE INDEX IF NOT EXISTS idx_sellers_user_id        ON sellers (user_id);

-- Seller games: lookup by seller profile
CREATE INDEX IF NOT EXISTS idx_seller_games_seller_id ON seller_games (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_games_game_id   ON seller_games (game_id);
