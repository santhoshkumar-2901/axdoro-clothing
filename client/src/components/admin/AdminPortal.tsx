import React, { useState, useEffect, useCallback } from 'react';
import {
  AdminUser,
  AdminMetrics,
  AdminProduct,
  AdminAuditLog,
  AdminOrder,
  AdminEnquiry,
  adminLogin,
  adminLogout,
  adminGetMe,
  adminGetMetrics,
  adminGetProducts,
  adminArchiveProduct,
  adminUnarchiveProduct,
  adminDeleteProduct,
  adminAdjustStock,
  adminGetAuditLogs,
  adminGetOrders,
  adminUpdateOrderStatus,
  adminAcknowledgeOrder,
  adminGetBadgeCounts,
  adminGetEnquiries,
  adminDeleteEnquiry,
  adminDownloadArtwork,
  adminGetDriveSyncStatus,
  adminTriggerDriveSync,
} from '../../api/admin.ts';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Download,
  Paperclip,
  Cloud,
  Plus,
  Trash2,
  Loader2,
  X,
  MessageSquare,
} from 'lucide-react';
import { getOrderWhatsAppNotification } from '../../utils/whatsapp.ts';
import { useScrollLock } from '../../utils/scrollLock.ts';
import { AdminSidebar, AdminTab } from './AdminSidebar.tsx';
import { AdminHeader } from './AdminHeader.tsx';
import { AdminLoginView } from './AdminLoginView.tsx';
import { StockAdjustmentDialog } from './StockAdjustmentDialog.tsx';
import { ProductImageModal } from './ProductImageModal.tsx';
import { CategoryManagementView } from './CategoryManagementView.tsx';
import { CollectionManagementView } from './CollectionManagementView.tsx';
import { ProductCreateDialog } from './ProductCreateDialog.tsx';
import { ProductEditDialog } from './ProductEditDialog.tsx';
import { PaymentSettingsView } from './PaymentSettingsView.tsx';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../ui/card.tsx';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '../ui/table.tsx';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';

interface AdminPortalProps {
  onNavigateHome?: () => void;
  onCatalogueMutated?: () => void;
}

function getTabFromPath(pathname: string): AdminTab {
  const normalized = pathname.replace(/\/+$/, '');
  if (normalized.endsWith('/categories')) return 'categories';
  if (normalized.endsWith('/collections')) return 'collections';
  if (normalized.endsWith('/products')) return 'products';
  if (normalized.endsWith('/stock')) return 'stock';
  if (normalized.endsWith('/orders')) return 'orders';
  if (normalized.endsWith('/enquiries')) return 'enquiries';
  if (normalized.endsWith('/audit')) return 'audit';
  if (normalized.endsWith('/payments') || normalized.endsWith('/payment-settings')) return 'payments';
  return 'metrics';
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  onNavigateHome,
  onCatalogueMutated,
}) => {
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>(() => getTabFromPath(window.location.pathname));
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Login form state
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Administrative data states
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [enquiries, setEnquiries] = useState<AdminEnquiry[]>([]);
  const [driveSyncStatus, setDriveSyncStatus] = useState<{
    totalEnquiries: number;
    syncedCount: number;
    pendingCount: number;
    failedCount: number;
    isConfigured: boolean;
  } | null>(null);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [acknowledgingOrderId, setAcknowledgingOrderId] = useState<string | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Dynamic notification badge counts for sidebar
  const [badgeCounts, setBadgeCounts] = useState<{ orders: number; stock: number }>({
    orders: 0,
    stock: 0,
  });

  // Stock adjustment popup state
  const [adjustingVariant, setAdjustingVariant] = useState<{
    variantId: string;
    productName: string;
    size: string;
    color: string;
    sku: string;
    currentStock: number;
  } | null>(null);

  // Product action and modals states
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [selectedProductForEdit, setSelectedProductForEdit] = useState<AdminProduct | null>(null);
  const [productToDelete, setProductToDelete] = useState<AdminProduct | null>(null);

  // Global reference-counted scroll lock while product deletion dialog is open
  useScrollLock(Boolean(productToDelete));

  const [isDeletingProduct, setIsDeletingProduct] = useState(false);
  const [deleteProductError, setDeleteProductError] = useState<{
    message: string;
    canArchive?: boolean;
  } | null>(null);
  const [selectedProductForImages, setSelectedProductForImages] = useState<AdminProduct | null>(null);

  // Enquiry deletion states (Phase 3 Safe Permanent Deletion)
  const [enquiryToDelete, setEnquiryToDelete] = useState<AdminEnquiry | null>(null);
  useScrollLock(Boolean(enquiryToDelete));
  const [isDeletingEnquiry, setIsDeletingEnquiry] = useState(false);
  const [deleteEnquiryError, setDeleteEnquiryError] = useState<{
    message: string;
    isConflict?: boolean;
    isNotFound?: boolean;
  } | null>(null);
  const [downloadingArtworkId, setDownloadingArtworkId] = useState<string | null>(null);

  // Sync tab with browser URL history (popstate)
  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleSelectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    const targetUrl = tab === 'metrics' ? '/admin/metrics' : `/admin/${tab}`;
    if (window.location.pathname !== targetUrl) {
      window.history.pushState(null, '', targetUrl);
    }
  };

  // Fetch authoritative sidebar notification badge counts
  const fetchBadgeCounts = useCallback(async () => {
    try {
      const counts = await adminGetBadgeCounts();
      setBadgeCounts({
        orders: counts.orders.unacknowledgedCount,
        stock: counts.inventory.lowStockProductCount,
      });
    } catch {
      // Fail gracefully: retain previous valid counts if network or background poll fails
    }
  }, []);

  // Check existing session on mount
  useEffect(() => {
    let isMounted = true;
    adminGetMe()
      .then((user) => {
        if (isMounted) {
          setCurrentUser(user);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsCheckingAuth(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const loadTabData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      fetchBadgeCounts();
      if (activeTab === 'metrics' || activeTab === 'stock') {
        const m = await adminGetMetrics();
        setMetrics(m);
      }
      if (activeTab === 'products') {
        const p = await adminGetProducts();
        setProducts(p);
      }
      if (activeTab === 'audit') {
        const a = await adminGetAuditLogs();
        setAuditLogs(a);
      }
      if (activeTab === 'orders') {
        const o = await adminGetOrders();
        setOrders(o);
      }
      if (activeTab === 'enquiries') {
        const [enq, sync] = await Promise.all([
          adminGetEnquiries(),
          adminGetDriveSyncStatus().catch(() => null),
        ]);
        setEnquiries(enq);
        setDriveSyncStatus(sync);
      }
    } catch {
      // Handled silently or state resets
    } finally {
      setIsLoadingData(false);
    }
  }, [activeTab, fetchBadgeCounts]);

  useEffect(() => {
    if (currentUser) {
      loadTabData();
    }
  }, [currentUser, loadTabData]);

  // Periodic 30s polling and focus/visibility-based refresh for badge counts
  useEffect(() => {
    if (!currentUser) return;

    fetchBadgeCounts();

    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchBadgeCounts();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchBadgeCounts();
      }
    }, 30000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      clearInterval(interval);
    };
  }, [currentUser, fetchBadgeCounts]);

  const handleLogin = async (email: string, pass: string) => {
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const res = await adminLogin(email, pass);
      setCurrentUser(res.admin);
      // Ensure clean admin URL
      if (!window.location.pathname.startsWith('/admin')) {
        window.history.pushState(null, '', '/admin/metrics');
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Invalid administrator credentials');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await adminLogout();
    setCurrentUser(null);
    setMetrics(null);
    setProducts([]);
    setAuditLogs([]);
    setOrders([]);
    setEnquiries([]);
  };

  const handleArchive = async (productId: string) => {
    if (
      !window.confirm(
        'Are you sure you want to archive this product? It will no longer be visible in the public storefront.'
      )
    ) {
      return;
    }
    try {
      await adminArchiveProduct(productId);
      setActionSuccess('Product archived successfully.');
      setTimeout(() => setActionSuccess(null), 3000);
      loadTabData();
      onCatalogueMutated?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to archive');
    }
  };

  const handleUnarchive = async (productId: string) => {
    if (
      !window.confirm(
        'Are you sure you want to restore this product to the storefront?'
      )
    ) {
      return;
    }
    try {
      await adminUnarchiveProduct(productId);
      setActionSuccess('Product restored to storefront successfully.');
      setTimeout(() => setActionSuccess(null), 3000);
      loadTabData();
      onCatalogueMutated?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unarchive');
    }
  };

  const handleDeleteProductConfirm = async () => {
    if (!productToDelete || isDeletingProduct) return;
    setIsDeletingProduct(true);
    setDeleteProductError(null);
    try {
      await adminDeleteProduct(productToDelete.id);
      setActionSuccess(`Product "${productToDelete.name}" was permanently deleted.`);
      setTimeout(() => setActionSuccess(null), 3500);
      setProductToDelete(null);
      setDeleteProductError(null);
      loadTabData();
      onCatalogueMutated?.();
    } catch (err: any) {
      setDeleteProductError({
        message: err instanceof Error ? err.message : 'Failed to delete product',
        canArchive: err?.canArchive || err?.status === 409,
      });
    } finally {
      setIsDeletingProduct(false);
    }
  };

  const handleArchiveInstead = async () => {
    if (!productToDelete) return;
    const targetProduct = productToDelete;
    setProductToDelete(null);
    setDeleteProductError(null);
    try {
      await adminArchiveProduct(targetProduct.id);
      setActionSuccess(`Product "${targetProduct.name}" archived successfully.`);
      setTimeout(() => setActionSuccess(null), 3500);
      loadTabData();
      onCatalogueMutated?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to archive product');
    }
  };

  const handleDeleteEnquiryConfirm = async () => {
    if (!enquiryToDelete || isDeletingEnquiry) return;
    const targetEnquiry = enquiryToDelete;
    setIsDeletingEnquiry(true);
    setDeleteEnquiryError(null);

    try {
      await adminDeleteEnquiry(targetEnquiry.id);
      setActionSuccess(`Enquiry from "${targetEnquiry.name}" was permanently deleted.`);
      setTimeout(() => setActionSuccess(null), 3500);
      setEnquiries((prev) => prev.filter((e) => e.id !== targetEnquiry.id));
      setEnquiryToDelete(null);
      setDeleteEnquiryError(null);
      // Reconcile sync status count in background
      adminGetDriveSyncStatus().then(setDriveSyncStatus).catch(() => null);
    } catch (err: any) {
      const status = err?.status;
      if (status === 409) {
        setDeleteEnquiryError({
          message: 'This enquiry is currently being synchronized. Please try again shortly.',
          isConflict: true,
        });
      } else if (status === 404) {
        setDeleteEnquiryError({
          message: 'This enquiry was not found on the server. Reconciling enquiries list...',
          isNotFound: true,
        });
        try {
          const fresh = await adminGetEnquiries();
          setEnquiries(fresh);
        } catch {
          setEnquiries((prev) => prev.filter((e) => e.id !== targetEnquiry.id));
        }
      } else if (status === 401 || status === 403) {
        setDeleteEnquiryError({
          message: 'Administrative authorization or security token expired. Please refresh your session.',
        });
      } else {
        setDeleteEnquiryError({
          message: err instanceof Error ? err.message : 'An unexpected error occurred while deleting the enquiry.',
        });
      }
    } finally {
      setIsDeletingEnquiry(false);
    }
  };

  const handleDownloadArtwork = async (enquiry: AdminEnquiry) => {
    if (downloadingArtworkId) return;
    setDownloadingArtworkId(enquiry.id);
    setActionError(null);
    try {
      await adminDownloadArtwork(enquiry.id, enquiry.designFileName);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to download custom artwork';
      setActionError(msg);
    } finally {
      setDownloadingArtworkId(null);
    }
  };

  const handleSaveStock = async (quantity: number, reason: string) => {
    if (!adjustingVariant) return;
    try {
      await adminAdjustStock(adjustingVariant.variantId, quantity, reason);
      setAdjustingVariant(null);
      setActionSuccess('Inventory stock updated and audit log recorded.');
      setTimeout(() => setActionSuccess(null), 3500);
      loadTabData();
      fetchBadgeCounts();
      onCatalogueMutated?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update stock');
    }
  };

  const handleAcknowledgeOrder = async (orderId: string) => {
    setAcknowledgingOrderId(orderId);
    try {
      await adminAcknowledgeOrder(orderId);
      setActionSuccess('Order acknowledged successfully.');
      setTimeout(() => setActionSuccess(null), 3000);
      const o = await adminGetOrders();
      setOrders(o);
      fetchBadgeCounts();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to acknowledge order');
    } finally {
      setAcknowledgingOrderId(null);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    setUpdatingOrderId(orderId);
    try {
      await adminUpdateOrderStatus(orderId, newStatus);
      setActionSuccess(`Order updated to ${newStatus}. Inventory adjusted if applicable.`);
      setTimeout(() => setActionSuccess(null), 3500);
      const o = await adminGetOrders();
      setOrders(o);
      fetchBadgeCounts();
      onCatalogueMutated?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update order status');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleNotifyCustomerWhatsApp = (order: AdminOrder) => {
    const notification = getOrderWhatsAppNotification(order);
    if (notification.isEligible && notification.url) {
      window.open(notification.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleTriggerDriveSync = async () => {
    setIsSyncingDrive(true);
    try {
      const res = await adminTriggerDriveSync();
      setActionSuccess(`Drive sync processed: ${res.synced} synced, ${res.failed} failed.`);
      setTimeout(() => setActionSuccess(null), 3500);
      const [enq, sync] = await Promise.all([
        adminGetEnquiries(),
        adminGetDriveSyncStatus().catch(() => null),
      ]);
      setEnquiries(enq);
      setDriveSyncStatus(sync);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Drive sync failed');
    } finally {
      setIsSyncingDrive(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-axdoro-bg flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 animate-spin text-axdoro-accent mb-4" />
        <span className="text-xs font-mono text-axdoro-text-muted">Verifying administrator session...</span>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AdminLoginView
        onLogin={handleLogin}
        onNavigateHome={onNavigateHome}
        isLoading={isLoggingIn}
        error={loginError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-axdoro-bg text-axdoro-text flex">
      {/* Desktop / Mobile Navigation Sidebar */}
      <AdminSidebar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        currentUser={currentUser}
        onLogout={handleLogout}
        onNavigateHome={onNavigateHome}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
        badgeCounts={badgeCounts}
      />

      {/* Main Administrative Dashboard Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader
          activeTab={activeTab}
          currentUser={currentUser}
          onOpenMobileNav={() => setIsMobileOpen(true)}
          onLogout={handleLogout}
          onNavigateHome={onNavigateHome}
        />

        {/* Action feedback alert banner */}
        {actionSuccess && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3 text-xs text-emerald-900 flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span className="font-semibold">{actionSuccess}</span>
            </div>
            <button
              onClick={() => setActionSuccess(null)}
              className="text-emerald-700 hover:text-emerald-950 text-xs font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {actionError && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-3 text-xs text-red-900 flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span className="font-semibold">{actionError}</span>
            </div>
            <button
              onClick={() => setActionError(null)}
              className="text-red-700 hover:text-red-950 text-xs font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Tab content scrollable container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-7xl w-full mx-auto space-y-6">
          {isLoadingData ? (
            <div className="py-24 text-center text-axdoro-text-muted text-xs flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-7 h-7 animate-spin text-axdoro-accent" />
              <span className="font-mono">Loading administrative records from PostgreSQL...</span>
            </div>
          ) : activeTab === 'metrics' && metrics ? (
            /* 1. Metrics Tab */
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-axdoro-border bg-axdoro-surface shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="font-mono uppercase text-[10px] text-axdoro-text-muted">
                      Published Products
                    </CardDescription>
                    <CardTitle className="text-3xl font-black text-axdoro-charcoal tracking-tight">
                      {metrics.products.published}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <span className="text-[11px] text-axdoro-text-muted">
                      Total in catalog: <strong className="text-axdoro-charcoal">{metrics.products.total}</strong>
                    </span>
                  </CardContent>
                </Card>

                <Card className="border-axdoro-border bg-axdoro-surface shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="font-mono uppercase text-[10px] text-axdoro-text-muted">
                      Active Categories
                    </CardDescription>
                    <CardTitle className="text-3xl font-black text-axdoro-charcoal tracking-tight">
                      {metrics.categories.active}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <span className="text-[11px] text-axdoro-text-muted">
                      Confirmed: <span className="text-axdoro-accent font-semibold">T-Shirts, Shirts</span>
                    </span>
                  </CardContent>
                </Card>

                <Card className="border-axdoro-border bg-axdoro-surface shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="font-mono uppercase text-[10px] text-axdoro-text-muted">
                      Total Stock Units
                    </CardDescription>
                    <CardTitle className="text-3xl font-black text-axdoro-charcoal tracking-tight">
                      {metrics.variants.totalStockUnits}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <span className="text-[11px] text-axdoro-text-muted">
                      Across <strong className="text-axdoro-charcoal">{metrics.variants.total}</strong> active variants
                    </span>
                  </CardContent>
                </Card>

                <Card className={`border bg-axdoro-surface shadow-sm ${metrics.inventoryAlerts.lowStockCount > 0 ? 'border-amber-500/40' : 'border-axdoro-border'}`}>
                  <CardHeader className="pb-2">
                    <CardDescription className="font-mono uppercase text-[10px] text-axdoro-text-muted">
                      Low Stock Alerts
                    </CardDescription>
                    <CardTitle className={`text-3xl font-black tracking-tight ${metrics.inventoryAlerts.lowStockCount > 0 ? 'text-amber-400' : 'text-axdoro-charcoal'}`}>
                      {metrics.inventoryAlerts.lowStockCount}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <span className="text-[11px] text-axdoro-text-muted">
                      Threshold: &lt; 10 units in stock
                    </span>
                  </CardContent>
                </Card>
              </div>

              {/* Critical Low Stock Warning Panel */}
              {metrics.inventoryAlerts.criticalVariants.length > 0 && (
                <Card className="border border-amber-500/30 bg-axdoro-surface shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <CardTitle className="text-sm font-bold text-axdoro-charcoal">
                        Critical Low Stock Items ({metrics.inventoryAlerts.lowStockCount})
                      </CardTitle>
                    </div>
                    <CardDescription className="text-axdoro-text-muted text-xs">
                      Variants requiring physical warehouse review and inventory replenishment.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="divide-y divide-axdoro-border">
                      {metrics.inventoryAlerts.criticalVariants.map((crit) => (
                        <div
                          key={crit.variantId}
                          className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div>
                            <span className="font-bold text-axdoro-charcoal text-xs">{crit.productName}</span>
                            <span className="text-axdoro-text-muted text-xs ml-2 font-mono">
                              Size: {crit.size} &bull; Color: {crit.color} &bull; SKU: {crit.sku}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="warning">
                              {crit.stockQuantity} units left
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setAdjustingVariant({
                                  variantId: crit.variantId,
                                  productName: crit.productName,
                                  size: crit.size,
                                  color: crit.color,
                                  sku: crit.sku,
                                  currentStock: crit.stockQuantity,
                                })
                              }
                            >
                              Adjust Stock
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

            </div>
          ) : activeTab === 'products' ? (
            /* 2. Products Tab */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-axdoro-charcoal">Storefront Product Catalogue</h2>
                  <p className="text-xs text-axdoro-text-muted">Manage published products and visibility states ({products.length} registered)</p>
                </div>
                <Button
                  onClick={() => setIsAddProductOpen(true)}
                  className="bg-axdoro-charcoal text-white hover:bg-black font-semibold text-xs flex items-center gap-1.5 shadow-sm"
                  title="Add new product to catalogue"
                >
                  <Plus className="w-4 h-4" />
                  Add Product
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Variants</TableHead>
                    <TableHead>Min Price</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead>Stock Units</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => {
                    const hasDiscount = Boolean(
                      p.minComparisonPricePaise && p.minComparisonPricePaise > p.minPricePaise
                    );
                    const discountPercent = hasDiscount && p.minComparisonPricePaise
                      ? Math.round(((p.minComparisonPricePaise - p.minPricePaise) / p.minComparisonPricePaise) * 100)
                      : 0;

                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-bold text-axdoro-charcoal">{p.name}</TableCell>
                        <TableCell className="text-axdoro-text-muted">{p.categoryName}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              p.status === 'published'
                                ? 'success'
                                : p.status === 'draft'
                                ? 'secondary'
                                : 'destructive'
                            }
                          >
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">{p.variantCount}</TableCell>
                        <TableCell className="font-bold font-mono text-axdoro-charcoal">
                          &#8377;{Math.round(p.minPricePaise / 100)}
                        </TableCell>
                        <TableCell>
                          {hasDiscount ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="success" className="font-mono text-[10px]">
                                {discountPercent}% OFF
                              </Badge>
                              <span className="text-xs text-axdoro-text-muted line-through font-mono">
                                &#8377;{Math.round(p.minComparisonPricePaise! / 100)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-axdoro-text-muted font-normal">No discount</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono">{p.totalStock}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedProductForEdit(p)}
                            title={`Edit ${p.name}`}
                            className="text-axdoro-charcoal hover:bg-axdoro-surface-muted"
                          >
                            Edit
                          </Button>
                          {p.status !== 'archived' ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleArchive(p.id)}
                              title="Archive product from storefront"
                            >
                              Archive
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUnarchive(p.id)}
                              title="Restore product to storefront"
                              className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-300 font-semibold"
                            >
                              Unarchive
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setDeleteProductError(null);
                              setProductToDelete(p);
                            }}
                            title={`Delete ${p.name}`}
                            className="text-red-700 hover:text-red-800 hover:bg-red-50 border-red-200"
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : activeTab === 'categories' ? (
            /* 2.5. Category Management Tab */
            <CategoryManagementView
              onCategoryMutated={() => {
                loadTabData();
                onCatalogueMutated?.();
              }}
            />
          ) : activeTab === 'collections' ? (
            /* 2.6. Homepage Collections Tab */
            <CollectionManagementView
              onCollectionMutated={() => {
                loadTabData();
                onCatalogueMutated?.();
              }}
            />
          ) : activeTab === 'stock' ? (
            /* 3. Stock Adjustment Tab */
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-axdoro-charcoal">Variant Stock Inventory Overview</h2>
                <p className="text-xs text-axdoro-text-muted">
                  Select a variant to execute an atomic inventory adjustment. Every adjustment records actor and rationale in the audit log.
                </p>
              </div>

              {metrics && metrics.inventoryAlerts.criticalVariants.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {metrics.inventoryAlerts.criticalVariants.map((item) => (
                    <Card key={item.variantId} className="border-axdoro-border bg-axdoro-surface shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-sm font-bold text-axdoro-charcoal">{item.productName}</CardTitle>
                            <CardDescription className="font-mono text-[11px] text-axdoro-text-muted mt-1">
                              Size: {item.size} &bull; Color: {item.color} &bull; SKU: {item.sku}
                            </CardDescription>
                          </div>
                          {item.stockQuantity === 0 ? (
                            <Badge variant="destructive" className="bg-red-600 text-white font-bold">
                              Out of Stock
                            </Badge>
                          ) : (
                            <Badge variant="warning">{item.stockQuantity} in stock</Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardFooter className="pt-2 flex justify-end">
                        <Button
                          size="sm"
                          onClick={() =>
                            setAdjustingVariant({
                              variantId: item.variantId,
                              productName: item.productName,
                              size: item.size,
                              color: item.color,
                              sku: item.sku,
                              currentStock: item.stockQuantity,
                            })
                          }
                        >
                          Adjust Units
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="border-axdoro-border bg-axdoro-surface">
                  <CardContent className="py-8 text-center text-xs text-axdoro-text-muted">
                    No critical low stock alerts active. All variant stock counts are above the minimum threshold.
                  </CardContent>
                </Card>
              )}
            </div>
          ) : activeTab === 'orders' ? (
            /* 4. Orders Tab */
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-axdoro-charcoal">Customer Orders ({orders.length})</h2>
                <p className="text-xs text-axdoro-text-muted">Cash on Delivery checkout &amp; order fulfillment lifecycle</p>
              </div>

              {orders.length === 0 ? (
                <Card className="border-axdoro-border bg-axdoro-surface">
                  <CardContent className="py-12 text-center text-axdoro-text-muted text-xs">
                    No customer orders have been placed yet.
                  </CardContent>
                </Card>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Fulfillment Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono font-bold text-axdoro-charcoal">
                          <div className="flex items-center gap-2">
                            <span>{order.orderNumber}</span>
                            {!order.acknowledgedAt &&
                              order.orderStatus !== 'CANCELLED' &&
                              order.orderStatus !== 'DELIVERED' && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white shadow-xs"
                                  title="Unacknowledged new order"
                                  data-testid={`new-badge-${order.id}`}
                                >
                                  NEW
                                </span>
                              )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-axdoro-charcoal">{order.customerName}</div>
                          <div className="text-[11px] text-axdoro-text-muted font-mono">
                            {order.customerPhone} &bull; {order.customerEmail}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono font-bold text-axdoro-accent">
                          ₹{(order.totalPaise / 100).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={order.paymentStatus === 'PAID' ? 'success' : 'warning'}
                          >
                            {order.paymentMethod} &bull; {order.paymentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const notification = getOrderWhatsAppNotification(order);
                            const isUnacknowledged =
                              !order.acknowledgedAt &&
                              order.orderStatus !== 'CANCELLED' &&
                              order.orderStatus !== 'DELIVERED';

                            return (
                              <div className="flex items-center gap-2">
                                <select
                                  disabled={updatingOrderId === order.id}
                                  value={order.orderStatus}
                                  onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value)}
                                  className="bg-axdoro-surface border border-axdoro-border text-axdoro-charcoal text-xs rounded-lg px-2.5 py-1 font-semibold focus:outline-none focus:ring-1 focus:ring-axdoro-accent disabled:opacity-50 cursor-pointer shadow-sm"
                                >
                                  <option value="PENDING">PENDING</option>
                                  <option value="CONFIRMED">CONFIRMED</option>
                                  <option value="PROCESSING">PROCESSING</option>
                                  <option value="SHIPPED">SHIPPED</option>
                                  <option value="DELIVERED">DELIVERED</option>
                                  <option value="CANCELLED">CANCELLED</option>
                                </select>

                                {isUnacknowledged && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={acknowledgingOrderId === order.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAcknowledgeOrder(order.id);
                                    }}
                                    className="text-xs h-7 px-2 border-red-500/30 text-red-600 hover:bg-red-50 cursor-pointer shrink-0 font-semibold"
                                    title="Mark order as acknowledged"
                                    data-testid={`acknowledge-btn-${order.id}`}
                                  >
                                    {acknowledgingOrderId === order.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      'Acknowledge'
                                    )}
                                  </Button>
                                )}

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNotifyCustomerWhatsApp(order);
                                  }}
                                  disabled={!notification.isEligible}
                                  title={notification.tooltip}
                                  aria-label={`Notify ${order.customerName} on WhatsApp for order ${order.orderNumber}`}
                                  className={`p-1.5 rounded-lg border transition-all inline-flex items-center justify-center ${
                                    notification.isEligible
                                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/60 cursor-pointer shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'
                                      : 'border-axdoro-border/40 bg-axdoro-surface-muted/30 text-axdoro-text-muted/40 cursor-not-allowed opacity-40'
                                  }`}
                                >
                                  <MessageSquare className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-[11px] font-mono text-axdoro-text-muted">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : activeTab === 'enquiries' ? (
            /* 5. Enquiries Tab */
            <div className="space-y-4">
              {/* Sync Status Banner & Action Buttons */}
              <Card className="border-axdoro-border bg-axdoro-surface shadow-sm">
                <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700 flex-shrink-0">
                      <Cloud className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold text-axdoro-charcoal">Google Drive / Sheets Synchronization</CardTitle>
                      <CardDescription className="text-xs text-axdoro-text-muted mt-0.5">
                        {driveSyncStatus?.isConfigured
                          ? `Status: Configured • Synced: ${driveSyncStatus.syncedCount} • Pending: ${driveSyncStatus.pendingCount} • Failed: ${driveSyncStatus.failedCount}`
                          : 'Sync outbox queue active. Pending records will sync when credentials are provisioned.'}
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTriggerDriveSync}
                      disabled={isSyncingDrive}
                      className="gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingDrive ? 'animate-spin' : ''}`} />
                      <span>{isSyncingDrive ? 'Syncing...' : 'Run Sync'}</span>
                    </Button>
                    <a
                      href="/api/admin/enquiries/export.csv"
                      download
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-axdoro-charcoal text-white text-xs font-semibold hover:bg-black transition-colors shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export CSV</span>
                    </a>
                  </div>
                </CardHeader>
              </Card>

              {enquiries.length === 0 ? (
                <Card className="border-axdoro-border bg-axdoro-surface">
                  <CardContent className="py-12 text-center text-axdoro-text-muted text-xs">
                    No customer enquiries found in database.
                  </CardContent>
                </Card>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Drive Sync</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">ACTIONS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enquiries.map((enq) => (
                      <TableRow key={enq.id}>
                        <TableCell>
                          <div className="font-semibold text-axdoro-charcoal">{enq.name}</div>
                          <div className="text-[11px] text-axdoro-text-muted font-mono">
                            {enq.email} {enq.phone ? `• ${enq.phone}` : ''}
                          </div>
                          {enq.productName && (
                            <div className="text-[10px] text-axdoro-text-muted">Product: {enq.productName}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <Badge variant="secondary">{enq.enquiryType}</Badge>
                            {enq.hasArtwork && (
                              <span
                                data-testid={`artwork-indicator-${enq.id}`}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-axdoro-accent bg-axdoro-accent/10 border border-axdoro-accent/20 px-1.5 py-0.5 rounded"
                                title={enq.designFileName ? `Artwork: ${enq.designFileName}` : 'Custom artwork attached'}
                              >
                                <Paperclip className="w-2.5 h-2.5 flex-shrink-0" />
                                <span>Artwork</span>
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="line-clamp-2 text-axdoro-text text-xs">{enq.message}</div>
                          {enq.quantity && (
                            <div className="text-[10px] text-axdoro-accent font-semibold mt-0.5 font-mono">
                              Est. Qty: {enq.quantity}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              enq.driveSyncStatus === 'SYNCED'
                                ? 'success'
                                : enq.driveSyncStatus === 'FAILED'
                                ? 'destructive'
                                : 'warning'
                            }
                          >
                            {enq.driveSyncStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[11px] font-mono text-axdoro-text-muted">
                          {new Date(enq.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {enq.hasArtwork && (
                              <Button
                                variant="outline"
                                size="sm"
                                data-testid={`download-artwork-${enq.id}`}
                                onClick={() => handleDownloadArtwork(enq)}
                                disabled={downloadingArtworkId === enq.id}
                                title={enq.designFileName ? `Download ${enq.designFileName}` : 'Download custom artwork'}
                                className="text-axdoro-accent hover:text-axdoro-accent-muted border-axdoro-border text-xs cursor-pointer"
                              >
                                {downloadingArtworkId === enq.id ? (
                                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                ) : (
                                  <Download className="w-3.5 h-3.5 mr-1" />
                                )}
                                Artwork
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setDeleteEnquiryError(null);
                                setEnquiryToDelete(enq);
                              }}
                              title={`Delete enquiry from ${enq.name}`}
                              className="text-red-700 hover:text-red-800 hover:bg-red-50 border-red-200"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1 text-red-600" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : activeTab === 'payments' ? (
            /* 7. Payment Settings Tab */
            <PaymentSettingsView />
          ) : (
            /* 6. Audit Logs Tab */
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-axdoro-charcoal">Security &amp; Mutation Audit Trail ({auditLogs.length})</h2>
                <p className="text-xs text-axdoro-text-muted">Tamper-evident logs of administrative actions and inventory changes</p>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">Timestamp</TableHead>
                    <TableHead className="w-[45%]">Actor</TableHead>
                    <TableHead className="w-[25%]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="w-[30%] text-[11px] font-mono text-axdoro-text-muted whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleTimeString()} {new Date(log.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="w-[45%] max-w-0">
                        <span
                          className="block truncate font-semibold text-axdoro-charcoal"
                          title={log.adminEmail}
                        >
                          {log.adminEmail}
                        </span>
                      </TableCell>
                      <TableCell className="w-[25%]">
                        <Badge variant="secondary" className="inline-flex">
                          {log.action}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </main>
      </div>

      {/* Stock Adjustment Popup */}
      {adjustingVariant && (
        <StockAdjustmentDialog
          variantId={adjustingVariant.variantId}
          productName={adjustingVariant.productName}
          size={adjustingVariant.size}
          color={adjustingVariant.color}
          sku={adjustingVariant.sku}
          currentStock={adjustingVariant.currentStock}
          onSave={handleSaveStock}
          onClose={() => setAdjustingVariant(null)}
        />
      )}

      {/* Product Creation Dialog (Phase 2) */}
      <ProductCreateDialog
        isOpen={isAddProductOpen}
        onClose={() => setIsAddProductOpen(false)}
        onSuccess={() => {
          setActionSuccess('Product created successfully and published to catalogue.');
          setTimeout(() => setActionSuccess(null), 3500);
          loadTabData();
          onCatalogueMutated?.();
        }}
      />

      {/* Product Edit Dialog (Phase 3) */}
      <ProductEditDialog
        productId={selectedProductForEdit?.id || null}
        isOpen={Boolean(selectedProductForEdit)}
        onClose={() => setSelectedProductForEdit(null)}
        onSuccess={() => {
          setActionSuccess('Product and variants updated successfully.');
          setTimeout(() => setActionSuccess(null), 3500);
          loadTabData();
          onCatalogueMutated?.();
        }}
      />

      {/* Product Deletion Dialog (Phase 4 Safe Permanent Deletion) */}
      {productToDelete && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overscroll-contain animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-product-dialog-title"
        >
          <div className="bg-axdoro-surface border border-red-200/80 rounded-2xl shadow-elevated max-w-md w-full overflow-hidden my-auto flex flex-col">
            <div className="flex items-center justify-between border-b border-axdoro-border px-6 py-4 shrink-0 bg-axdoro-surface">
              <div className="flex items-center gap-2 text-red-600">
                <Trash2 className="w-5 h-5 flex-shrink-0" />
                <h3 id="delete-product-dialog-title" className="text-base font-bold text-axdoro-charcoal">
                  Delete Product Permanently
                </h3>
              </div>
              <button
                disabled={isDeletingProduct}
                onClick={() => {
                  setProductToDelete(null);
                  setDeleteProductError(null);
                }}
                className="text-axdoro-text-muted hover:text-axdoro-charcoal p-1.5 rounded-lg hover:bg-axdoro-surface-muted transition-colors disabled:opacity-40 cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="space-y-3 text-xs">
                <p className="text-axdoro-charcoal leading-relaxed">
                  Are you sure you want to permanently delete <strong className="font-bold text-axdoro-charcoal">{productToDelete.name}</strong>?
                </p>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-900 space-y-1.5 leading-relaxed">
                  <div className="flex items-center gap-1.5 font-bold text-red-800">
                    <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span>Permanent Deletion Cannot Be Undone</span>
                  </div>
                  <p>
                    This action removes the product, its variants, inventory tracking, and hosted image records permanently.
                  </p>
                </div>

                {deleteProductError && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                      <p className="font-medium text-xs leading-relaxed">
                        {deleteProductError.message}
                      </p>
                    </div>
                    {deleteProductError.canArchive && (
                      <div className="pt-2 border-t border-amber-200 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-amber-800 font-medium">
                          Recommended safe alternative:
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleArchiveInstead}
                          className="bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900 font-semibold text-xs h-7 px-2.5"
                        >
                          Archive Product Instead
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-axdoro-border bg-axdoro-surface-muted/30 shrink-0">
              <Button
                variant="outline"
                size="sm"
                disabled={isDeletingProduct}
                onClick={() => {
                  setProductToDelete(null);
                  setDeleteProductError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isDeletingProduct}
                onClick={handleDeleteProductConfirm}
                className="font-semibold cursor-pointer"
                aria-busy={isDeletingProduct}
              >
                {isDeletingProduct ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Deleting...
                  </>
                ) : (
                  'Delete Permanently'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Enquiry Deletion Dialog (Phase 3 Safe Permanent Deletion) */}
      {enquiryToDelete && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overscroll-contain animate-in fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-enquiry-dialog-title"
        >
          <div className="bg-axdoro-surface border border-red-200/80 rounded-2xl shadow-elevated max-w-md w-full overflow-hidden my-auto flex flex-col">
            <div className="flex items-center justify-between border-b border-axdoro-border px-6 py-4 shrink-0 bg-axdoro-surface">
              <div className="flex items-center gap-2 text-red-600">
                <Trash2 className="w-5 h-5 flex-shrink-0" />
                <h3 id="delete-enquiry-dialog-title" className="text-base font-bold text-axdoro-charcoal">
                  Permanently delete this enquiry?
                </h3>
              </div>
              <button
                disabled={isDeletingEnquiry}
                onClick={() => {
                  setEnquiryToDelete(null);
                  setDeleteEnquiryError(null);
                }}
                className="text-axdoro-text-muted hover:text-axdoro-charcoal p-1.5 rounded-lg hover:bg-axdoro-surface-muted transition-colors disabled:opacity-40 cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="space-y-3 text-xs">
                <p className="text-axdoro-charcoal leading-relaxed">
                  This will permanently remove the enquiry from AXDORO. Its Google Sheets record will be retained. This action cannot be undone.
                </p>

                <div className="p-3.5 rounded-xl bg-axdoro-bg border border-axdoro-border text-xs space-y-1">
                  <div className="font-bold text-axdoro-charcoal text-sm">{enquiryToDelete.name}</div>
                  <div className="text-axdoro-text-muted font-mono text-[11px]">
                    {enquiryToDelete.email} {enquiryToDelete.phone ? `• ${enquiryToDelete.phone}` : ''}
                  </div>
                  <div className="text-[11px] text-axdoro-text-muted pt-1">
                    Type: <span className="font-semibold text-axdoro-charcoal">{enquiryToDelete.enquiryType}</span> &bull; Sync Status: <span className="font-semibold text-axdoro-charcoal">{enquiryToDelete.driveSyncStatus}</span>
                  </div>
                </div>

                {deleteEnquiryError && (
                  <div
                    className={`rounded-lg p-3 space-y-1.5 text-xs ${
                      deleteEnquiryError.isConflict
                        ? 'bg-amber-50 border border-amber-200 text-amber-900'
                        : 'bg-red-50 border border-red-200 text-red-900'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                          deleteEnquiryError.isConflict ? 'text-amber-600' : 'text-red-600'
                        }`}
                      />
                      <p className="font-medium leading-relaxed">
                        {deleteEnquiryError.message}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-axdoro-border bg-axdoro-surface-muted/30 shrink-0">
              <Button
                variant="outline"
                size="sm"
                disabled={isDeletingEnquiry}
                onClick={() => {
                  setEnquiryToDelete(null);
                  setDeleteEnquiryError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isDeletingEnquiry}
                onClick={handleDeleteEnquiryConfirm}
                className="font-semibold cursor-pointer"
                aria-busy={isDeletingEnquiry}
              >
                {isDeletingEnquiry ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    Deleting...
                  </>
                ) : (
                  'Permanently Delete'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Product Image Management Modal (Preserved for Phase 3 reuse) */}
      {selectedProductForImages && (
        <ProductImageModal
          productId={selectedProductForImages.id}
          productName={selectedProductForImages.name}
          onClose={() => setSelectedProductForImages(null)}
          onImagesUpdated={loadTabData}
        />
      )}
    </div>
  );
};
