import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { ensureBucket, sanitizeStorageFileName } from '@/lib/storage';
import { z } from 'zod';

const createProductSchema = z.object({
  game_id: z.string().uuid(),
  name: z.string().min(1),
  points_price: z.coerce.number().int().positive(),
  description: z.string().optional(),
});

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024;

function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { status: 401 as const, error: 'Unauthorized: missing token' };
  }

  const auth = verifyToken(authHeader.substring(7));
  if (!auth) {
    return { status: 401 as const, error: 'Unauthorized: invalid token' };
  }

  if (auth.role !== 'admin') {
    return { status: 403 as const, error: 'Forbidden: admin role required' };
  }

  return { status: 200 as const, auth };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = getAuth(request);
    if (authResult.status !== 200) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const enrichedQuery = await supabase
      .from('products')
      .select(`
        id, name, description, is_active, created_at, image_url, points_price,
        game:game_id(id, name)
      `)
      .order('created_at', { ascending: false });

    let products: any[] = [];

    if (enrichedQuery.error) {
      const basicQuery = await supabase
        .from('products')
        .select(`
          id, name, description, is_active, created_at, image_url,
          game:game_id(id, name)
        `)
        .order('created_at', { ascending: false });

      if (basicQuery.error) {
        return NextResponse.json({ error: basicQuery.error.message }, { status: 500 });
      }

      products = (basicQuery.data ?? []).map((p: any) => ({
        id: p.id,
        game_id: p.game?.id ?? null,
        game_name: p.game?.name ?? '',
        name: p.name,
        description: p.description,
        image_url: p.image_url ?? null,
        points_price: null,
        is_active: p.is_active,
        created_at: p.created_at,
      }));
    } else {
      products = (enrichedQuery.data ?? []).map((p: any) => ({
        id: p.id,
        game_id: p.game?.id ?? null,
        game_name: p.game?.name ?? '',
        name: p.name,
        description: p.description,
        image_url: p.image_url ?? null,
        points_price: p.points_price ?? null,
        is_active: p.is_active,
        created_at: p.created_at,
      }));
    }

    return NextResponse.json({ success: true, products });
  } catch (error) {
    console.error('Get products error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = getAuth(request);
    if (authResult.status !== 200) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server misconfiguration', message: 'Image upload service is not configured' },
        { status: 500 }
      );
    }

    try {
      await ensureBucket(supabaseAdmin, 'products', '25MB');
    } catch (bucketError) {
      return NextResponse.json(
        { error: bucketError instanceof Error ? bucketError.message : 'Unable to prepare product storage bucket' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const imageFile = formData.get('image_file');
    const parsed = createProductSchema.parse({
      game_id: String(formData.get('game_id') || '').trim(),
      name: String(formData.get('name') || '').trim(),
      points_price: formData.get('points_price'),
      description: String(formData.get('description') || '').trim() || undefined,
    });
    const { game_id, name, points_price, description } = parsed;

    if (!(imageFile instanceof File)) {
      return NextResponse.json(
        { error: 'Validation error', details: [{ field: 'image_file', message: 'Image file is required' }] },
        { status: 400 }
      );
    }

    if (!ALLOWED_IMAGE_TYPES.has(imageFile.type)) {
      return NextResponse.json(
        { error: 'Validation error', details: [{ field: 'image_file', message: 'Only JPG, PNG, WEBP, or GIF images are allowed' }] },
        { status: 400 }
      );
    }

    if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'Validation error', details: [{ field: 'image_file', message: 'Image size must be 25MB or less' }] },
        { status: 400 }
      );
    }

    const { data: gameExists, error: gameError } = await supabase
      .from('games')
      .select('id')
      .eq('id', game_id)
      .maybeSingle();

    if (gameError) {
      return NextResponse.json({ error: gameError.message }, { status: 500 });
    }

    if (!gameExists) {
      return NextResponse.json({ error: 'Validation error', details: [{ field: 'game_id', message: 'Game not found' }] }, { status: 400 });
    }

    const adminClient = supabaseAdmin;
    const originalName = sanitizeStorageFileName(imageFile.name);
    const storagePath = `products/${Date.now()}-${originalName}`;
    const bytes = await imageFile.arrayBuffer();
    const fileBytes = Buffer.from(bytes);

    const uploadResult = await adminClient.storage
      .from('products')
      .upload(storagePath, fileBytes, {
        contentType: imageFile.type,
        upsert: false,
      });

    if (uploadResult.error) {
      return NextResponse.json(
        { error: uploadResult.error.message || 'Unable to upload product image' },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = adminClient.storage
      .from('products')
      .getPublicUrl(storagePath);

    const image_url = publicUrlData.publicUrl;

    const productInsert = await (supabase as any)
      .from('products')
      .insert({ game_id, name, points_price, description: description || null, image_url })
      .select('id, game_id, name, points_price, image_url, description, is_active, created_at')
      .single();

    if (productInsert.error || !productInsert.data) {
      await adminClient.storage.from('products').remove([storagePath]);
      return NextResponse.json({ error: productInsert.error?.message || 'Failed to create product' }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        product: productInsert.data,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.errors.map((item) => ({
        field: item.path.join('.') || 'body',
        message: item.message,
      }));
      return NextResponse.json({ error: 'Validation error', details }, { status: 400 });
    }
    console.error('Create product error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
