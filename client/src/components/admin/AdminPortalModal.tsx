import React from 'react';
import { AdminPortal } from './AdminPortal.tsx';
import { useScrollLock } from '../../utils/scrollLock.ts';

export interface AdminPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCatalogueMutated?: () => void;
}

/**
 * Backward compatibility wrapper for legacy modal references.
 * The primary entry point for the Admin Portal is now the isolated /admin route.
 */
export const AdminPortalModal: React.FC<AdminPortalModalProps> = ({
  isOpen,
  onClose,
  onCatalogueMutated,
}) => {
  // Global reference-counted scroll lock while modal is open
  useScrollLock(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md">
      <AdminPortal
        onNavigateHome={onClose}
        onCatalogueMutated={onCatalogueMutated}
      />
    </div>
  );
};
