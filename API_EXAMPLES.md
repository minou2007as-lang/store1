# MOHSTORE API Usage Examples - Order Picking Model

## Quick Start Flow

### 1. Admin: Create Game, Product, and Offer

```bash
# 1. Create a game (if not exists)
POST /api/admin/products
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "game_id": "game-valorant-id",
  "name": "Radiant Rank Boost",
  "description": "Get boosted to Radiant rank in competitive mode"
}

# Response:
{
  "success": true,
  "product_id": "product-123"
}
```

```bash
# 2. Create an offer for the product
POST /api/admin/offers
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "product_id": "product-123",
  "quantity": 1,
  "unit": "service",
  "points_price": 2500
}

# Response:
{
  "success": true,
  "offer_id": "offer-456"
}
```

### 2. Admin: Assign Games to Sellers

```bash
POST /api/admin/sellers/games
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "seller_id": "seller-789",
  "game_id": "game-valorant-id"
}

# Response:
{
  "success": true,
  "message": "Game assigned to seller"
}

# To unassign:
DELETE /api/admin/sellers/games?seller_id=seller-789&game_id=game-valorant-id
Authorization: Bearer {admin-token}

# Response:
{
  "success": true,
  "message": "Game unassigned from seller"
}
```

---

## Customer Flow

### 1. Register as Customer

```bash
POST /api/auth/register
Content-Type: application/json

{
  "username": "gamer_pro",
  "email": "user@example.com",
  "password": "secure_password_123",
  "role": "customer"
}

# Response:
{
  "success": true,
  "message": "User registered successfully",
  "token": "eyJhbGc..."
}
```

### 2. Login

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password_123"
}

# Response:
{
  "success": true,
  "token": "eyJhbGc...",
  "user": {
    "id": "user-123",
    "username": "gamer_pro",
    "email": "user@example.com",
    "role": "customer",
    "total_points": 5000
  }
}
```

### 3. Add Game Account

```bash
POST /api/game-accounts
Authorization: Bearer {customer-token}
Content-Type: application/json

{
  "game_name": "Valorant",
  "account_identifier": "ProGamer#NA1",
  "account_password": "encrypted_password_here"
}

# Response:
{
  "success": true,
  "account_id": "account-999"
}
```

### 4. Create Order (Select Offer + Game Account)

```bash
POST /api/orders
Authorization: Bearer {customer-token}
Content-Type: application/json

{
  "offer_id": "offer-456",
  "game_account_id": "account-999"
}

# Response:
{
  "success": true,
  "order_id": "order-111",
  "message": "Order created successfully. Waiting for seller to pick."
}

# Note: This call:
# 1. Validates offer exists and is active
# 2. Validates game account belongs to customer
# 3. Checks customer has 2500 points (offer price)
# 4. DEDUCTS 2500 points from customer
# 5. Creates order with status='open'
# 6. Logs point transaction
```

### 5. View My Orders

```bash
GET /api/orders?filter=my-orders
Authorization: Bearer {customer-token}

# Response:
{
  "success": true,
  "orders": [
    {
      "id": "order-111",
      "customer_id": "user-123",
      "offer_id": "offer-456",
      "game_account_id": "account-999",
      "assigned_seller_id": null,  // Not picked yet
      "status": "open",
      "points_amount": 2500,
      "seller_earnings": null,
      "picked_at": null,
      "created_at": "2024-01-01T10:00:00Z",
      "product_name": "Radiant Rank Boost",
      "game_name": "Valorant"
    }
  ]
}
```

### 6. Check Profile & Points Balance

```bash
GET /api/users/profile
Authorization: Bearer {customer-token}

# Response:
{
  "success": true,
  "user": {
    "id": "user-123",
    "username": "gamer_pro",
    "total_points": 2500,  // 5000 - 2500 spent on order
    "role": "customer"
  }
}
```

---

## Seller Flow

### 1. Register as Seller

```bash
POST /api/auth/register
Content-Type: application/json

{
  "username": "pro_seller",
  "email": "seller@example.com",
  "password": "seller_password",
  "role": "seller"
}

# Response: (same as customer)
{
  "success": true,
  "token": "eyJhbGc...",
  "user": {
    "id": "seller-123",
    "role": "seller",
    "total_points": 0
  }
}
```

### 2. Create Seller Profile

```bash
POST /api/sellers
Authorization: Bearer {seller-token}
Content-Type: application/json

{
  "business_name": "ProGamer Services",
  "business_description": "Professional Valorant and CS2 booster with 5+ years experience"
}

# Response:
{
  "success": true,
  "message": "Seller profile created. Awaiting admin verification."
}

# Admin then:
# 1. Verifies the seller profile
# 2. Assigns games to seller via /api/admin/sellers/games
```

### 3. View Available Orders (for assigned games)

```bash
GET /api/orders?filter=available
Authorization: Bearer {seller-token}

# Response:
{
  "success": true,
  "orders": [
    {
      "id": "order-111",
      "offer_id": "offer-456",
      "customer_id": "user-123",
      "game_account_id": "account-999",  // Visible but no details
      "assigned_seller_id": null,
      "status": "open",
      "points_amount": 2500,
      "product_name": "Radiant Rank Boost",
      "game_name": "Valorant",
      "created_at": "2024-01-01T10:00:00Z"
      // Note: Account credentials NOT included before picking
    }
  ]
}
```

### 4. Pick an Order (ATOMIC)

```bash
POST /api/orders/pick
Authorization: Bearer {seller-token}
Content-Type: application/json

{
  "order_id": "order-111"
}

# Response (if successful - seller was first):
{
  "success": true,
  "message": "Order picked successfully",
  "order_id": "order-111",
  "seller_earnings": 2250  // 2500 - 10% fee (250) = 2250
}

# Response (if another seller picked first):
{
  "error": "Order was already picked by another seller",
  "status": 409
}

# This call:
# 1. Validates seller is assigned to this game
# 2. Checks order status is 'open'
# 3. ATOMIC: Sets assigned_seller_id + status='in_progress' only if status still 'open'
# 4. Calculates seller earnings (points - fee)
# 5. Returns 409 if another seller beat them to it
```

### 5. View Order Details (after picking)

```bash
GET /api/orders/order-111
Authorization: Bearer {seller-token}

# Response (NOW includes account details):
{
  "success": true,
  "order": {
    "id": "order-111",
    "customer_id": "user-123",
    "offer_id": "offer-456",
    "game_account_id": "account-999",
    "assigned_seller_id": "seller-123",
    "status": "in_progress",
    "points_amount": 2500,
    "seller_earnings": 2250,
    "picked_at": "2024-01-01T10:05:00Z",
    "product_name": "Radiant Rank Boost",
    "game_name": "Valorant",
    "customer_username": "gamer_pro",
    "game_account": {
      "id": "account-999",
      "account_identifier": "ProGamer#NA1",
      "account_password": "actual_password_here"  // Only after picking!
    }
  }
}
```

### 6. Mark Order as Complete

```bash
PUT /api/orders/order-111
Authorization: Bearer {seller-token}
Content-Type: application/json

{
  "status": "completed"
}

# Response:
{
  "success": true,
  "message": "Order marked as completed"
}

# This call:
# 1. Validates only assigned seller can complete
# 2. Updates status to 'completed'
# 3. Awards points to seller
# 4. Logs point transaction
```

### 7. View Earnings & My Orders

```bash
GET /api/orders?filter=my-tasks
Authorization: Bearer {seller-token}

# Response:
{
  "success": true,
  "orders": [
    {
      "id": "order-111",
      "status": "completed",
      "points_amount": 2500,
      "seller_earnings": 2250,
      "picked_at": "2024-01-01T10:05:00Z",
      "completed_at": "2024-01-01T12:00:00Z",
      "product_name": "Radiant Rank Boost",
      "game_name": "Valorant"
    }
  ]
}
```

---

## Key Differences from Old System

### Old Bidding System
```
Customer posts task → Sellers submit bids → Customer negotiates → Accepts one bid
```

### New Order Picking System
```
Admin creates offer → Customer buys offer → Seller picks (atomic) → Seller completes
```

## Important Notes

1. **Points Deducted Immediately**: When customer creates order, points are deducted right away
2. **Atomic Picking**: Only first seller to execute PUT wins - database prevents race conditions
3. **Limited Info Before Picking**: Sellers see offer details but not account credentials until they pick
4. **Fixed Pricing**: Admin sets points price in offers - no negotiation
5. **Fee System**: Each seller has configurable fee (default 10%), deducted from earnings
6. **Game-Based**: Sellers only see orders for games they're assigned to

## Error Responses

```bash
# Insufficient Points
{
  "error": "Insufficient points",
  "status": 400
}

# Offer Not Found
{
  "error": "Offer not found or inactive",
  "status": 404
}

# Game Account Not Found
{
  "error": "Game account not found",
  "status": 404
}

# Not Assigned to Game
{
  "error": "You are not assigned to this game",
  "status": 403
}

# Order Already Picked (Race Condition)
{
  "error": "Order was already picked by another seller",
  "status": 409
}

# Not Assigned Seller
{
  "error": "Only assigned seller can complete order",
  "status": 403
}

# Unauthorized
{
  "error": "Unauthorized",
  "status": 401
}
```

---

## Testing with cURL

```bash
# Admin login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'

# Create offer
curl -X POST http://localhost:3000/api/admin/offers \
  -H "Authorization: Bearer {admin-token}" \
  -H "Content-Type: application/json" \
  -d '{"product_id":"prod-1","quantity":1,"unit":"service","points_price":2500}'

# Customer login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"customer@example.com","password":"pass123"}'

# Create order
curl -X POST http://localhost:3000/api/orders \
  -H "Authorization: Bearer {customer-token}" \
  -H "Content-Type: application/json" \
  -d '{"offer_id":"offer-1","game_account_id":"acc-1"}'

# Seller login & pick order
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"seller@example.com","password":"seller123"}'

curl -X POST http://localhost:3000/api/orders/pick \
  -H "Authorization: Bearer {seller-token}" \
  -H "Content-Type: application/json" \
  -d '{"order_id":"order-1"}'
```

---

**Last Updated**: January 2024
