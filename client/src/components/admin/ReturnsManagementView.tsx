import React, { useState, useEffect, useCallback } from 'react';
import {
  RotateCcw,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Package,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  Camera,
  MessageSquare,
} from 'lucide-react';
import {
  AdminReturnListItem,
  AdminReturnDetail,
  AdminReturnMetrics,
  adminGetReturns,
  adminGetReturnMetrics,
  adminGetReturnById,
} from '../../api/admin.ts';
import { getReturnWhatsAppNotification } from '../../utils/whatsapp.ts';
import { Badge } from '../ui/badge.tsx';
import { Card, CardContent } from '../ui/card.tsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table.tsx';
import { ReturnDetailModal } from './ReturnDetailModal.tsx';

export interface ReturnsManagementViewProps {
  onReturnMutated?: () => void;
}

export const ReturnsManagementView: React.FC<ReturnsManagementViewProps> = ({ onReturnMutated }) => {
  const [items, setItems] = useState<AdminReturnListItem[]>([]);
  const [metrics, setMetrics] = useState<AdminReturnMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination state
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const limit = 15;

  // Selected detail modal state
  const [selectedReturnDetail, setSelectedReturnDetail] = useState<AdminReturnDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset to page 1 on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch metrics and list data
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [listRes, metricsRes] = await Promise.all([
        adminGetReturns({
          page,
          limit,
          status: selectedStatus,
          search: debouncedSearch.trim() || undefined,
        }),
        adminGetReturnMetrics(),
      ]);

      setItems(listRes.items);
      setTotalPages(listRes.pagination.totalPages);
      setTotalCount(listRes.pagination.totalCount);
      setMetrics(metricsRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load returns');
    } finally {
      setIsLoading(false);
    }
  }, [page, selectedStatus, debouncedSearch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open detail modal
  const handleOpenDetail = async (id: string) => {
    try {
      setIsLoadingDetail(true);
      const detail = await adminGetReturnById(id);
      setSelectedReturnDetail(detail);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load request details');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const getStatusBadgeVariant = (st: string) => {
    switch (st) {
      case 'REQUEST_SUBMITTED':
        return 'warning';
      case 'UNDER_REVIEW':
        return 'secondary';
      case 'APPROVED':
        return 'success';
      case 'REJECTED':
        return 'destructive';
      case 'COMPLETED':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-axdoro-charcoal flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-axdoro-accent" />
            Returns &amp; Exchanges Management
          </h2>
          <p className="text-xs text-axdoro-text-muted mt-0.5">
            Review customer return requests, inspect evidence photos, and track fulfillment &amp; refunds.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-axdoro-border bg-axdoro-surface text-xs font-semibold text-axdoro-charcoal hover:bg-axdoro-surface-muted transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Metric Cards */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div
            onClick={() => {
              setSelectedStatus('REQUEST_SUBMITTED');
              setPage(1);
            }}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              selectedStatus === 'REQUEST_SUBMITTED'
                ? 'border-amber-400 bg-amber-50/60 shadow-xs ring-1 ring-amber-400'
                : 'border-axdoro-border bg-axdoro-surface hover:bg-axdoro-surface-muted'
            }`}
          >
            <div className="flex items-center justify-between text-amber-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Pending</span>
              <Clock className="w-4 h-4" />
            </div>
            <div className="text-lg font-bold text-axdoro-charcoal font-mono">{metrics.pendingReview}</div>
          </div>

          <div
            onClick={() => {
              setSelectedStatus('UNDER_REVIEW');
              setPage(1);
            }}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              selectedStatus === 'UNDER_REVIEW'
                ? 'border-indigo-400 bg-indigo-50/60 shadow-xs ring-1 ring-indigo-400'
                : 'border-axdoro-border bg-axdoro-surface hover:bg-axdoro-surface-muted'
            }`}
          >
            <div className="flex items-center justify-between text-indigo-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Under Review</span>
              <FileText className="w-4 h-4" />
            </div>
            <div className="text-lg font-bold text-axdoro-charcoal font-mono">{metrics.underReview}</div>
          </div>

          <div
            onClick={() => {
              setSelectedStatus('APPROVED');
              setPage(1);
            }}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              selectedStatus === 'APPROVED'
                ? 'border-emerald-400 bg-emerald-50/60 shadow-xs ring-1 ring-emerald-400'
                : 'border-axdoro-border bg-axdoro-surface hover:bg-axdoro-surface-muted'
            }`}
          >
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Approved</span>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="text-lg font-bold text-axdoro-charcoal font-mono">{metrics.approved}</div>
          </div>

          <div
            onClick={() => {
              setSelectedStatus('REJECTED');
              setPage(1);
            }}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              selectedStatus === 'REJECTED'
                ? 'border-red-400 bg-red-50/60 shadow-xs ring-1 ring-red-400'
                : 'border-axdoro-border bg-axdoro-surface hover:bg-axdoro-surface-muted'
            }`}
          >
            <div className="flex items-center justify-between text-red-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Rejected</span>
              <XCircle className="w-4 h-4" />
            </div>
            <div className="text-lg font-bold text-axdoro-charcoal font-mono">{metrics.rejected}</div>
          </div>

          <div
            onClick={() => {
              setSelectedStatus('COMPLETED');
              setPage(1);
            }}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              selectedStatus === 'COMPLETED'
                ? 'border-teal-400 bg-teal-50/60 shadow-xs ring-1 ring-teal-400'
                : 'border-axdoro-border bg-axdoro-surface hover:bg-axdoro-surface-muted'
            }`}
          >
            <div className="flex items-center justify-between text-teal-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Completed</span>
              <Package className="w-4 h-4" />
            </div>
            <div className="text-lg font-bold text-axdoro-charcoal font-mono">{metrics.completed}</div>
          </div>

          <div
            onClick={() => {
              setSelectedStatus('ALL');
              setPage(1);
            }}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${
              selectedStatus === 'ALL'
                ? 'border-axdoro-charcoal bg-axdoro-charcoal/5 shadow-xs ring-1 ring-axdoro-charcoal'
                : 'border-axdoro-border bg-axdoro-surface hover:bg-axdoro-surface-muted'
            }`}
          >
            <div className="flex items-center justify-between text-axdoro-text-muted mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">All Requests</span>
              <Calendar className="w-4 h-4" />
            </div>
            <div className="text-lg font-bold text-axdoro-charcoal font-mono">{metrics.total}</div>
          </div>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-axdoro-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search reference #, order #, email, phone..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-axdoro-border bg-axdoro-surface focus:outline-none focus:ring-1 focus:ring-axdoro-accent"
          />
        </div>

        {/* Status Pill Filters */}
        <div className="flex items-center gap-1 overflow-x-auto text-xs font-semibold py-1">
          {['ALL', 'REQUEST_SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setSelectedStatus(st);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                selectedStatus === st
                  ? 'bg-axdoro-charcoal text-white font-bold'
                  : 'text-axdoro-text-muted hover:text-axdoro-charcoal hover:bg-axdoro-surface-muted'
              }`}
            >
              {st === 'ALL' ? 'All' : st.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      {isLoading ? (
        <Card className="border-axdoro-border bg-axdoro-surface">
          <CardContent className="py-16 text-center text-xs text-axdoro-text-muted flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-axdoro-accent" />
            Loading return requests...
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="py-8 text-center text-xs text-red-700 space-y-2">
            <AlertCircle className="w-6 h-6 mx-auto text-red-500" />
            <div className="font-bold">Error loading return requests</div>
            <div>{error}</div>
            <button
              type="button"
              onClick={loadData}
              className="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-md text-xs font-semibold hover:bg-red-700"
            >
              Try Again
            </button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card className="border-axdoro-border bg-axdoro-surface">
          <CardContent className="py-16 text-center text-xs text-axdoro-text-muted space-y-1">
            <RotateCcw className="w-8 h-8 mx-auto text-axdoro-border mb-2" />
            <div className="font-bold text-axdoro-charcoal">No return requests found</div>
            <div>
              {searchQuery
                ? 'Try adjusting your search criteria or status filter.'
                : 'No return requests have been submitted under this view yet.'}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-axdoro-border bg-axdoro-surface overflow-hidden shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference #</TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono font-bold text-axdoro-charcoal whitespace-nowrap">
                    {item.requestNumber}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    <div>{item.submittedOrderId}</div>
                    <div className="text-[10px]">
                      {item.isOrderMatched ? (
                        <span className="text-emerald-700 font-semibold">Matched</span>
                      ) : (
                        <span className="text-amber-700 font-semibold">Unmatched</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="font-semibold text-axdoro-charcoal">{item.customerName || item.customerPhone}</div>
                    <div className="text-[11px] text-axdoro-text-muted">{item.customerEmail}</div>
                  </TableCell>
                  <TableCell className="text-xs max-w-[160px] truncate" title={item.reason}>
                    {item.reason.replace(/_/g, ' ')}
                  </TableCell>
                  <TableCell className="text-xs">
                    {item.evidenceCount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <Camera className="w-3 h-3" />
                        {item.evidenceCount} {item.evidenceCount === 1 ? 'photo' : 'photos'}
                      </span>
                    ) : (
                      <span className="text-axdoro-text-muted text-[11px] italic">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const notification = getReturnWhatsAppNotification({
                        customerName: item.customerName,
                        requestNumber: item.requestNumber,
                        submittedOrderId: item.submittedOrderId,
                        customerPhone: item.customerPhone,
                        status: item.status,
                      });
                      return (
                        <div className="flex items-center gap-2">
                          <Badge variant={getStatusBadgeVariant(item.status)}>
                            {item.status.replace(/_/g, ' ')}
                          </Badge>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (notification.isEligible && notification.url) {
                                window.open(notification.url, '_blank', 'noopener,noreferrer');
                              }
                            }}
                            disabled={!notification.isEligible}
                            title={notification.tooltip}
                            aria-label={`Notify ${item.customerName || item.customerPhone} on WhatsApp for return ${item.requestNumber}`}
                            className={`p-1.5 rounded-lg border transition-all inline-flex items-center justify-center shrink-0 ${
                              notification.isEligible
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 hover:border-emerald-500/60 cursor-pointer shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500'
                                : 'border-axdoro-border/40 bg-axdoro-surface-muted/30 text-axdoro-text-muted/40 cursor-not-allowed opacity-40'
                            }`}
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-xs text-axdoro-text-muted whitespace-nowrap">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={() => handleOpenDetail(item.id)}
                      disabled={isLoadingDetail}
                      className="px-3 py-1.5 rounded-lg border border-axdoro-border text-xs font-semibold text-axdoro-charcoal hover:bg-axdoro-surface-muted transition-colors cursor-pointer"
                    >
                      Review
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-axdoro-border bg-axdoro-surface-muted/30 text-xs">
              <span className="text-axdoro-text-muted">
                Showing page <strong className="text-axdoro-charcoal">{page}</strong> of{' '}
                <strong className="text-axdoro-charcoal">{totalPages}</strong> ({totalCount} total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded border border-axdoro-border bg-axdoro-surface disabled:opacity-40 cursor-pointer"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded border border-axdoro-border bg-axdoro-surface disabled:opacity-40 cursor-pointer"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Request Detail Modal */}
      {selectedReturnDetail && (
        <ReturnDetailModal
          isOpen={Boolean(selectedReturnDetail)}
          onClose={() => setSelectedReturnDetail(null)}
          returnDetail={selectedReturnDetail}
          onUpdated={(updated) => {
            setSelectedReturnDetail(updated);
            loadData();
            onReturnMutated?.();
          }}
        />
      )}
    </div>
  );
};

