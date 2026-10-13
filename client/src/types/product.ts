// AXDORO Product & Storefront Types (Real Catalogue & In-Memory Storefront)

export type ProductCategory = 't-shirts' | 'shirts';

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
