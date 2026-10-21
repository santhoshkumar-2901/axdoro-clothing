// AXDORO Global Modal Background Scroll Lock Utility
// Reference-counted scroll-lock manager preventing background scroll while keeping modal content scrollable.

import { useEffect } from 'react';

let lockCount = 0;
let originalOverflow: string | null = null;
let originalPaddingRight: string | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Acquires a global background scroll lock using reference counting.
 * When the first lock is acquired (lockCount === 1):
 * - Records original inline overflow and paddingRight styles.
 * - Measures scrollbar width to prevent desktop layout shift (content jitter).
 * - Applies overflow: hidden and compensating padding-right.
 * - Sets data-scroll-locked="true" on document.body.
 */
export function acquireScrollLock(): void {
  if (!isBrowser()) return;

  lockCount++;

  if (lockCount === 1) {
    const body = document.body;
    originalOverflow = body.style.overflow;
    originalPaddingRight = body.style.paddingRight;

    // Calculate scrollbar width
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    if (scrollbarWidth > 0) {
      const computedPaddingRight = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${computedPaddingRight + scrollbarWidth}px`;
    }

    body.style.overflow = 'hidden';
    body.setAttribute('data-scroll-locked', 'true');
  }
}

/**
 * Releases a global background scroll lock using reference counting.
 * When all locks are released (lockCount reaches 0):
 * - Restores original inline overflow and paddingRight styles.
 * - Removes data-scroll-locked attribute from document.body.
 */
export function releaseScrollLock(): void {
  if (!isBrowser()) return;

  lockCount = Math.max(0, lockCount - 1);

  if (lockCount === 0) {
    const body = document.body;

    if (originalOverflow !== null) {
      body.style.overflow = originalOverflow;
      originalOverflow = null;
    } else {
      body.style.overflow = '';
    }

    if (originalPaddingRight !== null) {
      body.style.paddingRight = originalPaddingRight;
      originalPaddingRight = null;
    } else {
      body.style.paddingRight = '';
    }

    body.removeAttribute('data-scroll-locked');
  }
}

/**
 * React hook to synchronize background scroll lock with a modal's open state.
 * Handles mount, unmount, and dynamic state transitions safely.
 */
export function useScrollLock(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked) return;

    acquireScrollLock();

    return () => {
      releaseScrollLock();
    };
  }, [isLocked]);
}

/**
 * Test-only inspection helper returning current active lock count.
 */
export function getScrollLockCount(): number {
  return lockCount;
}

/**
 * Test-only reset helper to guarantee test isolation.
 */
export function forceResetScrollLock(): void {
  if (!isBrowser()) {
    lockCount = 0;
    originalOverflow = null;
    originalPaddingRight = null;
    return;
  }

  const body = document.body;
  if (originalOverflow !== null) {
    body.style.overflow = originalOverflow;
  } else {
    body.style.overflow = '';
  }

  if (originalPaddingRight !== null) {
    body.style.paddingRight = originalPaddingRight;
  } else {
    body.style.paddingRight = '';
  }

  body.removeAttribute('data-scroll-locked');
  lockCount = 0;
  originalOverflow = null;
  originalPaddingRight = null;
}
