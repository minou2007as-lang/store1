# Game Services Marketplace - System Architecture

## System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER (React/Next.js)                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  /dashboard/marketplace (Hub)                                                │
│  ├─ Navigation to Games and Exclusive Offers                                 │
│  ├─ Feature showcase                                                         │
│  └─ How-it-works guide                                                       │
│                                                                                │
│  /dashboard/marketplace/games                                                │
│  ├─ GET /api/games → List all games                                         │
│  ├─ Search & filter functionality                                            │
│  ├─ Click "View Offers" → Redirect to /offers/game/[id]                     │
│  └─ Responsive grid: 1-3 columns                                             │
│                                                                                │
│  /dashboard/marketplace/offers/game/[gameId]                                 │
│  ├─ GET /api/games/[id]/offers → Fetch game offers                          │
│  ├─ Display offer cards with selection                                       │
│  ├─ Highlight selected offer                                                 │
│  ├─ Show order summary panel                                                 │
│  └─ "Proceed to Order" → /orders/create (TODO)                             │
│                                                                                │
│  /dashboard/marketplace/exclusive-offers                                     │
│  ├─ GET /api/exclusive-offers → Fetch seller packs                          │
│  ├─ Filter by seller dropdown                                                │
│  ├─ Full-text search (client-side)                                           │
│  ├─ Display seller info with avatar                                          │
│  ├─ Show game tags                                                           │
│  └─ Action buttons: Details, Order Now                                       │
│                                                                                │
└──────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│                    API LAYER (Next.js Routes)                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  Games Endpoints:                                                            │
│  ├─ GET /api/games                                                          │
│  │  └─ Query: SELECT * FROM games WHERE is_active = true                    │
│  │                                                                             │
│  └─ GET /api/games/[gameId]/offers                                          │
│     ├─ Query: Get products for game                                          │
│     └─ Query: Get offers for those products                                  │
│                                                                                │
│  Exclusive Offers Endpoints:                                                │
│  ├─ GET /api/exclusive-offers                                               │
│  │  └─ Join: exclusive_offers + users + games                               │
│  │                                                                             │
│  ├─ POST /api/exclusive-offers                                              │
│  │  ├─ Auth: Verify Bearer token                                            │
│  │  ├─ Authorization: Check seller record                                   │
│  │  └─ Insert: New exclusive_offer                                          │
│  │                                                                             │
│  ├─ GET /api/exclusive-offers/[id]                                          │
│  │  └─ Fetch single offer with joins                                        │
│  │                                                                             │
│  ├─ PATCH /api/exclusive-offers/[id]                                        │
│  │  ├─ Auth: Verify Bearer token                                            │
│  │  ├─ Authorization: Check seller_id = user.id                             │
│  │  └─ Update: Offer fields                                                 │
│  │                                                                             │
│  └─ DELETE /api/exclusive-offers/[id]                                       │
│     ├─ Auth: Verify Bearer token                                            │
│     ├─ Authorization: Check seller_id = user.id                             │
│     └─ Soft Delete: Set is_active = false                                   │
│                                                                                │
└──────────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│                   DATABASE LAYER (Supabase/PostgreSQL)                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  games                              users                                    │
│  ├─ id (PK)                        ├─ id (PK)                               │
│  ├─ name                           ├─ username                               │
│  ├─ description                    ├─ email                                  │
│  ├─ image_url                      ├─ avatar_url                             │
│  ├─ slug                           └─ ... other fields                       │
│  ├─ is_active                                                                │
│  └─ (used by all marketplace flows)  ↑                                       │
│                                   (referenced by)                             │
│  products                          │                                         │
│  ├─ id (PK)                        sellers                                   │
│  ├─ game_id (FK) ──────────→      ├─ id (PK)                               │
│  ├─ name                           ├─ user_id (FK) ──→ users.id             │
│  ├─ description                    ├─ verification_status                    │
│  ├─ image_url                      └─ ... other fields                       │
│  ├─ is_active                                                                │
│  └─ points_price                     ↑                                       │
│                                   (references)                                │
│  offers                            │                                         │
│  ├─ id (PK)                        exclusive_offers (NEW)                   │
│  ├─ product_id (FK) ──────────→   ├─ id (PK)                               │
│  ├─ quantity                       ├─ seller_id (FK) ──→ users.id           │
│  ├─ unit                           ├─ game_id (FK) ────→ games.id           │
│  ├─ points_price                   ├─ name                                  │
│  ├─ is_active                      ├─ description                            │
│  └─ ... other fields               ├─ price                                 │
│                                     ├─ is_active                             │
│  Indices:                           ├─ created_at                            │
│  ├─ idx_games_is_active            ├─ updated_at                            │
│  ├─ idx_products_game_id           └─ Indices:                              │
│  └─ idx_offers_product_id             ├─ idx_exclusive_offers_seller_id     │
│                                        ├─ idx_exclusive_offers_game_id       │
│                                        ├─ idx_exclusive_offers_is_active     │
│                                        └─ idx_seller_game (composite)        │
│                                                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Authentication & Authorization Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Seller Creating Exclusive Offer                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  1. Browser                                                          │
│     └─ POST /api/exclusive-offers                                   │
│        Headers: { Authorization: "Bearer <token>" }                 │
│        Body: { name, price, description, game_id }                 │
│                                                                       │
│  2. API Route Handler                                               │
│     ├─ Extract token from Authorization header                      │
│     ├─ Verify token with Supabase auth                             │
│     │  └─ Get user object: { id, email, ... }                      │
│     ├─ Query sellers table: WHERE user_id = auth_user.id           │
│     ├─ If seller record found: ✅ Authorization OK                 │
│     ├─ Validate request body:                                       │
│     │  ├─ name: required, string                                    │
│     │  ├─ price: required, positive integer                         │
│     │  ├─ description: optional, string                             │
│     │  └─ game_id: optional, valid UUID                            │
│     └─ If all valid: Insert into exclusive_offers                  │
│        INSERT INTO exclusive_offers (                               │
│          seller_id, name, price, description, game_id, is_active   │
│        ) VALUES (auth_user.id, ...)                                │
│                                                                       │
│  3. Response                                                         │
│     ├─ Success (201): Return created offer                         │
│     ├─ Auth Error (401): Missing/invalid token                     │
│     ├─ Authorization Error (403): Not a seller                     │
│     └─ Validation Error (400): Invalid fields                      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Retrieval Flow - Get Game Offers

```
┌────────────────────────────────────────────────────────────────┐
│ User navigates to: /marketplace/offers/game/[gameId]           │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│ 1. useEffect triggers                                          │
│    └─ fetch(`/api/games/${gameId}/offers`)                     │
│                                                                  │
│ 2. API Server (GET /api/games/[gameId]/offers)                 │
│    ├─ Validate gameId parameter                                │
│    ├─ Query game: SELECT * FROM games WHERE id = gameId        │
│    │  └─ Verify is_active = true                               │
│    ├─ Query products:                                          │
│    │  └─ SELECT * FROM products WHERE game_id = gameId         │
│    │                                   AND is_active = true     │
│    ├─ Extract product IDs from results                          │
│    ├─ Query offers:                                            │
│    │  └─ SELECT * FROM offers WHERE product_id IN (...)        │
│    │                                   AND is_active = true     │
│    ├─ Join/enrich: Combine offer data with product details     │
│    └─ Return JSON:                                             │
│       {                                                         │
│         game: { id, name },                                    │
│         offers: [ { id, name, quantity, unit, price } ]        │
│       }                                                         │
│                                                                  │
│ 3. React Component                                             │
│    ├─ Receive response                                         │
│    ├─ Set state: game, offers                                  │
│    ├─ Render game header                                       │
│    ├─ Render offer cards                                       │
│    └─ Handle user selection                                    │
│                                                                  │
│ 4. User Interaction                                           │
│    ├─ Click offer card                                         │
│    ├─ Set selectedOffer in state                               │
│    ├─ Update order summary panel                               │
│    ├─ Click "Proceed to Order"                                │
│    └─ Navigate to /orders/create?offerId=X&gameId=Y           │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

## Data Retrieval Flow - Get Exclusive Offers

```
┌────────────────────────────────────────────────────────────────┐
│ User navigates to: /marketplace/exclusive-offers               │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│ 1. useEffect triggers                                          │
│    └─ fetch(`/api/exclusive-offers`)                           │
│                                                                  │
│ 2. API Server (GET /api/exclusive-offers)                      │
│    ├─ Query with JOINs:                                        │
│    │  SELECT eo.*, users.*, games.*                            │
│    │  FROM exclusive_offers eo                                 │
│    │  LEFT JOIN users ON eo.seller_id = users.id              │
│    │  LEFT JOIN games ON eo.game_id = games.id                │
│    │  WHERE eo.is_active = true                                │
│    │  ORDER BY eo.created_at DESC                              │
│    │                                                             │
│    ├─ Enrich each offer:                                       │
│    │  {                                                         │
│    │    id, name, description, price,                          │
│    │    seller: { id, username, avatar_url },                  │
│    │    game: { id, name } (or null)                           │
│    │  }                                                         │
│    │                                                             │
│    └─ Return:                                                  │
│       {                                                         │
│         offers: [...],                                         │
│         total: count                                           │
│       }                                                         │
│                                                                  │
│ 3. React Component                                             │
│    ├─ Receive offers array                                     │
│    ├─ Set state: offers, filteredOffers                        │
│    ├─ Extract unique sellers for filter dropdown               │
│    ├─ Render offer cards in grid                               │
│    └─ Setup event listeners for search/filter                 │
│                                                                  │
│ 4. User Interaction                                           │
│    ├─ Type in search box                                       │
│    │  └─ Filter on client-side:                                │
│    │     matches name OR description OR seller username        │
│    ├─ OR select seller from dropdown                           │
│    │  └─ Filter offers by seller_id                            │
│    ├─ Combined: Both search AND seller filter apply            │
│    └─ Click "Order Now" on offer                               │
│       └─ Navigate to /orders/create?exclusiveOfferId=X         │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
/dashboard/marketplace
├── <Header>
│   ├── <h1>Game Services Marketplace</h1>
│   └── <p>Browse games, discover services...</p>
├── <NavigationCards>
│   ├── <Card>Browse Games
│   │   └── <Button onClick={() => navigate('/games')}>
│   └── <Card>Exclusive Packs
│       └── <Button onClick={() => navigate('/exclusive-offers')}>
├── <FeaturesSection>
│   ├── <FeatureCard>Verified Sellers</FeatureCard>
│   ├── <FeatureCard>Points Payment</FeatureCard>
│   └── <FeatureCard>Real-time Tracking</FeatureCard>
└── <HowItWorksSection>
    ├── <Step>1. Browse & Select</Step>
    ├── <Step>2. Select an Offer</Step>
    ├── <Step>3. Create Order</Step>
    └── <Step>4. Track Progress</Step>

/dashboard/marketplace/games
├── <Header>
│   ├── <h1>Game Services</h1>
│   └── <SearchBar />
├── <GameGrid>
│   ├── <GameCard>
│   │   ├── <Image src={game.image_url} />
│   │   ├── <h2>{game.name}</h2>
│   │   ├── <p>{game.description}</p>
│   │   └── <Button>View Offers</Button>
│   └── ... (repeat for each game)
└── <InfoSection>
    └── <HowItWorks />

/dashboard/marketplace/offers/game/[gameId]
├── <BackButton />
├── <Header>
│   └── <h1>{game.name} Services</h1>
├── <MainContent>
│   └── <OfferList>
│       ├── <OfferCard isSelected={selectedOfferId === offer.id}>
│       │   ├── <Checkbox />
│       │   ├── <h3>{offer.name}</h3>
│       │   ├── <Description>{offer.description}</Description>
│       │   ├── <Quantity>15 items</Quantity>
│       │   └── <Price>500 points</Price>
│       └── ... (repeat for each offer)
└── <OrderSummary>
    ├── <SelectedOffer>
    │   ├── <Name>{selectedOffer.name}</Name>
    │   ├── <Quantity>15 items</Quantity>
    │   └── <Price>500 points</Price>
    └── <ProceedButton onClick={() => navigate('/orders/create')} />

/dashboard/marketplace/exclusive-offers
├── <Header>
│   ├── <h1>Exclusive Seller Packs</h1>
│   └── <SearchBar />
├── <FilterBar>
│   └── <SellerFilter onChange={setSelectedSeller} />
├── <OfferGrid>
│   ├── <ExclusiveOfferCard>
│   │   ├── <Badge>Game Tag</Badge>
│   │   ├── <Badge>Exclusive</Badge>
│   │   ├── <h3>{offer.name}</h3>
│   │   ├── <Description>{offer.description}</Description>
│   │   ├── <SellerInfo>
│   │   │   ├── <Avatar src={seller.avatar_url} />
│   │   │   └── <Username>{seller.username}</Username>
│   │   ├── <Price>{offer.price} points</Price>
│   │   └── <ActionButtons>
│   │       ├── <Button>Details</Button>
│   │       └── <Button>Order Now</Button>
│   └── ... (repeat for each offer)
└── <InfoSection>
    ├── <About>What Makes Them Special?</About>
    └── <HowToOrder />
```

## State Management Flow

```
Gaming Browsing Page:
┌──────────────────┐
│ useState(games)  │
│ useState(filtered)
│ useState(search) │
└────────┬─────────┘
         ↓
    useEffect fetch
         ↓
    .setGames()
         ↓
    .setFiltered()
    (all games initially)
         ↓
    User types in search
         ↓
    onChange event
         ↓
    .setSearch()
         ↓
    useEffect watches
    search dependency
         ↓
    Filter games array
         ↓
    .setFiltered()
         ↓
    Re-render with filtered games

Offers Selection Page:
┌──────────────────────┐
│ useState(offers)      │
│ useState(selectedId) │
│ useState(game)       │
└────────┬──────────────┘
         ↓
    useEffect fetch
         ↓
    .setOffers()
    .setGame()
         ↓
    User clicks offer
         ↓
    onClick event
         ↓
    .setSelectedId()
         ↓
    Conditional render
    updates summary panel
         ↓
    User clicks "Proceed"
         ↓
    Navigate with
    offerId + gameId params

Exclusive Offers Page:
┌──────────────────────┐
│ useState(offers)      │
│ useState(filtered)   │
│ useState(search)     │
│ useState(seller)     │
└────────┬──────────────┘
         ↓
    useEffect fetch
         ↓
    .setOffers()
    .setFiltered()
         ↓
    Extract sellers
    for dropdown
         ↓
    User interacts:
    ├─ Types search
    │  └─ .setSearch()
    ├─ Selects seller
    │  └─ .setSeller()
    └─ Both trigger
       useEffect
         ↓
    Filter offers:
    (search AND seller)
         ↓
    .setFiltered()
         ↓
    Re-render grid
```

## API Response Examples

```javascript
// GET /api/games
{
  "games": [
    {
      "id": "uuid-1",
      "name": "Clash of Clans",
      "description": "Strategy war game",
      "image_url": "https://...",
      "slug": "clash-of-clans"
    }
  ]
}

// GET /api/games/uuid-1/offers
{
  "game": {
    "id": "uuid-1",
    "name": "Clash of Clans"
  },
  "offers": [
    {
      "id": "uuid-o1",
      "product_id": "uuid-p1",
      "name": "Farm Package",
      "description": "Starter farm resources",
      "quantity": 100,
      "unit": "M",
      "points_price": 500
    }
  ]
}

// GET /api/exclusive-offers
{
  "offers": [
    {
      "id": "uuid-e1",
      "name": "War Pack",
      "description": "200M wood + 150M food",
      "price": 800,
      "seller": {
        "id": "uuid-s1",
        "username": "pro_seller",
        "avatar_url": "https://..."
      },
      "game": {
        "id": "uuid-1",
        "name": "Clash of Clans"
      }
    }
  ],
  "total": 1
}

// POST /api/exclusive-offers (Response 201)
{
  "id": "uuid-e2",
  "name": "New Pack",
  "description": "...",
  "price": 1000,
  "seller_id": "uuid-s1",
  "game_id": "uuid-1",
  "is_active": true,
  "created_at": "2024-01-01T00:00:00Z"
}
```

## Error Handling Flow

```
API Request
    ↓
Try/Catch Wrapper
    ├─ Network Error
    │  └─ Return 500
    ├─ Validation Error
    │  ├─ Missing fields → 400
    │  ├─ Invalid price → 400
    │  └─ Invalid auth → 401
    ├─ Authorization Error
    │  ├─ No Bearer token → 401
    │  ├─ Invalid token → 401
    │  ├─ Not a seller → 403
    │  └─ Not offer owner → 403
    ├─ Database Error
    │  ├─ Not found → 404
    │  └─ Query failed → 500
    └─ Success
       └─ Return 200/201 with data

Frontend Response Handling
    ↓
if (response.ok)
    └─ Parse JSON
       └─ Update state
       └─ Render result
else (error)
    ├─ if (status === 400)
    │  └─ Show validation message
    ├─ if (status === 401)
    │  └─ Redirect to login
    ├─ if (status === 403)
    │  └─ Show permission denied
    ├─ if (status === 404)
    │  └─ Show not found message
    └─ if (status === 500)
       └─ Show server error message
```

## Performance Optimization Strategy

```
Database Level:
├─ Indices on frequently queried columns
├─ Soft deletes with is_active filter
├─ View-level filtering (WHERE clauses)
└─ Composite indices for multi-column queries

API Level:
├─ Efficient SELECT statements
├─ JOIN optimization
├─ Response data trimming
└─ Error handling without heavy logging

Client Level:
├─ Client-side search/filtering
├─ Lazy image loading
├─ Memoized components
├─ Debounced search input
└─ Conditional rendering
```

This architecture document provides a complete visual understanding of how all components interact to create the Game Services Marketplace system.
