# MOHSTORE Quick Reference - Order Picking Model

## System at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│  ADMIN Creates Products/Offers/Game Assignments              │
├─────────────────────────────────────────────────────────────┤
│  ↓                                                            │
│  CUSTOMER Browses → Selects Offer + Game Account → Order     │
│  (Points Deducted Immediately)                               │
│  ↓                                                            │
│  SELLER Sees Available Orders (Limited Info) → Picks (Atomic)│
│  (Account Details Revealed, Status → in_progress)            │
│  ↓                                                            │
│  SELLER Performs Work → Marks Complete → Earns Points        │
│  (After Fee Deduction)                                       │
└─────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Order Picking (NOT Bidding)
- **Old Model**: Customer posts task → Multiple sellers bid → Customer accepts
- **New Model**: Admin defines offers → Customer orders → Seller picks (once)
- **Winner**: First seller to execute atomic UPDATE
- **Safety**: Database prevents race conditions automatically

### Admin Control
- Admin creates **Products** (e.g., "Radiant Boost", "Boss Kill")
- Admin creates **Offers** (quantity, unit, points_price)
- Admin assigns **Games** to sellers (game-based filtering)
- **Result**: Quality control, consistent pricing, matched expertise

### Game-Based Filtering
- Each seller assigned to specific games (e.g., Valorant, CS2)
- Seller only sees orders for their games
- Prevents irrelevant order discovery
- Ensures game expertise match

### Information Hiding
- **Before Picking**: Seller sees offer, points, game name
- **Before Picking**: Seller CANNOT see game_account_id or credentials
- **After Picking**: Seller sees full account details
- **Why**: Prevents cherry-picking, protects privacy

### Points Economy
```
Customer Creates Order:
  Points Deducted = offer.points_price
  
Seller Picks Order:
  Seller Earnings = points_amount × (1 - seller.fee_percentage/100)
  Platform Fee = points_amount × (seller.fee_percentage/100)
```

## Database Tables

### Core
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| users | User accounts | id, email, role, total_points |
| games | Game definitions | id, name, platform |
| sellers | Seller profiles | id, user_id, fee_percentage, verification_status |
| seller_games | Game assignments | seller_id, game_id (unique pair) |

### Products & Offers
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| products | Game services | id, game_id, name, description |
| offers | Pricing & quantities | id, product_id, quantity, unit, points_price |

### Orders & Accounts
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| orders | Customer orders | id, customer_id, offer_id, game_account_id, assigned_seller_id, status |
| game_accounts | Credentials | id, user_id, game_name, encrypted_password |

### Financial
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| point_transactions | Audit log | id, user_id, amount, type, reference_id |
| topup_requests | Buy points | user_id, amount, status (pending/approved) |
| withdrawal_requests | Cash out | user_id, amount, status (pending/approved) |

## API Quick Reference

### Customer Flow
```bash
# 1. Create order
POST /api/orders
{ offer_id, game_account_id }
→ Points deducted, order status='open'

# 2. View my orders
GET /api/orders?filter=my-orders
→ All customer's orders

# 3. Check balance
GET /api/users/profile
→ total_points remaining
```

### Seller Flow
```bash
# 1. View available orders (for my games)
GET /api/orders?filter=available
→ Orders filtered to seller's assigned games
→ Limited info: no account credentials yet

# 2. PICK ORDER (atomic - first wins)
POST /api/orders/pick
{ order_id }
→ If success: status='in_progress', seller sees credentials
→ If 409: Another seller picked it first

# 3. View my orders
GET /api/orders?filter=my-tasks
→ Seller's in-progress and completed orders

# 4. Mark complete
PUT /api/orders/[id]
{ status: 'completed' }
→ Seller earns points (after fee)
```

### Admin Flow
```bash
# Create product
POST /api/admin/products
{ game_id, name, description }

# Create offer
POST /api/admin/offers
{ product_id, quantity, unit, points_price }

# Assign game to seller
POST /api/admin/sellers/games
{ seller_id, game_id }

# Unassign game
DELETE /api/admin/sellers/games?seller_id=X&game_id=Y
```

## Common Errors

| Status | Error | Cause | Fix |
|--------|-------|-------|-----|
| 400 | Insufficient points | Customer doesn't have enough points | Buy more points |
| 404 | Offer not found | Offer deleted or inactive | Create new offer |
| 404 | Game account not found | Account belongs to different user | Use correct account |
| 403 | Not assigned to game | Seller not assigned to this game | Admin assign game |
| 409 | Already picked | Another seller picked first | Try different order |
| 401 | Unauthorized | Missing/invalid token | Login first |

## Status Transitions

### Order Status Flow
```
open (created)
  ↓
in_progress (seller picked)
  ↓
completed (seller finished) OR auto_released (7-day timeout)
```

### Offer Status
```
is_active: true (can create orders)
is_active: false (disabled)
```

### Seller Verification
```
pending → verified (admin approves) → can see orders
pending → rejected (admin rejects) → can't see orders
```

## Frontend Pages

| Page | Role | Purpose |
|------|------|---------|
| /dashboard | all | Home/stats |
| /dashboard/marketplace | customer | Browse products/offers |
| /dashboard/orders | customer | My orders |
| /dashboard/tasks | seller | Available orders to pick |
| /dashboard/earnings | seller | My earnings & stats |
| /dashboard/analytics | admin | Platform stats |
| /dashboard/users | admin | User management |

## Important Files

```
Database:
  scripts/01-init-schema.sql

API Routes:
  app/api/orders/route.ts (create, list)
  app/api/orders/pick/route.ts (atomic picking)
  app/api/admin/products/route.ts
  app/api/admin/offers/route.ts
  app/api/admin/sellers/games/route.ts

Frontend:
  app/dashboard/marketplace/page.tsx (customer browsing)
  app/dashboard/tasks/page.tsx (seller picking)
  components/dashboard/sidebar.tsx (navigation)

Docs:
  README.md (overview)
  REFACTORING_SUMMARY.md (what changed)
  API_EXAMPLES.md (API usage)
  REFACTORING_REPORT.md (detailed report)
```

## Testing Checklist

### Must Test
- [ ] Customer creates order → Points deducted
- [ ] Two sellers pick same order → 409 conflict on second
- [ ] Seller without game assignment can't see order
- [ ] Unpicked order hides account credentials
- [ ] Picked order shows full details
- [ ] Admin can create products/offers
- [ ] Admin can assign/unassign games
- [ ] Fee calculation correct

### Should Test
- [ ] Order completion marks as completed
- [ ] Point transactions logged
- [ ] Earnings calculated correctly
- [ ] Game filtering works
- [ ] Role-based access control
- [ ] Token expiration

## Deployment Steps

1. **Database**: Run migration script
2. **Backend**: Deploy new API code
3. **Frontend**: Deploy updated pages
4. **Admin**: Create games, products, offers via API
5. **Admin**: Assign sellers to games
6. **Test**: Run through complete flow
7. **Monitor**: Watch for 409 errors (race conditions)

## Performance Notes

- **Atomic Picking**: O(1) single UPDATE query
- **Game Filtering**: Indexed join on seller_games
- **Point Transactions**: Logged asynchronously
- **Scalable**: No negotiation loops or complex workflows

## Security Checklist

- ✅ Passwords hashed (bcryptjs)
- ✅ Game credentials encrypted (AES-256)
- ✅ JWT tokens on protected routes
- ✅ Account details hidden before pick
- ✅ Role-based access control
- ✅ Atomic operations prevent races
- ✅ Input validation with Zod

## Troubleshooting

### Problem: Seller sees "Order already picked"
**Solution**: Multiple sellers tried picking same order - system working as designed

### Problem: Points deducted but order not created
**Solution**: Check if game_account_id is valid and belongs to customer

### Problem: Seller can't see any orders
**Solution**: Check if seller is verified and has games assigned

### Problem: Order shows as 'open' forever
**Solution**: Auto-release not implemented yet - manual completion needed

---

**Quick Reference Version**: 1.0  
**Last Updated**: January 2024  
**For Full Documentation**: See README.md, REFACTORING_SUMMARY.md, API_EXAMPLES.md
