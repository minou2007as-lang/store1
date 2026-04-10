# MOHSTORE Marketplace - Quick Developer Reference

## 🚀 Quick Start (5 min read)

### What's Implemented?
✅ Game browsing with search
✅ Game-specific offers
✅ Seller-created exclusive packs
✅ Complete order creation flow
✅ Order tracking system
✅ RLS security policies
✅ Dark theme responsive UI

---

## 📍 Key URLs

```
Hub:              /dashboard/marketplace
Games:            /dashboard/marketplace/games
Game Offers:      /dashboard/marketplace/offers/game/[gameId]
Exclusive:        /dashboard/marketplace/exclusive-offers
Offer Details:    /dashboard/marketplace/exclusive-offers/[id]
Order Create:     /dashboard/marketplace/orders/create
Order Tracking:   /dashboard/orders/[id]
```

---

## 🔌 API Quick Reference

```bash
# Games
GET /api/games
→ { games: Game[] }

# Game-Specific Offers
GET /api/games/[gameId]/offers
→ { game: Game, offers: Offer[] }

# Exclusive Offers
GET /api/exclusive-offers
→ { offers: ExclusiveOffer[], total: number }

GET /api/exclusive-offers/[id]
→ ExclusiveOffer

POST /api/exclusive-offers
⚠️ Auth: Bearer token (seller only)
→ { id, name, price, seller_id }

# Orders (Enhanced)
POST /api/orders
⚠️ Auth: Bearer token (customer only)
Body: {
  // Standard offer:
  offer_id, game_id, seller_id, account_id
  // OR Exclusive:
  exclusive_offer_id, account_id
}
→ { success: true, id, order_id }
```

---

## 🗂️ File Structure

```
NEW FILES:
- /app/dashboard/marketplace/orders/create/page.tsx
- /app/dashboard/marketplace/exclusive-offers/[id]/page.tsx
- /scripts/04-exclusive-offers-rls.sql
- /scripts/05-add-exclusive-offer-to-orders.sql
- /MARKETPLACE_PHASE2_IMPLEMENTATION.md
- /DEPLOYMENT_GUIDE.md
- /SYSTEM_OVERVIEW.md

MODIFIED:
- /app/api/orders/route.ts (POST method enhanced)
- /app/dashboard/marketplace/exclusive-offers/page.tsx
```

---

## 💾 Database Changes

```sql
-- New in exclusive_offers table
ALTER TABLE public.exclusive_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read of active exclusive offers"
  ON public.exclusive_offers FOR SELECT ...

CREATE POLICY "Allow sellers to create exclusive offers"
  ON public.exclusive_offers FOR INSERT ...

CREATE POLICY "Allow sellers to update their own exclusive offers"
  ON public.exclusive_offers FOR UPDATE ...

CREATE POLICY "Allow sellers to delete their own exclusive offers"
  ON public.exclusive_offers FOR DELETE ...

-- New in orders table
ALTER TABLE public.orders 
  ADD COLUMN exclusive_offer_id uuid REFERENCES exclusive_offers;

CREATE INDEX idx_orders_exclusive_offer_id 
  ON public.orders(exclusive_offer_id);
```

---

## 🧪 Testing Quick Checks

```
✓ Games page loads
✓ Can search games
✓ Game offers page displays
✓ Can select offer (highlights)
✓ Order summary updates
✓ Exclusive offers page loads
✓ Can search/filter packs
✓ Offer details page works
✓ Order creation validates points
✓ No points → error shown
✓ Order created → redirects
✓ Order in list → can view
```

---

## ⚙️ Environment Variables Needed

```env
# Supabase (already configured)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=... (for migrations)

# Optional
NODE_ENV=production
```

---

## 🚨 Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Exclusive offers not showing | RLS not enabled | Run 04-*.sql migration |
| Order creation restricted | RLS too strict | Verify policies via SQL |
| No game accounts | User hasn't created | Link to profile page |
| Insufficient points error | Balance calculation wrong | Check points vs balance column |
| 404 on exclusive offer | Offer is_active=false | Verify in database |

---

## 📊 Data Examples

### Standard Order
```json
{
  "customer_id": "user-uuid",
  "offer_id": "offer-uuid",
  "assigned_seller_id": "seller-uuid",
  "game_account_id": "account-uuid",
  "points_amount": 100,
  "status": "open"
}
```

### Exclusive Order
```json
{
  "customer_id": "user-uuid",
  "exclusive_offer_id": "exclusive-uuid",
  "assigned_seller_id": "seller-uuid",
  "game_account_id": "account-uuid",
  "points_amount": 500,
  "status": "open"
}
```

---

## 🔐 Security Checklist

- [x] RLS policies enabled on exclusive_offers
- [x] Seller verification in POST endpoints
- [x] Customer verification in order endpoints
- [x] Game account ownership check
- [x] Points balance validation
- [x] Authorization checks for updates/deletes
- [x] Soft deletes (is_active flag) implemented

---

## 🎯 Deployment Sequence

1. **Day 1**: Run SQL migrations in Supabase
2. **Day 1**: Build & test locally
3. **Day 1**: Deploy to staging
4. **Day 1**: Full QA testing
5. **Day 2**: Deploy to production
6. **Day 2**: 24-hour monitoring
7. **Day 3**: Gather feedback

**Estimated Time**: 2 days
**Risk Level**: Low (backward compatible)
**Rollback**: Available (see DEPLOYMENT_GUIDE.md)

---

## 📞 Support

**Documentation**: See MARKETPLACE_PHASE2_IMPLEMENTATION.md
**System Overview**: See SYSTEM_OVERVIEW.md
**Deployment**: See DEPLOYMENT_GUIDE.md
**Code Issues**: Check file paths and imports

---

**Status**: Ready for Production ✅
**Last Updated**: Phase 2 Complete
**Next Phase**: Phase 3 (Ratings, Notifications, Analytics)
