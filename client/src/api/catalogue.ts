import { Product, Category, HomepageCollection } from '../types/product.ts';

export interface ProductsFetchParams {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
  sort?: string;
}

export interface ProductsResponse {
  products: Product[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export async function fetchCategories(): Promise<Category[]> {
  const response = await fetch('/api/categories', {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Failed to fetch categories (HTTP ${response.status})`);
  }

  const json = await response.json();
  return json.data;
}

export async function fetchProducts(params: ProductsFetchParams = {}): Promise<ProductsResponse> {
  const urlParams = new URLSearchParams();
  if (params.page) urlParams.set('page', String(params.page));
  if (params.limit) urlParams.set('limit', String(params.limit));
  if (params.category && params.category !== 'all') urlParams.set('category', params.category);
  if (params.search && params.search.trim()) urlParams.set('search', params.search.trim());
  if (params.sort) {
    // Map discount-desc or unsupported sort to featured for backend
    const apiSort = params.sort === 'discount-desc' ? 'featured' : params.sort;
    urlParams.set('sort', apiSort);
  }

  const queryString = urlParams.toString();
  const url = queryString ? `/api/products?${queryString}` : '/api/products';

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Failed to load products (HTTP ${response.status})`);
  }

  const json = await response.json();
  const products: Product[] = json.data.map((p: Product) => ({
    ...p,
    categoryLabel: p.category?.name || 'AXDORO Collection',
  }));

  return {
    products,
    pagination: json.pagination,
  };
}

export async function fetchProductBySlug(slug: string): Promise<Product> {
  const response = await fetch(`/api/products/${encodeURIComponent(slug)}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Product not found');
    }
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Failed to fetch product (HTTP ${response.status})`);
  }

  const json = await response.json();
  const product: Product = json.data;
  return {
    ...product,
    categoryLabel: product.category?.name || 'AXDORO Collection',
  };
}

export async function fetchCategoryBySlug(slug: string): Promise<Category> {
  const response = await fetch(`/api/categories/${encodeURIComponent(slug)}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Category not found');
    }
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Failed to fetch category (HTTP ${response.status})`);
  }

  const json = await response.json();
  return json.data || json.category;
}

export async function fetchHomepageCollections(): Promise<HomepageCollection[]> {
  const response = await fetch('/api/collections', {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Failed to fetch collections (HTTP ${response.status})`);
  }

  const json = await response.json();
  const rawCollections: HomepageCollection[] = json.data || json.collections || [];

  return rawCollections.map((col) => ({
    ...col,
    products: (col.products || []).map((p: Product) => ({
      ...p,
      categoryLabel: p.category?.name || 'AXDORO Collection',
    })),
  }));
}

export async function fetchHomepageCollectionBySlug(
  slug: string
): Promise<HomepageCollection | null> {
  const response = await fetch(`/api/collections/${encodeURIComponent(slug)}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Failed to fetch collection '${slug}' (HTTP ${response.status})`);
  }

  const json = await response.json();
  const rawCol: HomepageCollection | undefined = json.data || json.collection;
  if (!rawCol) return null;

  return {
    ...rawCol,
    products: (rawCol.products || []).map((p: Product) => ({
      ...p,
      categoryLabel: p.category?.name || 'AXDORO Collection',
    })),
  };
}

export async function fetchHomepageHero(): Promise<{ imageUrl: string | null }> {
  try {
    const response = await fetch('/api/homepage/hero', {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return { imageUrl: null };
    }

    const json = await response.json();
    return {
      imageUrl: json.data?.imageUrl || null,
    };
  } catch {
    // Fail safely with default fallback
    return { imageUrl: null };
  }
}
