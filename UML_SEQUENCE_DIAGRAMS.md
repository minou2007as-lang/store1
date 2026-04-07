# MOHSTORE — UML Sequence Diagrams

> Generated from live codebase analysis.  
> Stack: Next.js · Node.js · PostgreSQL · JWT (HS256)

---

## 1. User Registration

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend (React)
    participant BE as Backend (Next.js API)
    participant RL as Rate Limiter
    participant DB as Database (PostgreSQL)

    User->>FE: Fill registration form (email, username, password, role)
    FE->>BE: POST /api/auth/register
    BE->>RL: Check rate limit (5 req / window per IP)
    alt Rate limit exceeded
        RL-->>BE: 429 Too Many Requests
        BE-->>FE: { error: "Too many requests" }
        FE-->>User: Show rate-limit error
    else Within limit
        RL-->>BE: OK
        BE->>DB: SELECT * FROM users WHERE email = ?
        alt Email already exists
            DB-->>BE: Row found
            BE-->>FE: 409 { error: "Email already in use" }
            FE-->>User: Show conflict error
        else Email is free
            DB-->>BE: No row
            BE->>BE: bcrypt.hash(password, cost=10)
            BE->>DB: INSERT INTO users (email, username, password_hash, role, balance=0)
            DB-->>BE: New user row (id, role)
            BE->>BE: jwtSign({ id, email, username, role }, secret, 7d)
            BE-->>FE: 201 { user, token }
            FE->>FE: localStorage.setItem("auth_token", token)
            FE-->>User: Redirect to /dashboard
        end
    end
```

---

## 2. User Login

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Frontend (React)
    participant BE as Backend (Next.js API)
    participant DB as Database (PostgreSQL)

    User->>FE: Enter email + password
    FE->>BE: POST /api/auth/login { email, password }
    BE->>DB: SELECT id, email, username, role, password_hash FROM users WHERE email = ?
    alt User not found
        DB-->>BE: No row
        BE-->>FE: 401 { error: "Invalid credentials" }
        FE-->>User: Show error message
    else User found
        DB-->>BE: User row
        BE->>BE: bcrypt.compare(password, password_hash)
        alt Password mismatch
            BE-->>FE: 401 { error: "Invalid credentials" }
            FE-->>User: Show error message
        else Password correct
            BE->>BE: jwtSign({ id, email, username, role }, secret, 7d)
            BE-->>FE: 200 { user: { id, email, username, role }, token }
            FE->>FE: localStorage.setItem("auth_token", token)
            FE->>FE: localStorage.setItem("auth_user", JSON.stringify(user))
            FE-->>User: Redirect to /dashboard
        end
    end
```

---

## 3. Add Offer / Product (Seller)

```mermaid
sequenceDiagram
    autonumber
    actor Seller
    participant FE as Frontend (React)
    participant BE as Backend (Next.js API)
    participant DB as Database (PostgreSQL)

    Seller->>FE: Navigate to "Post Task" page
    FE->>BE: GET /api/games (Authorization: Bearer <token>)
    BE->>DB: SELECT * FROM games WHERE is_active = true
    DB-->>BE: Active games list
    BE-->>FE: 200 [ { id, name, slug, platform } ]
    FE-->>Seller: Render game selector

    Seller->>FE: Select game, choose product, set price & quantity
    FE->>BE: POST /api/offers { product_id, points_price, quantity, unit, description }
    BE->>BE: verifyToken(Authorization header) → AuthPayload
    alt Token invalid / expired
        BE-->>FE: 401 Unauthorized
        FE-->>Seller: Redirect to /auth/login
    else Token valid
        BE->>DB: SELECT id FROM sellers WHERE user_id = ? AND verification_status = 'verified'
        alt Seller not verified
            DB-->>BE: No row
            BE-->>FE: 403 { error: "Seller account not verified" }
            FE-->>Seller: Show verification required message
        else Seller verified
            DB-->>BE: Seller row
            BE->>DB: SELECT id FROM seller_games WHERE seller_id = ? AND game_id = (game of product)
            alt Game not registered to seller
                DB-->>BE: No row
                BE-->>FE: 403 { error: "Game not in your profile" }
            else Game registered
                DB-->>BE: seller_game row
                BE->>DB: INSERT INTO offers (product_id, seller_id, points_price, quantity, unit, is_active=true)
                DB-->>BE: New offer row (id)
                BE-->>FE: 201 { offer }
                FE-->>Seller: "Offer published successfully"
            end
        end
    end
```

---

## 4. Browse Products

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant FE as Frontend (React)
    participant BE as Backend (Next.js API)
    participant DB as Database (PostgreSQL)

    Customer->>FE: Open marketplace / product listing
    FE->>BE: GET /api/games
    BE->>DB: SELECT * FROM games WHERE is_active = true ORDER BY name
    DB-->>BE: Games list
    BE-->>FE: 200 [ { id, name, slug, platform } ]
    FE-->>Customer: Render game filter tabs

    Customer->>FE: Select a game filter
    FE->>BE: GET /api/offers?gameId={id}
    BE->>DB: SELECT offers.*, products.name AS product_name, games.name AS game_name,\n        sellers.average_rating, users.username AS seller_name\n FROM offers\n JOIN products ON offers.product_id = products.id\n JOIN games ON products.game_id = games.id\n JOIN sellers ON offers.seller_id = sellers.id\n JOIN users ON sellers.user_id = users.id\n WHERE games.id = ? AND offers.is_active = true
    DB-->>BE: Offer rows with joined data
    BE-->>FE: 200 [ { id, product_name, points_price, quantity, unit, seller_name, average_rating } ]
    FE-->>Customer: Render product cards with seller rating

    Customer->>FE: Click on a product card
    FE->>BE: GET /api/sellers/{seller_id}
    BE->>DB: SELECT sellers.*, users.username, reviews aggregate FROM sellers WHERE id = ?
    DB-->>BE: Seller profile
    BE-->>FE: 200 { seller profile + stats }
    FE-->>Customer: Show seller details & reviews
```

---

## 5. Add to Cart

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant FE as Frontend (React)
    participant LS as LocalStorage (Browser)
    participant BE as Backend (Next.js API)
    participant DB as Database (PostgreSQL)

    Note over FE,LS: Cart is managed client-side in localStorage

    Customer->>FE: Click "Add to Cart" on an offer
    FE->>BE: GET /api/game-accounts (Authorization: Bearer <token>)
    BE->>DB: SELECT * FROM game_accounts WHERE user_id = ?
    DB-->>BE: Customer's saved game accounts
    BE-->>FE: 200 [ { id, game_id, account_identifier } ]
    FE-->>Customer: Prompt: select game account for this order

    Customer->>FE: Select game account (or add new one)
    alt New game account
        FE->>BE: POST /api/game-accounts { game_id, account_identifier, account_password }
        BE->>DB: INSERT INTO game_accounts (user_id, game_id, account_identifier, account_password_encrypted)
        DB-->>BE: New game_account row
        BE-->>FE: 201 { game_account }
    end

    FE->>LS: setItem("cart", JSON.stringify([{ offer_id, product_name, points_price, game_account_id, quantity }]))
    LS-->>FE: Stored
    FE-->>Customer: Cart icon badge updated, "Added to cart"
```

---

## 6. Checkout / Place Order

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant FE as Frontend (React)
    participant BE as Backend (Next.js API)
    participant DB as Database (PostgreSQL)
    participant NT as Notification Service

    Customer->>FE: Review cart → Click "Place Order"
    FE->>BE: POST /api/orders { offer_id, game_account_id, notes }\n Authorization: Bearer <token>
    BE->>BE: verifyToken() → { id: customer_id, role: 'customer' }
    alt Not authenticated
        BE-->>FE: 401 Unauthorized
        FE-->>Customer: Redirect to login
    else Authenticated
        BE->>DB: BEGIN TRANSACTION
        BE->>DB: SELECT * FROM offers WHERE id = ? AND is_active = true FOR UPDATE
        alt Offer not found / inactive
            DB-->>BE: No row
            BE->>DB: ROLLBACK
            BE-->>FE: 404 { error: "Offer not available" }
            FE-->>Customer: Show error
        else Offer found
            DB-->>BE: Offer row (points_price)
            BE->>DB: SELECT balance FROM users WHERE id = ? FOR UPDATE
            alt Insufficient balance
                DB-->>BE: balance < points_price
                BE->>DB: ROLLBACK
                BE-->>FE: 402 { error: "Insufficient points balance" }
                FE-->>Customer: Show top-up prompt
            else Sufficient balance
                DB-->>BE: balance row
                BE->>DB: UPDATE users SET balance = balance - points_price WHERE id = ?
                BE->>DB: INSERT INTO point_transactions\n  (user_id, amount=-points_price, type='spend', balance_before, balance_after)
                BE->>DB: INSERT INTO orders\n  (customer_id, offer_id, game_account_id, status='open',\n   points_amount=points_price, picked_at=NULL)
                DB-->>BE: New order row (id)
                BE->>DB: COMMIT
                BE->>NT: INSERT notification for available sellers\n  (type='new_order', title='New order available')
                NT-->>DB: Notifications stored
                BE-->>FE: 201 { order: { id, status: 'open', points_amount } }
                FE->>FE: localStorage.removeItem("cart")
                FE-->>Customer: "Order placed! Waiting for seller."
            end
        end
    end
```

---

## 7. Order Tracking

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    actor Seller
    participant FE as Frontend (React)
    participant BE as Backend (Next.js API)
    participant DB as Database (PostgreSQL)
    participant NT as Notification Service

    Note over Seller,BE: Seller picks the open order
    Seller->>FE: View available orders list
    FE->>BE: GET /api/orders?filter=available (Bearer <seller_token>)
    BE->>DB: SELECT orders.* FROM orders\n JOIN offers ON orders.offer_id = offers.id\n JOIN products ON offers.product_id = products.id\n JOIN seller_games ON products.game_id = seller_games.game_id\n WHERE orders.status = 'open' AND seller_games.seller_id = ?
    DB-->>BE: Open orders for seller's games
    BE-->>FE: 200 [ { order details } ]
    FE-->>Seller: Render open orders

    Seller->>FE: Click "Pick Order"
    FE->>BE: POST /api/orders/pick { order_id } (Bearer <seller_token>)
    BE->>DB: UPDATE orders SET status='in_progress', assigned_seller_id=?,\n  picked_at=NOW()\n WHERE id=? AND status='open'
    alt Another seller picked first (race)
        DB-->>BE: 0 rows updated
        BE-->>FE: 409 { error: "Order already taken" }
        FE-->>Seller: "Order no longer available"
    else Pick successful
        DB-->>BE: 1 row updated
        BE->>NT: INSERT notification to customer (type='order_update', "Seller found!")
        NT-->>DB: Stored
        BE-->>FE: 200 { order: { status: 'in_progress', assigned_seller_id } }
        FE-->>Seller: Show order chat & deliver button
    end

    Note over Customer,FE: Customer polls order status
    Customer->>FE: Open "My Orders" page
    FE->>BE: GET /api/orders/{id} (Bearer <customer_token>)
    BE->>DB: SELECT * FROM orders WHERE id = ? AND customer_id = ?
    DB-->>BE: Order row
    BE-->>FE: 200 { order: { status, picked_at, assigned_seller_id } }
    FE-->>Customer: Show timeline (open → in_progress → delivered → completed)

    Note over Customer,Seller: In-order chat
    Seller->>FE: Send message
    FE->>BE: POST /api/orders/{id}/messages { content } (Bearer <seller_token>)
    BE->>DB: INSERT INTO order_messages (order_id, sender_id, content)
    DB-->>BE: Message row
    BE-->>FE: 201 { message }
    FE-->>Customer: Message visible in chat

    Note over Seller,BE: Seller marks order delivered
    Seller->>FE: Click "Mark as Delivered"
    FE->>BE: POST /api/orders/{id}/deliver (Bearer <seller_token>)
    BE->>DB: UPDATE orders SET status='delivered', delivered_at=NOW(),\n  auto_release_at=NOW()+INTERVAL '7 days'\n WHERE id=? AND assigned_seller_id=?
    DB-->>BE: Updated
    BE->>NT: INSERT notification to customer (type='order_delivered', "Please confirm delivery")
    NT-->>DB: Stored
    BE-->>FE: 200 { order: { status: 'delivered', auto_release_at } }
    FE-->>Customer: "Delivery claimed — confirm or it auto-releases in 7 days"

    Note over Customer,BE: Customer confirms delivery
    Customer->>FE: Click "Confirm Receipt"
    FE->>BE: POST /api/orders/{id}/confirm (Bearer <customer_token>)
    BE->>DB: BEGIN TRANSACTION
    BE->>DB: UPDATE orders SET status='completed', confirmed_at=NOW(), completed_at=NOW()
    BE->>DB: UPDATE users SET balance = balance + seller_earnings WHERE id = seller_id
    BE->>DB: INSERT INTO point_transactions\n  (user_id=seller_id, amount=seller_earnings, type='order')
    BE->>DB: UPDATE sellers SET total_tasks_completed = total_tasks_completed + 1
    BE->>DB: COMMIT
    BE->>NT: INSERT notification to seller (type='payment_received', "Funds released!")
    BE-->>FE: 200 { order: { status: 'completed' } }
    FE-->>Customer: "Order completed. You can now leave a review."
```

---

## 8. Admin Managing Products

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant FE as Frontend (React)
    participant BE as Backend (Next.js API)
    participant DB as Database (PostgreSQL)

    Note over Admin,BE: Admin manages Games catalog
    Admin->>FE: Navigate to Admin → Games
    FE->>BE: GET /api/admin/games (Bearer <admin_token>)
    BE->>BE: verifyToken() → role must be 'admin'
    alt Not admin
        BE-->>FE: 403 Forbidden
        FE-->>Admin: Access denied
    else Admin confirmed
        BE->>DB: SELECT * FROM games ORDER BY name
        DB-->>BE: All games
        BE-->>FE: 200 [ { id, name, slug, platform, is_active } ]
        FE-->>Admin: Render games table

        Admin->>FE: Click "Add Game" → fill form
        FE->>BE: POST /api/admin/games { name, slug, platform, is_active }
        BE->>DB: INSERT INTO games (name, slug, platform, is_active)
        DB-->>BE: New game row
        BE-->>FE: 201 { game }
        FE-->>Admin: Game appears in list

        Admin->>FE: Toggle game active/inactive
        FE->>BE: PUT /api/admin/games/{id} { is_active: false }
        BE->>DB: UPDATE games SET is_active = ? WHERE id = ?
        DB-->>BE: Updated
        BE-->>FE: 200 { game }
        FE-->>Admin: Row reflects new status

        Note over Admin,BE: Admin manages Products
        Admin->>FE: Navigate to Products for a game
        FE->>BE: GET /api/products?gameId={id}
        BE->>DB: SELECT * FROM products WHERE game_id = ?
        DB-->>BE: Products list
        BE-->>FE: 200 [ { id, name, game_id, is_active } ]
        FE-->>Admin: Render products table

        Admin->>FE: Click "Add Product" → fill form
        FE->>BE: POST /api/admin/products { game_id, name }
        BE->>DB: INSERT INTO products (game_id, name, is_active=true)
        DB-->>BE: New product row
        BE-->>FE: 201 { product }
        FE-->>Admin: Product appears in list

        Admin->>FE: Disable / delete a product
        FE->>BE: PUT /api/admin/products/{id} { is_active: false }
        BE->>DB: UPDATE products SET is_active = false WHERE id = ?
        DB-->>BE: Updated
        BE-->>FE: 200 { product }
        FE-->>Admin: Product marked inactive
    end
```

---

## 9. Admin Monitoring Orders

```mermaid
sequenceDiagram
    autonumber
    actor Admin
    participant FE as Frontend (React)
    participant BE as Backend (Next.js API)
    participant DB as Database (PostgreSQL)
    participant NT as Notification Service

    Admin->>FE: Navigate to Admin → Orders
    FE->>BE: GET /api/admin/orders?status=all&page=1 (Bearer <admin_token>)
    BE->>BE: verifyToken() → role must be 'admin'
    BE->>DB: SELECT orders.*, customers.username, sellers.username,\n        offers.points_price, products.name\n FROM orders\n JOIN users AS customers ON orders.customer_id = customers.id\n LEFT JOIN users AS sellers ON orders.assigned_seller_id = sellers.id\n JOIN offers ON orders.offer_id = offers.id\n JOIN products ON offers.product_id = products.id\n ORDER BY created_at DESC LIMIT 20 OFFSET ?
    DB-->>BE: Order rows with joins
    BE-->>FE: 200 { orders: [...], total, page }
    FE-->>Admin: Render orders table with filter/search

    Admin->>FE: Filter by status (open / in_progress / completed)
    FE->>BE: GET /api/admin/orders?status=open
    BE->>DB: SELECT ... WHERE orders.status = 'open'
    DB-->>BE: Filtered orders
    BE-->>FE: 200 { orders }
    FE-->>Admin: Shows only open orders

    Admin->>FE: Click on an order to inspect
    FE->>BE: GET /api/admin/orders/{id}
    BE->>DB: SELECT full order details + messages + point_transactions
    DB-->>BE: Full order data
    BE-->>FE: 200 { order, messages, transactions }
    FE-->>Admin: Order detail panel

    Note over Admin,BE: Admin intervenes (dispute / force-complete)
    Admin->>FE: Click "Force Complete" or "Cancel Order"
    FE->>BE: PUT /api/admin/orders/{id} { status: 'completed', adminNote: '...' }
    BE->>DB: BEGIN TRANSACTION
    BE->>DB: UPDATE orders SET status=?, completed_at=NOW(), admin_note=?
    BE->>DB: UPDATE users SET balance = balance + refund WHERE id = customer_id
    BE->>DB: INSERT INTO point_transactions (type='refund' or 'order')
    BE->>DB: COMMIT
    BE->>NT: INSERT notifications to both customer and seller
    NT-->>DB: Stored
    BE-->>FE: 200 { order }
    FE-->>Admin: Order updated, audit trail visible
```

---

## 10. Review & Rating System

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant FE as Frontend (React)
    participant BE as Backend (Next.js API)
    participant DB as Database (PostgreSQL)
    participant NT as Notification Service

    Note over Customer,BE: Only allowed after order status = 'completed'
    Customer->>FE: Open completed order → "Leave a Review"
    FE->>BE: GET /api/reviews?order_id={id} (Bearer <customer_token>)
    BE->>DB: SELECT * FROM reviews WHERE order_id = ?
    DB-->>BE: Existing review (or empty)
    alt Review already submitted
        BE-->>FE: 200 { review }
        FE-->>Customer: Show read-only submitted review
    else No review yet
        BE-->>FE: 200 { review: null }
        FE-->>Customer: Show star-rating form + comment input
    end

    Customer->>FE: Select 1-5 stars, type comment → Submit
    FE->>BE: POST /api/reviews { order_id, rating, comment }\n Authorization: Bearer <customer_token>
    BE->>BE: verifyToken() → customer_id
    BE->>DB: SELECT * FROM orders\n WHERE id = order_id\n AND customer_id = ?\n AND status = 'completed'
    alt Order not found or not completed
        DB-->>BE: No row
        BE-->>FE: 403 { error: "Order not eligible for review" }
        FE-->>Customer: Show error
    else Order valid
        DB-->>BE: Order row (assigned_seller_id)
        BE->>DB: INSERT INTO reviews\n  (order_id, seller_id=assigned_seller_id, customer_id, rating, comment)
        DB-->>BE: New review row
        BE->>DB: UPDATE sellers\n  SET average_rating = (\n    SELECT AVG(rating) FROM reviews WHERE seller_id = ?\n  )\n WHERE id = ?
        DB-->>BE: Seller rating updated
        BE->>NT: INSERT notification to seller\n  (type='new_review', "You received a {rating}★ review")
        NT-->>DB: Stored
        BE-->>FE: 201 { review }
        FE-->>Customer: "Review submitted. Thank you!"
    end

    Note over Customer,BE: Any user reads seller reviews
    Customer->>FE: View seller profile
    FE->>BE: GET /api/reviews?seller_id={id}
    BE->>DB: SELECT reviews.*, users.username AS customer_name\n FROM reviews\n JOIN users ON reviews.customer_id = users.id\n WHERE reviews.seller_id = ?\n ORDER BY created_at DESC
    DB-->>BE: reviews list
    BE-->>FE: 200 [ { rating, comment, customer_name, created_at } ]
    FE-->>Customer: Render star ratings & comment list
```

---

## 11. Recharge System (Points / USDT)

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    actor Admin
    participant FE as Frontend (React)
    participant BE as Backend (Next.js API)
    participant DB as Database (PostgreSQL)
    participant NT as Notification Service
    participant Store as File Storage

    Note over Customer,BE: Step 1 — Customer initiates top-up
    Customer->>FE: Navigate to Top-Up page
    FE->>BE: GET /api/payment-methods (Bearer <customer_token>)
    BE->>DB: SELECT * FROM payment_methods WHERE is_active = true
    DB-->>BE: Available methods (USDT, bank, etc.)
    BE-->>FE: 200 [ { id, name, display_name, instructions } ]
    FE-->>Customer: Show payment method options

    Customer->>FE: Select payment method, enter amount, upload proof image

    FE->>BE: POST /api/topups (multipart/form-data)\n  { payment_method_id, amount_points, transaction_reference, proof_image }\n  Authorization: Bearer <token>
    BE->>DB: SELECT payment_method_accounts\n  WHERE payment_method_id = ?\n  ORDER BY (usage_count / priority) ASC LIMIT 1
    DB-->>BE: Best payment account (least used)
    BE->>Store: Save proof_image to /public/uploads/
    Store-->>BE: image_url
    BE->>DB: INSERT INTO point_topups\n  (user_id, amount_points, payment_method_id,\n   payment_account_id, transaction_reference,\n   proof_image=image_url, status='pending')
    DB-->>BE: New topup row (id)
    BE->>DB: UPDATE payment_method_accounts\n  SET usage_count = usage_count + 1\n  WHERE id = ?
    BE->>NT: INSERT notification to admin\n  (type='topup_request', "New top-up request #id")
    NT-->>DB: Stored
    BE-->>FE: 201 { topup: { id, status: 'pending', amount_points } }
    FE-->>Customer: "Top-up request submitted. Awaiting approval."

    Note over Admin,BE: Step 2 — Admin reviews top-up
    Admin->>FE: Navigate to Admin → Top-Ups
    FE->>BE: GET /api/admin/topups?status=pending (Bearer <admin_token>)
    BE->>DB: SELECT point_topups.*, users.username, users.email,\n  payment_methods.name, payment_method_accounts.account_number\n FROM point_topups\n JOIN users ON point_topups.user_id = users.id\n WHERE status = 'pending'
    DB-->>BE: Pending topup rows
    BE-->>FE: 200 [ { topup details with user & payment info } ]
    FE-->>Admin: Render pending top-ups with proof image links

    Admin->>FE: Review proof → Click "Approve"
    FE->>BE: POST /api/admin/topups/{id}/approve (Bearer <admin_token>)
    BE->>DB: BEGIN TRANSACTION
    BE->>DB: UPDATE point_topups SET status='processing' WHERE id = ? AND status='pending'
    BE->>DB: UPDATE users\n  SET balance = balance + amount_points,\n      total_points = total_points + amount_points\n  WHERE id = user_id
    BE->>DB: INSERT INTO point_transactions\n  (user_id, amount=amount_points, type='topup',\n   balance_before, balance_after)
    BE->>DB: UPDATE point_topups SET status='approved', approved_at=NOW()
    BE->>DB: COMMIT
    BE->>NT: INSERT notification to customer\n  (type='topup_approved', "Your {amount} points have been credited!")
    NT-->>DB: Stored
    BE-->>FE: 200 { topup: { status: 'approved' } }
    FE-->>Admin: Row moves to "Approved" tab

    Note over Admin,BE: Admin rejects a top-up
    Admin->>FE: Click "Reject" → enter reason
    FE->>BE: POST /api/admin/topups/{id}/reject\n  { rejection_reason } (Bearer <admin_token>)
    BE->>DB: UPDATE point_topups\n  SET status='rejected', rejection_reason=?\n  WHERE id = ?
    DB-->>BE: Updated
    BE->>NT: INSERT notification to customer\n  (type='topup_rejected', "Top-up rejected: {reason}")
    NT-->>DB: Stored
    BE-->>FE: 200 { topup: { status: 'rejected' } }
    FE-->>Admin: Row moves to "Rejected" tab
    FE-->>Customer: (async via notification) "Your top-up was rejected"
```

---

## 12. Telegram Bot — Order Tracking

```mermaid
sequenceDiagram
    autonumber
    actor User as User (Telegram)
    participant TG as Telegram Bot Server
    participant API as Telegram Bot API
    participant BE as MOHSTORE Backend
    participant DB as Database (PostgreSQL)
    participant NT as Notification Service

    Note over TG,API: Bot starts and registers webhook
    TG->>API: POST /setWebhook { url: "https://mohstore.com/api/telegram/webhook" }
    API-->>TG: 200 { ok: true }

    Note over User,TG: User links account
    User->>API: /start command in Telegram chat
    API->>TG: Webhook update { message: "/start", chat_id }
    TG->>BE: POST /api/telegram/link-account { chat_id, link_token }
    BE->>DB: SELECT * FROM users WHERE telegram_link_token = link_token
    alt Token not found or expired
        DB-->>BE: No row
        BE-->>TG: 404 { error: "Invalid link token" }
        TG->>API: sendMessage(chat_id, "Link token invalid. Get a new one from your profile.")
    else Token valid
        DB-->>BE: User row
        BE->>DB: UPDATE users SET telegram_chat_id = ? WHERE id = ?
        DB-->>BE: Updated
        BE-->>TG: 200 { username }
        TG->>API: sendMessage(chat_id, "Account linked! Hello, {username}.")
    end

    Note over User,TG: User tracks an order
    User->>API: /order {order_id} in chat
    API->>TG: Webhook update { message: "/order ABC123", chat_id }
    TG->>BE: GET /api/telegram/orders/{order_id}?chat_id={chat_id}
    BE->>DB: SELECT users.id FROM users WHERE telegram_chat_id = ?
    alt Chat ID not linked
        DB-->>BE: No row
        BE-->>TG: 401 Unauthorized
        TG->>API: sendMessage(chat_id, "Please link your account first with /start.")
    else Chat ID linked
        DB-->>BE: user_id
        BE->>DB: SELECT orders.*, offers.*, products.name, sellers_user.username\n FROM orders\n LEFT JOIN offers ON orders.offer_id = offers.id\n LEFT JOIN products ON offers.product_id = products.id\n LEFT JOIN users AS sellers_user ON orders.assigned_seller_id = sellers_user.id\n WHERE orders.id = ? AND orders.customer_id = ?
        alt Order not found / wrong owner
            DB-->>BE: No row
            BE-->>TG: 404
            TG->>API: sendMessage(chat_id, "Order not found.")
        else Order found
            DB-->>BE: Order row
            BE-->>TG: 200 { id, status, product_name, seller_name, picked_at, delivered_at }
            TG->>TG: Format status message with emoji
            TG->>API: sendMessage(chat_id,\n  "📦 Order #{id}\n Product: {name}\n Status: {status}\n Seller: {seller}\n Last update: {timestamp}")
            API-->>User: Formatted order status message
        end
    end

    Note over NT,TG: Push notifications on order events
    BE->>NT: Order status changes (picked, delivered, completed)
    NT->>BE: INSERT notification (type='order_update', user_id, order_id)
    BE->>DB: SELECT telegram_chat_id FROM users WHERE id = user_id
    DB-->>BE: chat_id (if linked)
    alt User has Telegram linked
        BE->>API: POST /sendMessage { chat_id, text: "🚀 Order #{id} status: {new_status}" }
        API-->>User: Push notification delivered
    else No Telegram link
        BE->>DB: Notification stored in DB only
        Note over BE,DB: User reads via /api/notifications
    end
```

---

> **Notes:**  
> - Diagrams 1–11 reflect the **live codebase** implementation.  
> - Diagram 12 (Telegram Bot) is an **architectural blueprint** — the bot integration is planned but not yet implemented in the codebase.  
> - All authenticated endpoints use `Authorization: Bearer <JWT>` with a custom HS256 implementation (`lib/jwt.ts`).  
> - The database is PostgreSQL (Supabase) — SQL snippets in diagrams reflect actual query patterns found in the route handlers.
