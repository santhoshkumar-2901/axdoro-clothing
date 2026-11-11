import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Eye,
  Trash2,
  User,
  ShoppingBag,
  Loader2,
} from 'lucide-react';
import {
  AdminReturnDetail,
  adminUpdateReturnStatus,
  adminUpdateReturnShipping,
  adminUpdateReturnInspection,
  adminUpdateReturnRefund,
  adminDeleteReturnEvidence,
} from '../../api/admin.ts';
import { Badge } from '../ui/badge.tsx';
import { useScrollLock } from '../../utils/scrollLock.ts';
import { EvidenceLightboxModal } from './EvidenceLightboxModal.tsx';

export interface ReturnDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnDetail: AdminReturnDetail;
  onUpdated: (updated: AdminReturnDetail) => void;
}

export const ReturnDetailModal: React.FC<ReturnDetailModalProps> = ({
  isOpen,
  onClose,
  returnDetail,
  onUpdated,
}) => {
  useScrollLock(isOpen);

  type ActiveTab = 'overview' | 'status' | 'shipping' | 'inspection' | 'refund' | 'history';
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Preview evidence lightbox state
  const [previewEvidence, setPreviewEvidence] = useState<{ id: string; originalFilename: string } | null>(null);

  // Evidence deletion confirmation state
  const [evidenceToDelete, setEvidenceToDelete] = useState<{ id: string; originalFilename: string } | null>(null);
  const [isDeletingEvidence, setIsDeletingEvidence] = useState(false);

  // Status form state
  const [statusVal, setStatusVal] = useState<string>(returnDetail.status);
  const [adminNotes, setAdminNotes] = useState<string>(returnDetail.adminNotes || '');
  const [rejectionReason, setRejectionReason] = useState<string>(returnDetail.rejectionReason || '');
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Shipping form state
  const [shippingInstructions, setShippingInstructions] = useState<string>(
    returnDetail.shipping.shippingInstructions || ''
  );
  const [courierName, setCourierName] = useState<string>(returnDetail.shipping.returnCourierName || '');
  const [trackingNumber, setTrackingNumber] = useState<string>(
    returnDetail.shipping.returnTrackingNumber || ''
  );
  const [customerShippedAt, setCustomerShippedAt] = useState<string>(
    returnDetail.shipping.customerShippedAt ? returnDetail.shipping.customerShippedAt.substring(0, 10) : ''
  );
  const [productReceivedAt, setProductReceivedAt] = useState<string>(
    returnDetail.shipping.productReceivedAt ? returnDetail.shipping.productReceivedAt.substring(0, 10) : ''
  );
  const [isSavingShipping, setIsSavingShipping] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);

  // Inspection form state
  const [inspectionResult, setInspectionResult] = useState<string>(
    returnDetail.inspection.inspectionResult || 'PENDING'
  );
  const [inspectionNotes, setInspectionNotes] = useState<string>(
    returnDetail.inspection.inspectionNotes || ''
  );
  const [isSavingInspection, setIsSavingInspection] = useState(false);
  const [inspectionError, setInspectionError] = useState<string | null>(null);

  // Refund form state
  const [refundStatus, setRefundStatus] = useState<string>(returnDetail.refund.refundStatus || 'PENDING');
  const [refundAmountRupees, setRefundAmountRupees] = useState<string>(
    returnDetail.refund.refundAmountPaise ? (returnDetail.refund.refundAmountPaise / 100).toFixed(2) : ''
  );
  const [refundMethod, setRefundMethod] = useState<string>(
    returnDetail.refund.refundMethod || 'BANK_TRANSFER'
  );
  const [refundReference, setRefundReference] = useState<string>(
    returnDetail.refund.refundReference || ''
  );
  const [refundNotes, setRefundNotes] = useState<string>(returnDetail.refund.refundNotes || '');
  const [allowExcessRefund, setAllowExcessRefund] = useState(false);
  const [isSavingRefund, setIsSavingRefund] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  // Toast / feedback message
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  if (!isOpen) return null;

  // Handle status update
  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusError(null);
    if (statusVal === 'REJECTED' && rejectionReason.trim().length < 5) {
      setStatusError('Rejection reason must be at least 5 characters.');
      return;
    }

    try {
      setIsSavingStatus(true);
      const updated = await adminUpdateReturnStatus(returnDetail.id, {
        status: statusVal,
        adminNotes: adminNotes.trim() || undefined,
        rejectionReason: statusVal === 'REJECTED' ? rejectionReason.trim() : undefined,
      });
      onUpdated(updated);
      showToast('success', 'Return status updated successfully.');
    } catch (err: unknown) {
      setStatusError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setIsSavingStatus(false);
    }
  };

  // Handle shipping update
  const handleSaveShipping = async (e: React.FormEvent) => {
    e.preventDefault();
    setShippingError(null);
    try {
      setIsSavingShipping(true);
      const updated = await adminUpdateReturnShipping(returnDetail.id, {
        shippingInstructions: shippingInstructions.trim() || null,
        returnCourierName: courierName.trim() || null,
        returnTrackingNumber: trackingNumber.trim() || null,
        customerShippedAt: customerShippedAt ? new Date(customerShippedAt).toISOString() : null,
        productReceivedAt: productReceivedAt ? new Date(productReceivedAt).toISOString() : null,
      });
      onUpdated(updated);
      showToast('success', 'Shipping details updated.');
    } catch (err: unknown) {
      setShippingError(err instanceof Error ? err.message : 'Failed to save shipping info');
    } finally {
      setIsSavingShipping(false);
    }
  };

  // Handle inspection update
  const handleSaveInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    setInspectionError(null);
    if (inspectionNotes.trim().length < 3) {
      setInspectionError('Inspection notes must be at least 3 characters.');
      return;
    }

    try {
      setIsSavingInspection(true);
      const updated = await adminUpdateReturnInspection(returnDetail.id, {
        inspectionResult: inspectionResult as 'PENDING' | 'PASS' | 'FAIL' | 'PARTIAL',
        inspectionNotes: inspectionNotes.trim(),
      });
      onUpdated(updated);
      showToast('success', 'Inspection report saved.');
    } catch (err: unknown) {
      setInspectionError(err instanceof Error ? err.message : 'Failed to save inspection');
    } finally {
      setIsSavingInspection(false);
    }
  };

  // Handle refund update
  const handleSaveRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefundError(null);

    const amountNum = parseFloat(refundAmountRupees || '0');
    const amountPaise = Math.round(amountNum * 100);

    if (refundStatus === 'COMPLETED' && (!refundReference.trim() || amountPaise <= 0)) {
      setRefundError('Reference/UTR, refund method, and a positive refund amount are required to complete refund.');
      return;
    }

    if (refundStatus === 'REJECTED' && refundNotes.trim().length < 5) {
      setRefundError('Mandatory refund notes (at least 5 characters) explaining the rejection are required.');
      return;
    }

    const orderTotalPaise = returnDetail.matchedOrder?.totalPaise || null;
    if (orderTotalPaise && amountPaise > orderTotalPaise) {
      if (!allowExcessRefund) {
        setRefundError(
          `Refund amount (₹${amountNum.toFixed(2)}) exceeds verified order total (₹${(orderTotalPaise / 100).toFixed(2)}). Please check the confirmation box and provide an explanation in the notes.`
        );
        return;
      }
      if (refundNotes.trim().length < 10) {
        setRefundError(
          'A detailed explanation in refund notes (at least 10 characters) is required when authorizing an excess refund.'
        );
        return;
      }
    }

    try {
      setIsSavingRefund(true);
      const updated = await adminUpdateReturnRefund(returnDetail.id, {
        refundStatus: refundStatus as 'NOT_APPLICABLE' | 'PENDING' | 'INITIATED' | 'COMPLETED' | 'REJECTED',
        refundAmountPaise: amountPaise > 0 ? amountPaise : null,
        refundMethod: refundMethod as 'ORIGINAL_PAYMENT' | 'BANK_TRANSFER' | 'UPI' | 'STORE_CREDIT',
        refundReference: refundReference.trim() || null,
        refundNotes: refundNotes.trim() || null,
        allowExcessRefund,
      });
      onUpdated(updated);
      showToast('success', 'Refund ledger record updated.');
    } catch (err: unknown) {
      setRefundError(err instanceof Error ? err.message : 'Failed to update refund ledger');
    } finally {
      setIsSavingRefund(false);
    }
  };

  // Handle evidence delete
  const handleConfirmDeleteEvidence = async () => {
    if (!evidenceToDelete) return;
    try {
      setIsDeletingEvidence(true);
      await adminDeleteReturnEvidence(returnDetail.id, evidenceToDelete.id);
      // Remove deleted item from evidence list
      const updatedEvidence = returnDetail.evidence.filter((e) => e.id !== evidenceToDelete.id);
      onUpdated({ ...returnDetail, evidence: updatedEvidence });
      setEvidenceToDelete(null);
      showToast('success', 'Evidence photo permanently deleted.');
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Failed to delete evidence');
    } finally {
      setIsDeletingEvidence(false);
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

  const orderTotalRupees = returnDetail.matchedOrder
    ? (returnDetail.matchedOrder.totalPaise / 100).toFixed(2)
    : null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="return-modal-title"
        className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200"
      >
        <div className="relative max-w-4xl w-full bg-axdoro-surface rounded-xl overflow-hidden shadow-2xl border border-axdoro-border flex flex-col max-h-[92vh]">
          {/* Top Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-axdoro-border bg-axdoro-surface">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-axdoro-surface-muted text-axdoro-accent">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 id="return-modal-title" className="text-base font-bold text-axdoro-charcoal font-mono">
                    {returnDetail.requestNumber}
                  </h2>
                  <Badge variant={getStatusBadgeVariant(returnDetail.status)}>
                    {returnDetail.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <div className="text-[11px] text-axdoro-text-muted mt-0.5">
                  Submitted on {new Date(returnDetail.createdAt).toLocaleString()} &bull; Order:{' '}
                  <span className="font-mono font-semibold text-axdoro-charcoal">
                    {returnDetail.submittedOrderId}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-axdoro-text-muted hover:text-axdoro-charcoal rounded-lg hover:bg-axdoro-surface-muted transition-colors cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Toast Notification */}
          {toastMessage && (
            <div
              className={`px-5 py-2.5 text-xs font-semibold flex items-center justify-between ${
                toastMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200'
                  : 'bg-red-50 text-red-800 border-b border-red-200'
              }`}
            >
              <span>{toastMessage.text}</span>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                className="text-current hover:opacity-75"
              >
                &times;
              </button>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 px-6 border-b border-axdoro-border bg-axdoro-surface-muted/40 overflow-x-auto text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-2.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'border-axdoro-accent text-axdoro-charcoal font-bold'
                  : 'border-transparent text-axdoro-text-muted hover:text-axdoro-charcoal'
              }`}
            >
              Overview &amp; Evidence
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('status')}
              className={`px-3 py-2.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'status'
                  ? 'border-axdoro-accent text-axdoro-charcoal font-bold'
                  : 'border-transparent text-axdoro-text-muted hover:text-axdoro-charcoal'
              }`}
            >
              Review &amp; Status
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('shipping')}
              className={`px-3 py-2.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'shipping'
                  ? 'border-axdoro-accent text-axdoro-charcoal font-bold'
                  : 'border-transparent text-axdoro-text-muted hover:text-axdoro-charcoal'
              }`}
            >
              Shipping ({returnDetail.shipping.returnCourierName ? 'Recorded' : 'Empty'})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('inspection')}
              className={`px-3 py-2.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'inspection'
                  ? 'border-axdoro-accent text-axdoro-charcoal font-bold'
                  : 'border-transparent text-axdoro-text-muted hover:text-axdoro-charcoal'
              }`}
            >
              Inspection ({returnDetail.inspection.inspectionResult || 'Pending'})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('refund')}
              className={`px-3 py-2.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'refund'
                  ? 'border-axdoro-accent text-axdoro-charcoal font-bold'
                  : 'border-transparent text-axdoro-text-muted hover:text-axdoro-charcoal'
              }`}
            >
              Refund Ledger ({returnDetail.refund.refundStatus})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-2.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'history'
                  ? 'border-axdoro-accent text-axdoro-charcoal font-bold'
                  : 'border-transparent text-axdoro-text-muted hover:text-axdoro-charcoal'
              }`}
            >
              Audit History ({returnDetail.history.length})
            </button>
          </div>

          {/* Modal Scrollable Body */}
          <div className="p-6 overflow-y-auto space-y-6">
            {/* 1. OVERVIEW & EVIDENCE TAB */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Diagnostics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Customer Info Card */}
                  <div className="p-4 rounded-lg bg-axdoro-surface border border-axdoro-border space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase text-axdoro-text-muted">
                      <User className="w-3.5 h-3.5" />
                      Customer Details
                    </div>
                    <div className="text-sm font-bold text-axdoro-charcoal">
                      {returnDetail.matchedOrder?.customerName || 'Name unverified'}
                    </div>
                    <div className="text-xs text-axdoro-text-muted space-y-0.5">
                      <div>
                        Phone: <span className="font-mono text-axdoro-charcoal">{returnDetail.customerPhone}</span>
                      </div>
                      <div>
                        Email: <span className="font-mono text-axdoro-charcoal">{returnDetail.customerEmail}</span>
                      </div>
                    </div>
                  </div>

                  {/* Order Matching & Policy Card */}
                  <div className="p-4 rounded-lg bg-axdoro-surface border border-axdoro-border space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase text-axdoro-text-muted">
                      <ShoppingBag className="w-3.5 h-3.5" />
                      Order Linkage &amp; Policy
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">
                        {returnDetail.isOrderMatched ? (
                          <span className="text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Verified Match
                          </span>
                        ) : (
                          <span className="text-amber-700 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" /> Unmatched Order
                          </span>
                        )}
                      </span>
                      <Badge variant={returnDetail.eligibilityFlag === 'WITHIN_7_DAYS' ? 'success' : 'warning'}>
                        {returnDetail.eligibilityFlag.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div className="text-xs text-axdoro-text-muted">
                      Delivered:{' '}
                      {returnDetail.deliveryDateRecorded
                        ? new Date(returnDetail.deliveryDateRecorded).toLocaleDateString()
                        : 'No delivery date on record'}
                    </div>
                  </div>
                </div>

                {/* Return Reason & Description */}
                <div className="p-4 rounded-lg bg-axdoro-surface-muted/50 border border-axdoro-border space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-axdoro-text-muted">
                    Submission Reason
                  </div>
                  <div className="text-sm font-bold text-axdoro-charcoal">
                    {returnDetail.reason.replace(/_/g, ' ')}
                  </div>
                  {returnDetail.description ? (
                    <div className="text-xs text-axdoro-charcoal whitespace-pre-wrap bg-axdoro-surface p-3 rounded border border-axdoro-border">
                      {returnDetail.description}
                    </div>
                  ) : (
                    <div className="text-xs text-axdoro-text-muted italic">No customer description provided.</div>
                  )}
                </div>

                {/* Evidence Photo Gallery */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold uppercase tracking-wider text-axdoro-text-muted">
                      Customer Uploaded Evidence ({returnDetail.evidence.length})
                    </div>
                    <span className="text-[11px] text-axdoro-text-muted">
                      Stored securely in private authenticated storage
                    </span>
                  </div>

                  {returnDetail.evidence.length === 0 ? (
                    <div className="p-6 text-center text-xs text-axdoro-text-muted bg-axdoro-surface-muted/30 rounded-lg border border-dashed border-axdoro-border">
                      No photo evidence was attached to this return request.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {returnDetail.evidence.map((ev) => (
                        <div
                          key={ev.id}
                          className="group relative rounded-lg border border-axdoro-border overflow-hidden bg-axdoro-surface shadow-xs flex flex-col justify-between"
                        >
                          <div
                            onClick={() => setPreviewEvidence(ev)}
                            className="aspect-square bg-axdoro-surface-muted flex items-center justify-center overflow-hidden cursor-pointer relative"
                          >
                            <img
                              src={`/api/admin/returns/${returnDetail.id}/evidence/${ev.id}`}
                              alt={ev.originalFilename}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                              <Eye className="w-5 h-5" />
                            </div>
                          </div>

                          <div className="p-2.5 flex items-center justify-between gap-1 border-t border-axdoro-border">
                            <span className="text-[11px] font-semibold text-axdoro-charcoal truncate" title={ev.originalFilename}>
                              {ev.originalFilename}
                            </span>
                            <button
                              type="button"
                              onClick={() => setEvidenceToDelete(ev)}
                              className="text-red-600 hover:text-red-700 p-1 rounded hover:bg-red-50 cursor-pointer"
                              title="Permanently Delete Evidence"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Matched Order Line Items */}
                {returnDetail.matchedOrder && (
                  <div className="space-y-3 pt-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-axdoro-text-muted">
                      Items on Original Order ({returnDetail.matchedOrder.items.length})
                    </div>
                    <div className="border border-axdoro-border rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-axdoro-surface-muted border-b border-axdoro-border text-axdoro-text-muted">
                          <tr>
                            <th className="p-2.5">Item</th>
                            <th className="p-2.5">Variant</th>
                            <th className="p-2.5 text-right">Price</th>
                            <th className="p-2.5 text-center">Qty</th>
                            <th className="p-2.5 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-axdoro-border">
                          {returnDetail.matchedOrder.items.map((item) => (
                            <tr key={item.id}>
                              <td className="p-2.5 font-semibold text-axdoro-charcoal">{item.productName}</td>
                              <td className="p-2.5 text-axdoro-text-muted">
                                {[item.variantSize, item.variantColor].filter(Boolean).join(' / ') || 'Standard'}
                              </td>
                              <td className="p-2.5 text-right font-mono">
                                ₹{(item.unitPricePaise / 100).toFixed(2)}
                              </td>
                              <td className="p-2.5 text-center font-mono font-bold">
                                &times;{item.quantity}
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-axdoro-charcoal">
                                ₹{(item.lineTotalPaise / 100).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-axdoro-surface-muted/50 border-t border-axdoro-border font-bold">
                          <tr>
                            <td colSpan={4} className="p-2.5 text-right">
                              Order Total:
                            </td>
                            <td className="p-2.5 text-right font-mono text-axdoro-accent">
                              ₹{orderTotalRupees}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. REVIEW & STATUS TAB */}
            {activeTab === 'status' && (
              <form onSubmit={handleSaveStatus} className="space-y-5 max-w-xl">
                <div>
                  <h3 className="text-sm font-bold text-axdoro-charcoal">Review &amp; Status Transitions</h3>
                  <p className="text-xs text-axdoro-text-muted">
                    Move return request through verified administrative workflow stages.
                  </p>
                </div>

                {statusError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg">
                    {statusError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-axdoro-charcoal">Select Status</label>
                  <select
                    value={statusVal}
                    onChange={(e) => setStatusVal(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-axdoro-border bg-axdoro-surface"
                  >
                    <option value="REQUEST_SUBMITTED">REQUEST_SUBMITTED (Pending review)</option>
                    <option value="UNDER_REVIEW">UNDER_REVIEW (In active triage)</option>
                    <option value="APPROVED">APPROVED (Authorized for customer return)</option>
                    <option value="REJECTED">REJECTED (Ineligible / declined)</option>
                    <option value="COMPLETED">COMPLETED (Item received &amp; resolved)</option>
                  </select>
                </div>

                {statusVal === 'REJECTED' && (
                  <div className="space-y-1.5 animate-in fade-in">
                    <label className="text-xs font-semibold text-red-700">
                      Mandatory Customer Rejection Reason *
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Explain policy or verification reason for rejection..."
                      rows={3}
                      className="w-full text-xs p-2.5 rounded-lg border border-red-300 bg-axdoro-surface focus:ring-1 focus:ring-red-500"
                      required
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-axdoro-charcoal">Internal Admin Notes</label>
                  <textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Internal team notes, communications, or instructions..."
                    rows={4}
                    className="w-full text-xs p-2.5 rounded-lg border border-axdoro-border bg-axdoro-surface"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingStatus}
                  className="px-5 py-2.5 rounded-lg bg-axdoro-charcoal text-white text-xs font-bold hover:bg-black transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {isSavingStatus && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Status Update
                </button>
              </form>
            )}

            {/* 3. SHIPPING TAB */}
            {activeTab === 'shipping' && (
              <form onSubmit={handleSaveShipping} className="space-y-5 max-w-xl">
                <div>
                  <h3 className="text-sm font-bold text-axdoro-charcoal">Shipping &amp; Courier Tracking</h3>
                  <p className="text-xs text-axdoro-text-muted">
                    Record customer-provided shipment courier details and warehouse receipt timestamps.
                  </p>
                </div>

                {shippingError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg">
                    {shippingError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-axdoro-charcoal">
                    Shipping Instructions Shared with Customer
                  </label>
                  <textarea
                    value={shippingInstructions}
                    onChange={(e) => setShippingInstructions(e.target.value)}
                    placeholder="e.g. Return to Warehouse Hub 4, please include RET reference..."
                    rows={3}
                    className="w-full text-xs p-2.5 rounded-lg border border-axdoro-border bg-axdoro-surface"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-axdoro-charcoal">Courier Name</label>
                    <input
                      type="text"
                      value={courierName}
                      onChange={(e) => setCourierName(e.target.value)}
                      placeholder="e.g. Bluedart, Delhivery, DTDC"
                      className="w-full text-xs p-2.5 rounded-lg border border-axdoro-border bg-axdoro-surface"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-axdoro-charcoal">Tracking / AWB Number</label>
                    <input
                      type="text"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="e.g. 8899221144"
                      className="w-full text-xs p-2.5 rounded-lg border border-axdoro-border bg-axdoro-surface font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-axdoro-charcoal">Customer Dispatched Date</label>
                    <input
                      type="date"
                      value={customerShippedAt}
                      onChange={(e) => setCustomerShippedAt(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-axdoro-border bg-axdoro-surface"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-axdoro-charcoal">Product Received Date</label>
                    <input
                      type="date"
                      value={productReceivedAt}
                      onChange={(e) => setProductReceivedAt(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-axdoro-border bg-axdoro-surface"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isSavingShipping}
                    className="px-5 py-2.5 rounded-lg bg-axdoro-charcoal text-white text-xs font-bold hover:bg-black transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                  >
                    {isSavingShipping && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Save Shipping Information
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const today = new Date().toISOString().substring(0, 10);
                      setProductReceivedAt(today);
                    }}
                    className="px-3.5 py-2.5 rounded-lg border border-axdoro-border text-axdoro-charcoal text-xs font-semibold hover:bg-axdoro-surface-muted transition-colors cursor-pointer"
                  >
                    Mark Received Today
                  </button>
                </div>
              </form>
            )}

            {/* 4. INSPECTION TAB */}
            {activeTab === 'inspection' && (
              <form onSubmit={handleSaveInspection} className="space-y-5 max-w-xl">
                <div>
                  <h3 className="text-sm font-bold text-axdoro-charcoal">Warehouse Physical Inspection</h3>
                  <p className="text-xs text-axdoro-text-muted">
                    Record inspection verdict after physical verification of returned garment tags and condition.
                  </p>
                </div>

                {inspectionError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg">
                    {inspectionError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-axdoro-charcoal">Inspection Result</label>
                  <select
                    value={inspectionResult}
                    onChange={(e) => setInspectionResult(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-axdoro-border bg-axdoro-surface"
                  >
                    <option value="PENDING">PENDING (Awaiting inspection)</option>
                    <option value="PASS">PASS (Item verified in original condition)</option>
                    <option value="FAIL">FAIL (Item worn, tags missing, or rejected)</option>
                    <option value="PARTIAL">PARTIAL (Partial items verified)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-axdoro-charcoal">Inspection Notes *</label>
                  <textarea
                    value={inspectionNotes}
                    onChange={(e) => setInspectionNotes(e.target.value)}
                    placeholder="Describe garment condition, tag status, smell, packaging..."
                    rows={4}
                    className="w-full text-xs p-2.5 rounded-lg border border-axdoro-border bg-axdoro-surface"
                    required
                  />
                </div>

                {returnDetail.inspection.inspectedBy && (
                  <div className="p-3 rounded-lg bg-axdoro-surface-muted text-xs text-axdoro-text-muted space-y-0.5">
                    <div>
                      Last inspected by:{' '}
                      <span className="font-semibold text-axdoro-charcoal">
                        {returnDetail.inspection.inspectedBy}
                      </span>
                    </div>
                    {returnDetail.inspection.inspectedAt && (
                      <div>At: {new Date(returnDetail.inspection.inspectedAt).toLocaleString()}</div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSavingInspection}
                  className="px-5 py-2.5 rounded-lg bg-axdoro-charcoal text-white text-xs font-bold hover:bg-black transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {isSavingInspection && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Inspection Record
                </button>
              </form>
            )}

            {/* 5. REFUND TAB */}
            {activeTab === 'refund' && (
              <form onSubmit={handleSaveRefund} className="space-y-5 max-w-xl">
                <div>
                  <h3 className="text-sm font-bold text-axdoro-charcoal">Manual Refund Tracking Ledger</h3>
                  <p className="text-xs text-axdoro-text-muted">
                    Track manual payment reversals, bank UTR references, and refund fulfillment.
                  </p>
                </div>

                {refundError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg">
                    {refundError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-axdoro-charcoal">Refund Status</label>
                    <select
                      value={refundStatus}
                      onChange={(e) => setRefundStatus(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-axdoro-border bg-axdoro-surface"
                    >
                      <option value="NOT_APPLICABLE">NOT_APPLICABLE</option>
                      <option value="PENDING">PENDING</option>
                      <option value="INITIATED">INITIATED</option>
                      <option value="COMPLETED">COMPLETED</option>
                      <option value="REJECTED">REJECTED</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-axdoro-charcoal">Refund Method</label>
                    <select
                      value={refundMethod}
                      onChange={(e) => setRefundMethod(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-lg border border-axdoro-border bg-axdoro-surface"
                    >
                      <option value="ORIGINAL_PAYMENT">Original Payment Gateway</option>
                      <option value="BANK_TRANSFER">Bank Transfer (NEFT/IMPS)</option>
                      <option value="UPI">UPI Direct</option>
                      <option value="STORE_CREDIT">Store Credit Voucher</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-axdoro-charcoal">Refund Amount (₹)</label>
                      {orderTotalRupees && (
                        <span className="text-[10px] text-axdoro-text-muted">
                          Order Max: ₹{orderTotalRupees}
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={refundAmountRupees}
                      onChange={(e) => setRefundAmountRupees(e.target.value)}
                      placeholder="0.00"
                      className="w-full text-xs p-2.5 rounded-lg border border-axdoro-border bg-axdoro-surface font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-axdoro-charcoal">
                      Bank Reference / UTR Number
                    </label>
                    <input
                      type="text"
                      value={refundReference}
                      onChange={(e) => setRefundReference(e.target.value)}
                      placeholder="e.g. UTR123456789"
                      className="w-full text-xs p-2.5 rounded-lg border border-axdoro-border bg-axdoro-surface font-mono"
                    />
                  </div>
                </div>

                {/* Excess refund warning & confirmation */}
                {returnDetail.matchedOrder &&
                  parseFloat(refundAmountRupees || '0') * 100 > returnDetail.matchedOrder.totalPaise && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs space-y-2">
                      <div className="font-semibold flex items-center gap-1.5 text-amber-900">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        Notice: Excess Refund Amount
                      </div>
                      <p className="text-[11px] leading-relaxed text-amber-800">
                        The entered amount (₹{parseFloat(refundAmountRupees || '0').toFixed(2)}) exceeds the verified order total (₹{orderTotalRupees}).
                        Explicit administrator confirmation and an explanatory note are required.
                      </p>
                      <label className="flex items-center gap-2 cursor-pointer font-medium pt-1 text-xs">
                        <input
                          type="checkbox"
                          checked={allowExcessRefund}
                          onChange={(e) => setAllowExcessRefund(e.target.checked)}
                          className="rounded border-amber-400 text-axdoro-accent focus:ring-amber-500"
                        />
                        <span>I explicitly authorize this excess refund amount</span>
                      </label>
                    </div>
                  )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-axdoro-charcoal flex items-center justify-between">
                    <span>Refund Notes {refundStatus === 'REJECTED' && <span className="text-red-600">* (Reason for rejection)</span>}</span>
                    {refundStatus === 'REJECTED' && (
                      <span className="text-[10px] text-axdoro-text-muted">Min 5 characters</span>
                    )}
                  </label>
                  <textarea
                    value={refundNotes}
                    onChange={(e) => setRefundNotes(e.target.value)}
                    placeholder={
                      refundStatus === 'REJECTED'
                        ? 'Explain why this refund is rejected (mandatory)...'
                        : 'Details of bank transfer, UTR, or gateway transaction...'
                    }
                    rows={3}
                    className="w-full text-xs p-2.5 rounded-lg border border-axdoro-border bg-axdoro-surface"
                    required={refundStatus === 'REJECTED'}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingRefund}
                  className="px-5 py-2.5 rounded-lg bg-axdoro-charcoal text-white text-xs font-bold hover:bg-black transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {isSavingRefund && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Refund Ledger Record
                </button>
              </form>
            )}

            {/* 6. AUDIT HISTORY TAB */}
            {activeTab === 'history' && (
              <div className="space-y-4 max-w-xl">
                <div>
                  <h3 className="text-sm font-bold text-axdoro-charcoal">Immutable Audit History</h3>
                  <p className="text-xs text-axdoro-text-muted">
                    Full chronological sequence of status transitions and administrative updates.
                  </p>
                </div>

                <div className="relative pl-6 border-l-2 border-axdoro-border space-y-6">
                  {returnDetail.history.map((h, i) => (
                    <div key={h.id || i} className="relative">
                      {/* Timeline dot */}
                      <div className="absolute -left-[31px] top-0.5 w-3.5 h-3.5 rounded-full bg-axdoro-surface border-2 border-axdoro-accent" />
                      <div className="text-xs font-bold text-axdoro-charcoal flex items-center gap-2">
                        <span>{h.newStatus}</span>
                        {h.previousStatus && (
                          <span className="text-[11px] text-axdoro-text-muted font-normal">
                            (was {h.previousStatus})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-axdoro-text-muted mt-0.5">
                        {new Date(h.createdAt).toLocaleString()} &bull; by{' '}
                        <span className="font-semibold text-axdoro-charcoal">{h.actorId || h.actorType}</span>
                      </div>
                      {h.notes && (
                        <div className="text-xs text-axdoro-text-muted mt-1 bg-axdoro-surface-muted p-2 rounded">
                          {h.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox for Evidence Images */}
      {previewEvidence && (
        <EvidenceLightboxModal
          isOpen={Boolean(previewEvidence)}
          onClose={() => setPreviewEvidence(null)}
          returnId={returnDetail.id}
          evidence={previewEvidence}
        />
      )}

      {/* Confirmation Dialog for Evidence Deletion */}
      {evidenceToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in"
        >
          <div className="max-w-md w-full bg-axdoro-surface rounded-xl p-6 shadow-2xl border border-axdoro-border space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2 rounded-full bg-red-100">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-axdoro-charcoal">Delete Evidence Photo?</h3>
            </div>
            <p className="text-xs text-axdoro-text-muted leading-relaxed">
              Are you sure you want to delete{' '}
              <strong className="text-axdoro-charcoal font-semibold">{evidenceToDelete.originalFilename}</strong>?
              This will soft-delete the record in PostgreSQL, create an immutable security audit event, and queue
              the asset for permanent deletion from Cloudinary storage.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEvidenceToDelete(null)}
                disabled={isDeletingEvidence}
                className="px-4 py-2 rounded-lg border border-axdoro-border text-xs font-semibold text-axdoro-charcoal hover:bg-axdoro-surface-muted cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteEvidence}
                disabled={isDeletingEvidence}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors cursor-pointer flex items-center gap-2"
              >
                {isDeletingEvidence && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Yes, Delete Evidence
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
