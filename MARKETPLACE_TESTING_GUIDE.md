# Game Services Marketplace - Testing & Verification Guide

## 🚀 Pre-Deployment Testing

### Step 1: Database Migration

#### 1.1 Execute Migration
```sql
-- Copy contents from: scripts/03-exclusive-offers-schema.sql
-- Paste into Supabase SQL Editor
-- Click "Run"
```

#### 1.2 Verify Table Created
```sql
-- In Supabase SQL Editor:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'exclusive_offers';

-- Should return:
-- table_name
-- exclusive_offers
```

#### 1.3 Verify Columns
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'exclusive_offers'
ORDER BY ordinal_position;

-- Expected columns:
-- id: uuid (not null)
-- seller_id: uuid (not null)
-- game_id: uuid (nullable)
-- name: text (not null)
-- description: text (nullable)
-- price: integer (not null)
-- is_active: boolean (not null)
-- created_at: timestamp (not null)
-- updated_at: timestamp (not null)
```

#### 1.4 Verify Indices
```sql
SELECT indexname FROM pg_indexes 
WHERE tablename = 'exclusive_offers';

-- Expected indices:
-- exclusive_offers_pkey
-- idx_exclusive_offers_seller_id
-- idx_exclusive_offers_game_id
-- idx_exclusive_offers_is_active
-- idx_exclusive_offers_seller_game
```

---

## 🧪 API Testing

### Step 2: Test Games API

#### 2.1 GET /api/games
```bash
# Using curl
curl -X GET http://localhost:3000/api/games

# Expected Response (200 OK):
{
  "games": [
    {
      "id": "uuid",
      "name": "Game Name",
      "description": "Game description",
      "image_url": "https://...",
      "slug": "game-slug"
    }
  ]
}

# Verify:
- ✓ Returns 200 OK
- ✓ Games array is not empty (if games exist)
- ✓ Each game has all required fields
- ✓ Only games with is_active = true
- ✓ Games sorted alphabetically by name
```

#### 2.2 GET /api/games/[gameId]/offers
```bash
# First, get a valid gameId from the games list above
GAME_ID="<valid-uuid-from-games>"

# Using curl
curl -X GET http://localhost:3000/api/games/${GAME_ID}/offers

# Expected Response (200 OK):
{
  "game": {
    "id": "uuid",
    "name": "Game Name"
  },
  "offers": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "name": "Offer Name",
      "description": "Description",
      "quantity": 100,
      "unit": "units",
      "points_price": 500
    }
  ]
}

# Verify:
- ✓ Returns 200 OK
- ✓ Game object has correct id and name
- ✓ Offers array matches products for this game
- ✓ Only offers with is_active = true
- ✓ All required fields present
- ✓ Points prices are positive integers

# Test with invalid gameId:
curl http://localhost:3000/api/games/invalid-uuid/offers
# Expected: 404 Not found
```

---

### Step 3: Test Exclusive Offers API

#### 3.1 GET /api/exclusive-offers
```bash
# Using curl
curl http://localhost:3000/api/exclusive-offers

# Expected Response (200 OK):
{
  "offers": [
    {
      "id": "uuid",
      "name": "Pack Name",
      "description": "Pack description",
      "price": 800,
      "seller": {
        "id": "uuid",
        "username": "seller_name",
        "avatar_url": "https://..."
      },
      "game": {
        "id": "uuid",
        "name": "Game Name"
      },
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1
}

# Verify:
- ✓ Returns 200 OK
- ✓ Only active offers (is_active = true)
- ✓ Seller info is populated
- ✓ Game info (if set) is populated
- ✓ All offers sorted by created_at DESC
- ✓ Total count matches array length
```

#### 3.2 POST /api/exclusive-offers (Create)
```bash
# First, get authentication token
# You need: User ID, Bearer Token from auth system

TOKEN="<your-bearer-token>"
GAME_ID="<valid-game-uuid>" # optional

# Using curl
curl -X POST http://localhost:3000/api/exclusive-offers \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test War Pack",
    "description": "200M wood + 150M food",
    "price": 800,
    "game_id": "'${GAME_ID}'"
  }'

# Expected Response (201 Created):
{
  "id": "new-uuid",
  "seller_id": "authenticated-user-id",
  "game_id": "game-uuid",
  "name": "Test War Pack",
  "description": "200M wood + 150M food",
  "price": 800,
  "is_active": true,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}

# Test Cases:
# Case 1: Missing auth
curl -X POST http://localhost:3000/api/exclusive-offers \
  -H "Content-Type: application/json" \
  -d '{"name":"Pack","price":100}'
# Expected: 401 Unauthorized

# Case 2: Invalid token
curl -X POST http://localhost:3000/api/exclusive-offers \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -d '{"name":"Pack","price":100}'
# Expected: 401 Invalid token

# Case 3: Missing required field (name)
curl -X POST http://localhost:3000/api/exclusive-offers \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"price": 100}'
# Expected: 400 Name and price are required

# Case 4: Invalid price (negative)
curl -X POST http://localhost:3000/api/exclusive-offers \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Pack","price":-100}'
# Expected: 400 Price must be a positive number

# Case 5: Non-seller user
# Use token from user without seller record
# Expected: 403 Only sellers can create exclusive offers
```

#### 3.3 GET /api/exclusive-offers/[id]
```bash
# Get valid offer ID from listing
OFFER_ID="<valid-uuid>"

curl http://localhost:3000/api/exclusive-offers/${OFFER_ID}

# Expected Response (200 OK):
# Same structure as individual offer from list endpoint

# Test with invalid ID:
curl http://localhost:3000/api/exclusive-offers/invalid-id
# Expected: 404 Not Found
```

#### 3.4 PATCH /api/exclusive-offers/[id] (Update)
```bash
TOKEN="<your-bearer-token>"
OFFER_ID="<offer-you-created>"

curl -X PATCH http://localhost:3000/api/exclusive-offers/${OFFER_ID} \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Pack Name",
    "price": 900
  }'

# Expected Response (200 OK):
# Updated offer object

# Test Cases:
# Case 1: Not authenticated
curl -X PATCH http://localhost:3000/api/exclusive-offers/${OFFER_ID} \
  -H "Content-Type: application/json" \
  -d '{"price": 900}'
# Expected: 401 Unauthorized

# Case 2: Not offer owner
# Use token from different user/seller
# Expected: 403 You can only edit your own offers

# Case 3: Invalid price
curl -X PATCH http://localhost:3000/api/exclusive-offers/${OFFER_ID} \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"price": -100}'
# Expected: 400 Price must be a positive number

# Case 4: Non-existent offer
curl -X PATCH http://localhost:3000/api/exclusive-offers/fake-id \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{"price": 900}'
# Expected: 404 Offer not found
```

#### 3.5 DELETE /api/exclusive-offers/[id]
```bash
TOKEN="<your-bearer-token>"
OFFER_ID="<offer-to-delete>"

curl -X DELETE http://localhost:3000/api/exclusive-offers/${OFFER_ID} \
  -H "Authorization: Bearer ${TOKEN}"

# Expected Response (200 OK):
{
  "success": true
}

# Verify in database:
SELECT is_active FROM exclusive_offers WHERE id = 'offer-id';
-- Should return: false (soft deleted)

# Test Cases:
# Case 1: Not authenticated
curl -X DELETE http://localhost:3000/api/exclusive-offers/${OFFER_ID}
# Expected: 401 Unauthorized

# Case 2: Not offer owner
# Expected: 403 You can only delete your own offers

# Case 3: Already deleted
# Delete same offer twice
# Expected: 404 Offer not found (soft delete filters is_active = false)
```

---

## 🖥️ Frontend Testing

### Step 4: Test Game Browsing Page

#### 4.1 Navigate to Page
```
Go to: http://localhost:3000/dashboard/marketplace/games
```

#### 4.2 Verify Page Load
```
✓ Header displays "Game Services"
✓ Search bar is visible
✓ Games load in grid (1 column on mobile, 2 on tablet, 3 on desktop)
✓ Each game card shows:
  - Game image (if available)
  - Game name
  - Game description (first 100 chars)
  - "View Offers" button
✓ No errors in browser console
✓ Page is responsive (test on different screen sizes)
```

#### 4.3 Test Search
```
Action: Type in search box
Expected:
  ✓ Games filter in real-time
  ✓ Only games matching name or description show
  ✓ Clear button appears when search has value
  
Test:
  - Search "Clash" → Only Clash of Clans shown
  - Search "Strategy" → Games with "Strategy" in description shown
  - Clear search → All games shown again
```

#### 4.4 Test Navigation
```
Action: Click "View Offers" button
Expected:
  ✓ Navigate to /marketplace/offers/game/[gameId]
  ✓ Game name displayed at top
  ✓ Back button visible
  ✓ Offers for that game load
```

---

### Step 5: Test Game Offers Page

#### 5.1 Navigate to Page
```
Go to: http://localhost:3000/dashboard/marketplace/offers/game/[gameId]
(Use a valid gameId from the games list)
```

#### 5.2 Verify Page Load
```
✓ Back button visible (clickable)
✓ Game name displayed
✓ "Select an offer to begin" message shown
✓ Offers load in cards
✓ Each offer card shows:
  - Offer name
  - Offer description
  - Quantity and unit
  - Points price
✓ Order summary panel on right (or bottom on mobile)
✓ "Proceed to Order" button disabled/grayed out initially
```

#### 5.3 Test Offer Selection
```
Action: Click on offer card
Expected:
  ✓ Card highlights with blue border
  ✓ Checkmark appears on offer card
  ✓ Order summary updates with:
    - Selected offer name
    - Quantity
    - Points price
  ✓ "Proceed to Order" button becomes active
  
Action: Click different offer
Expected:
  ✓ Previous selection unchecked
  ✓ New offer checked
  ✓ Summary updates immediately
```

#### 5.4 Test Navigation
```
Action: Click "Proceed to Order"
Expected:
  ✓ Navigate to /marketplace/orders/create
    with query params: ?offerId=X&gameId=Y
  
Action: Click Back button
Expected:
  ✓ Navigate back to /marketplace/games
```

---

### Step 6: Test Exclusive Offers Page

#### 6.1 Navigate to Page
```
Go to: http://localhost:3000/dashboard/marketplace/exclusive-offers
```

#### 6.2 Verify Page Load
```
✓ Header displays "Exclusive Seller Packs"
✓ Search bar visible
✓ Filter buttons visible (All Sellers + individual sellers)
✓ Offers load in grid
✓ Each offer card shows:
  - Game tag (if set) in amber badge
  - "Exclusive" badge in blue
  - Offer name
  - Offer description
  - Seller avatar and username
  - Points price (large text)
  - "Details" button
  - "Order Now" button
✓ No errors in browser console
✓ Responsive on different screen sizes
```

#### 6.3 Test Search
```
Action: Type in search box
Expected:
  ✓ Offers filter by name, description, AND seller username
  ✓ Results update in real-time
  ✓ "No packs found" message if no matches
  
Examples:
  - Search "War" → Returns offers with "War" in name
  - Search seller username → Returns offers from that seller
  - Search "200M wood" → Returns offers with that in description
```

#### 6.4 Test Seller Filter
```
Action: Click seller button in filter
Expected:
  ✓ Button highlights in blue
  ✓ Offers filtered to show only from that seller
  ✓ Search + seller filter work together
  
Action: Click "All Sellers"
Expected:
  ✓ All sellers shown again
  ✓ Search filter still applies (if any)
```

#### 6.5 Test Combined Filters
```
Action: Select seller AND type search
Expected:
  ✓ Both filters apply (AND logic, not OR)
  ✓ Only offers from selected seller matching search shown
```

---

### Step 7: Test Hub/Navigation Page

#### 7.1 Navigate to Page
```
Go to: http://localhost:3000/dashboard/marketplace
```

#### 7.2 Verify Content
```
✓ Header displays "Game Services Marketplace"
✓ "Browse Games" card visible
  - Icon appears
  - Description shows
  - "View Games" button works
✓ "Exclusive Packs" card visible
  - Icon appears
  - Description shows
  - "View Exclusive Packs" button works
✓ "Marketplace Features" section shows 4 features
✓ "How It Works" section shows 4 steps
```

#### 7.3 Test Navigation
```
Action: Click "Browse Games" card or button
Expected: Navigate to /marketplace/games

Action: Click "Exclusive Packs" card or button
Expected: Navigate to /marketplace/exclusive-offers
```

---

## 🐛 Error Handling Testing

### Step 8: Test Error Scenarios

#### 8.1 Network Errors
```
Action: Disable internet, navigate to games page
Expected:
  ✓ Loading spinner appears
  ✓ After timeout, error message displays
  ✓ "Try Again" button appears
  ✓ No console errors
```

#### 8.2 Invalid Game ID
```
Action: Navigate to /offers/game/invalid-uuid
Expected:
  ✓ Loading briefly
  ✓ "Game not found" error message
  ✓ Back button works
```

#### 8.3 Empty Results
```
Action: Search for "zzzzzzz" in games
Expected:
  ✓ "No games found" message
  ✓ "Clear Search" button appears
```

#### 8.4 Auth Errors (API)
```
Action: Call POST /exclusive-offers without auth
Expected:
  ✓ Returns 401 Unauthorized
  ✓ Error message clearly indicates auth required
```

---

## 📊 Database Verification

### Step 9: Data Integrity

#### 9.1 Verify Foreign Keys
```sql
-- Check seller_id references valid users
SELECT COUNT(*) as invalid_sellers
FROM exclusive_offers eo
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = eo.seller_id);
-- Expected: 0 rows

-- Check game_id references valid games (if set)
SELECT COUNT(*) as invalid_games
FROM exclusive_offers eo
WHERE eo.game_id IS NOT NULL 
  AND NOT EXISTS (SELECT 1 FROM games g WHERE g.id = eo.game_id);
-- Expected: 0 rows
```

#### 9.2 Verify Data Quality
```sql
-- Check for NULL required fields
SELECT COUNT(*) FROM exclusive_offers 
WHERE name IS NULL OR price IS NULL OR seller_id IS NULL;
-- Expected: 0 rows

-- Check prices are positive
SELECT COUNT(*) FROM exclusive_offers WHERE price <= 0;
-- Expected: 0 rows

-- Check created_at timestamps are set
SELECT COUNT(*) FROM exclusive_offers WHERE created_at IS NULL;
-- Expected: 0 rows
```

#### 9.3 Verify Soft Deletes Work
```sql
-- Create an offer, delete it, verify it's still in DB
INSERT INTO exclusive_offers (seller_id, name, price)
VALUES ((SELECT id FROM users LIMIT 1), 'Test Offer', 100);

-- Get the ID (would be shown on insert)
-- Then soft-delete via API
-- Then verify in DB:
SELECT * FROM exclusive_offers WHERE name = 'Test Offer' AND is_active = false;
-- Expected: 1 row found
```

---

## ✅ Final Verification Checklist

### Deployment Readiness
```
Database:
  ✓ Migration script executed
  ✓ exclusive_offers table created
  ✓ All indices created
  ✓ Foreign key constraints set

API:
  ✓ GET /api/games returns games
  ✓ GET /api/games/[id]/offers returns offers
  ✓ GET /api/exclusive-offers returns packs
  ✓ POST /api/exclusive-offers creates pack
  ✓ Proper auth validation
  ✓ Error responses return correct codes
  ✓ All endpoints accessible

Frontend:
  ✓ Hub page loads
  ✓ Games page loads and displays games
  ✓ Offers page loads and displays offers
  ✓ Exclusive offers page loads and displays packs
  ✓ Search functionality works
  ✓ Filter functionality works
  ✓ Navigation works correctly
  ✓ Responsive on all screen sizes
  ✓ No console errors
  ✓ Loading states display
  ✓ Error states display

Documentation:
  ✓ MARKETPLACE_GUIDE.md complete
  ✓ MARKETPLACE_QUICK_REFERENCE.md complete
  ✓ MARKETPLACE_ARCHITECTURE.md complete
  ✓ MARKETPLACE_IMPLEMENTATION_CHECKLIST.md complete
  ✓ This testing guide complete
```

### Sign-Off
```
Date Tested: _______________
Tested By: _________________
All Tests Passed: ☐ YES ☐ NO
Issues Found: _______________
Ready for Deployment: ☐ YES ☐ NO
```

---

## 📞 Troubleshooting

### Common Issues

#### Issue: API returns 404 for games
**Solution:** Ensure games exist in database with `is_active = true`
```sql
SELECT COUNT(*) FROM games WHERE is_active = true;
```

#### Issue: Images not loading
**Solution:** Verify image URLs in database are valid
```sql
SELECT id, image_url FROM games WHERE image_url IS NOT NULL;
```

#### Issue: POST exclusive-offers returns 401
**Solution:** Check Bearer token format and validity
```bash
# Token should be in format:
Authorization: Bearer <actual-jwt-token>
```

#### Issue: Offers not showing for a game
**Solution:** Verify products and offers exist for that game
```sql
SELECT COUNT(*) FROM products WHERE game_id = 'game-id' AND is_active = true;
SELECT COUNT(*) FROM offers WHERE product_id IN 
  (SELECT id FROM products WHERE game_id = 'game-id') AND is_active = true;
```

---

**Use this guide to thoroughly test the marketplace before deployment!**
