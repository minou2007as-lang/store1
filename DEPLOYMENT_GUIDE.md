# Quick Start Deployment Guide

## 🚀 Pre-Deployment Checklist

- [ ] All code changes committed to git
- [ ] Environment variables configured in Supabase
- [ ] No TypeScript errors in workspace
- [ ] API endpoints tested locally
- [ ] Database migrations reviewed and ready
- [ ] RLS policies reviewed
- [ ] Team notified of changes

---

## 📋 Step-by-Step Deployment

### 1️⃣ Run Database Migrations (In Supabase SQL Editor)

**Migration 1: RLS Policies**
```sql
-- Copy contents of scripts/04-exclusive-offers-rls.sql
-- Paste in Supabase SQL Editor
-- Run and verify success
```

**Migration 2: Orders Table Extension**
```sql
-- Copy contents of scripts/05-add-exclusive-offer-to-orders.sql
-- Paste in Supabase SQL Editor
-- Run and verify success
```

### 2️⃣ Build & Copy Changes

```bash
# Build the application
npm run build

# Verify no build errors
```

### 3️⃣ Deploy to Production

```bash
# Deploy to Vercel
vercel deploy --prod

# Or your preferred deployment method
```

### 4️⃣ Smoke Testing (5-10 minutes)

**Test Game Browsing** ✅
```
1. Navigate to /dashboard/marketplace/games
2. See game cards load
3. Search for a game
4. Click "View Offers"
5. See offers for that game
6. Select an offer
7. See order summary update
8. Click "Proceed to Order" or "Create Order"
```

**Test Exclusive Offers** ✅
```
1. Navigate to /dashboard/marketplace/exclusive-offers
2. See exclusive packs load
3. Search for a pack
4. Filter by seller
5. Click "Details" on a pack
6. See full details page
7. Click "Order Now"
```

**Test Order Creation** ✅
```
1. Complete order creation flow
2. Select game account
3. Verify points balance shows
4. Submit order
5. See success message
6. Navigate to /dashboard/orders
7. Verify order appears in list
8. Click order to view details
```

### 5️⃣ Production Verification

| Component | Check | Status |
|-----------|-------|--------|
| Games API | Returns list of games | ☐ |
| Game Offers API | Returns offers per game | ☐ |
| Exclusive Offers API | Returns active seller packs | ☐ |
| Order Creation | Creates orders correctly | ☐ |
| RLS Policies | Enforces security | ☐ |
| UI Rendering | All pages load correctly | ☐ |
| Error Handling | Errors display properly | ☐ |
| Mobile Responsive | Works on mobile | ☐ |

---

## 🔍 Key URLs to Test

```
Marketing Hub
https://yourdomain.com/dashboard/marketplace

Games Browsing
https://yourdomain.com/dashboard/marketplace/games

Game Offers (example: replace gameId)
https://yourdomain.com/dashboard/marketplace/offers/game/{gameId}

Exclusive Offers
https://yourdomain.com/dashboard/marketplace/exclusive-offers

Order Creation (example queries)
https://yourdomain.com/dashboard/marketplace/orders/create?offerId={offerId}&gameId={gameId}
https://yourdomain.com/dashboard/marketplace/orders/create?exclusiveOfferId={offerId}

Orders Dashboard
https://yourdomain.com/dashboard/orders
```

---

## 📊 Database Changes Summary

### New Table Columns
```sql
-- orders table
orders.exclusive_offer_id: uuid (foreign key to exclusive_offers)

-- Indices created:
CREATE INDEX idx_orders_exclusive_offer_id ON orders(exclusive_offer_id);
```

### RLS Policies
```sql
-- exclusive_offers table policies:
1. "Allow public read of active exclusive offers"
2. "Allow sellers to create exclusive offers"
3. "Allow sellers to update their own exclusive offers"
4. "Allow sellers to delete their own exclusive offers"
```

---

## 🆘 Rollback Plan

If issues occur, rollback in this order:

```sql
-- 1. Remove RLS policies
DROP POLICY IF EXISTS "Allow public read of active exclusive offers" ON exclusive_offers;
DROP POLICY IF EXISTS "Allow sellers to create exclusive offers" ON exclusive_offers;
DROP POLICY IF EXISTS "Allow sellers to update their own exclusive offers" ON exclusive_offers;
DROP POLICY IF EXISTS "Allow sellers to delete their own exclusive offers" ON exclusive_offers;

-- 2. Disable RLS
ALTER TABLE exclusive_offers DISABLE ROW LEVEL SECURITY;

-- 3. Remove new column from orders
ALTER TABLE orders DROP COLUMN IF EXISTS exclusive_offer_id;

-- 4. Redeploy previous version
vercel rollback prod
```

---

## 📞 Support Resources

- **Migration Issues**: Check scripts/04-*.sql and scripts/05-*.sql
- **API Issues**: Check app/api/exclusive-offers/ and app/api/orders/
- **Frontend Issues**: Check app/dashboard/marketplace/
- **RLS Issues**: Review MARKETPLACE_PHASE2_IMPLEMENTATION.md

---

## ✅ Post-Deployment

1. Monitor error logs for 24 hours
2. Gather user feedback
3. Document any issues found
4. Plan Phase 3 features if needed
5. Schedule team sync-up

---

**Estimated Deployment Time: 15-20 minutes**
**Estimated Testing Time: 30-45 minutes**
