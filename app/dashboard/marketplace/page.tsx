'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, ShoppingCart, GamepadIcon } from 'lucide-react';

type OfferItem = {
  id: string;
  product_name: string;
  product_description: string | null;
  game_name: string;
  quantity: number;
  unit: string;
  points_price: number;
};

export default function ProductsPage() {
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadOffers() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/products');
        if (!response.ok) {
          throw new Error('Unable to load marketplace offers');
        }
        const data = await response.json();
        setOffers(data.offers ?? []);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to fetch products');
      } finally {
        setLoading(false);
      }
    }

    loadOffers();
  }, []);

  const games = useMemo(() => {
    const names = Array.from(new Set(offers.map((offer) => offer.game_name)));
    return names.sort();
  }, [offers]);

  const filteredOffers = offers.filter((offer) => {
    const matchesGame = !selectedGame || offer.game_name === selectedGame;
    const matchesSearch =
      offer.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (offer.product_description ?? '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGame && matchesSearch;
  });

  return (
    <div className="flex-1 p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Game Services Marketplace</h1>
        <p className="text-slate-600">Browse available services and submit orders directly from the platform.</p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-8">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-5 w-5" />
            <Input
              placeholder="Search services..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="mb-8">
        <Tabs value={selectedGame || 'all'} onValueChange={(v) => setSelectedGame(v === 'all' ? null : v)}>
          <TabsList className="flex flex-wrap gap-2 w-full">
            <TabsTrigger value="all">All Games</TabsTrigger>
            {games.map((game) => (
              <TabsTrigger key={game} value={game}>
                {game}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500">Loading marketplace offers...</div>
      ) : filteredOffers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredOffers.map((offer) => (
            <Card key={offer.id} className="hover:shadow-lg transition-shadow flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="inline-block px-2 py-1 mb-2 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                      {offer.game_name}
                    </div>
                    <CardTitle className="text-lg">{offer.product_name}</CardTitle>
                    <CardDescription>{offer.product_description ?? 'No additional details provided.'}</CardDescription>
                  </div>
                  <GamepadIcon className="h-5 w-5 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="space-y-4 mb-6 flex-1">
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded">
                    <span className="text-sm text-slate-600">Quantity</span>
                    <span className="font-semibold">{offer.quantity} {offer.unit}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-blue-50 rounded">
                    <span className="text-sm text-slate-600">Points Cost</span>
                    <span className="text-2xl font-bold text-blue-600">{offer.points_price}</span>
                  </div>
                </div>

                <Button className="w-full gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  View Offer
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="col-span-full">
          <Card className="text-center py-8">
            <p className="text-slate-600">No offers found matching your current filters.</p>
          </Card>
        </div>
      )}

      <Card className="mt-12">
        <CardHeader>
          <CardTitle>How to Order</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 list-decimal list-inside text-slate-700">
            <li>Review available offers from verified sellers.</li>
            <li>Select an offer that matches your game and required service.</li>
            <li>Confirm your points balance before ordering.</li>
            <li>Assign the order to one of your game accounts.</li>
            <li>Submit the order and wait for a seller to pick it.</li>
            <li>Track progress until the task is complete.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
