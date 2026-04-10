'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type Product = {
  id: string;
  game_id: string | null;
  game_name: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  points_price?: number | null;
  is_active: boolean;
  created_at: string;
};

type Game = {
  id: string;
  name: string;
};

type ApiValidationDetail = {
  field?: string;
  message?: string;
};

const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024;

const emptyForm = {
  game_id: '',
  name: '',
  points_price: '',
};

export default function AdminProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const isAdmin = user?.role === 'admin';

  function authHeaders(): Record<string, string> {
    const token = localStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function formatApiError(data: any, fallback: string): string {
    if (Array.isArray(data?.details) && data.details.length > 0) {
      return (data.details as ApiValidationDetail[])
        .map((d) => `${d.field ?? 'field'}: ${d.message ?? 'invalid value'}`)
        .join(' | ');
    }
    return data?.error || fallback;
  }

  async function loadProducts() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/products', { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(formatApiError(data, 'Failed to load products'));
      }
      setProducts(data.products ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }

  async function loadGames() {
    try {
      const res = await fetch('/api/games');
      const data = await res.json();
      setGames(data.games ?? []);
    } catch {
      toast.error('Failed to load games');
    }
  }

  useEffect(() => {
    if (!isAdmin) return;
    loadProducts();
    loadGames();
  }, [isAdmin]);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [imageFile]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();

    if (!form.game_id || !form.name || !form.points_price || !imageFile) {
      toast.error('Game, product name, price, and image are required');
      return;
    }

    if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error('Image size must be 25MB or less');
      return;
    }

    setCreating(true);
    try {
      const payload = new FormData();
      payload.append('game_id', form.game_id);
      payload.append('name', form.name);
      payload.append('points_price', String(Number(form.points_price)));
      payload.append('image_file', imageFile);

      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: authHeaders(),
        body: payload,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(formatApiError(data, 'Failed to create product'));
      }

      toast.success('Product added successfully');
      setForm(emptyForm);
      setImageFile(null);
      setPreviewUrl('');
      setShowCreate(false);
      await loadProducts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create product');
    } finally {
      setCreating(false);
    }
  }

  const totalProducts = useMemo(() => products.length, [products]);

  if (!isAdmin) {
    return <div className="p-6 text-center text-gray-500">Access restricted to admins only.</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black dark:text-white">Manage Products</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Create products with a default offer price for each game.</p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)} size="sm">
          <Plus size={16} className="mr-2" />
          New Product
        </Button>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div className="text-sm text-gray-600 dark:text-gray-300">Total products</div>
          <div className="text-lg font-semibold text-black dark:text-white">{totalProducts}</div>
        </CardContent>
      </Card>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add Product</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Game</label>
                <select
                  value={form.game_id}
                  onChange={(e) => setForm((f) => ({ ...f, game_id: e.target.value }))}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  required
                >
                  <option value="">Select a game...</option>
                  {games.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Product Name</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Ranked Boost"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Price (points)</label>
                <Input
                  type="number"
                  min={1}
                  value={form.points_price}
                  onChange={(e) => setForm((f) => ({ ...f, points_price: e.target.value }))}
                  placeholder="e.g. 500"
                  required
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Image File (max 25MB)</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {imageFile ? `${imageFile.name} (${(imageFile.size / (1024 * 1024)).toFixed(2)} MB)` : 'Accepted: JPG, PNG, WEBP, GIF'}
                </p>
              </div>

              {previewUrl ? (
                <div className="sm:col-span-2 lg:col-span-4 flex flex-col gap-2">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Preview</label>
                  <img
                    src={previewUrl}
                    alt="Product preview"
                    className="h-48 w-full rounded-md border border-gray-200 object-cover dark:border-gray-700"
                  />
                </div>
              ) : null}

              <div className="sm:col-span-2 lg:col-span-4 flex items-end gap-2">
                <Button type="submit" disabled={creating} size="sm">
                  {creating ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Plus size={14} className="mr-2" />}
                  Add Product
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowCreate(false);
                    setForm(emptyForm);
                    setImageFile(null);
                    setPreviewUrl('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : products.length === 0 ? (
            <div className="py-16 text-center text-gray-400">No products yet. Create one above.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left dark:border-gray-800 dark:bg-gray-900">
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Game</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Product</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Price</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Image</th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {products.map((product) => (
                    <tr key={product.id} className="bg-white transition-colors hover:bg-gray-50 dark:bg-gray-950 dark:hover:bg-gray-900">
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{product.game_name || '-'}</td>
                      <td className="px-4 py-3 font-medium text-black dark:text-white">{product.name}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {typeof product.points_price === 'number' ? `${product.points_price.toLocaleString()} pts` : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                        {product.image_url ? (
                          <a href={product.image_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                            <ImageIcon size={14} />
                            Open
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={product.is_active ? 'default' : 'secondary'}>{product.is_active ? 'Active' : 'Inactive'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
