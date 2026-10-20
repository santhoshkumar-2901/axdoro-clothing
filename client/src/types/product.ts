// AXDORO Product & Storefront Types (Real Catalogue & In-Memory Storefront)

export type ProductCategory = 't-shirts' | 'shirts' | (string & {});

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  displayOrder: number;
}

export interface ProductVariant {
  id: string;
  size: string;
  color: string;
  colorHex?: string;
  sku: string;
  pricePaise: number;
  originalPricePaise?: number;
  price: number;
  originalPrice?: number;
  stock: number;
  isActive: boolean;
}

export interface ProductImageDetail {
  id: string;
  url: string;
  altText?: string;
  displayOrder: number;
  isPrimary: boolean;
  color?: string | null;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: {
    slug: string;
    name: string;
  };
  categoryLabel?: string; // computed or category.name
  description: string;
  fabricSpec?: string; // e.g. '140 GSM' for applicable T-shirts
  pricePaise: number; // integer paise
  originalPricePaise?: number; // integer paise
  price: number; // in INR rupees
  originalPrice?: number; // in INR rupees
  images: string[];
  sizes: string[];
  colors: {
    name: string;
    hex: string;
  }[];
  stockStatus: 'in-stock' | 'low-stock' | 'out-of-stock';
  stockCount: number;
  isFeatured: boolean;
  isNewArrival: boolean;
  createdAt: string;
  variants?: ProductVariant[];
  allImages?: ProductImageDetail[];
}

export interface CartItem {
  id: string; // unique item instance id: `${productId}-${variantId || size}-${color}`
  product: Product;
  variantId?: string;
  selectedSize: string;
  selectedColor: string;
  pricePaise: number; // Integer paise used for internal cart math
  quantity: number;
}

export type SortOption = 'featured' | 'newest' | 'price-asc' | 'price-desc' | 'discount-desc';

/**
 * Currency formatter: Converts integer paise to Indian Rupee (INR) representation
 * Example: 69900 paise -> ₹699
 */
export function formatPaiseToINR(paise: number): string {
  const rupees = Math.floor(paise / 100);
  return `₹${rupees.toLocaleString('en-IN')}`;
}

export interface HomepageCollection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  displayOrder: number;
  products: Product[];
}

export interface AdminHomepageCollectionProduct {
  id: string;
  slug: string;
  name: string;
  status: 'draft' | 'published' | 'archived';
  displayOrder: number;
  categoryName: string;
  categorySlug: string;
  minPricePaise: number;
  price: number;
  totalStock: number;
  imageUrl?: string;
}

export interface AdminHomepageCollection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isEnabled: boolean;
  displayOrder: number;
  products: AdminHomepageCollectionProduct[];
  createdAt: string;
  updatedAt: string;
}
