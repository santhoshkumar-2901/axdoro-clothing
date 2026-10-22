import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('AXDORO — Admin Audit Trail Table Structure', () => {
  const adminPortalPath = path.resolve(__dirname, 'components', 'admin', 'AdminPortal.tsx');
  const content = fs.readFileSync(adminPortalPath, 'utf-8');

  // Locate the audit trail tab section
  const auditSectionStart = content.indexOf('/* 6. Audit Logs Tab */');
  expect(auditSectionStart).toBeGreaterThan(-1);

  const auditSectionEnd = content.indexOf('{/* Stock Adjustment Popup */}', auditSectionStart);
  expect(auditSectionEnd).toBeGreaterThan(-1);

  const auditSection = content.substring(auditSectionStart, auditSectionEnd);

  it('contains exactly the 3 approved column headers in order: Timestamp, Actor, Action', () => {
    // Check that Timestamp, Actor, and Action headers exist in the table
    const tableHeaderMatch = auditSection.match(/<TableHeader>[\s\S]*?<\/TableHeader>/);
    expect(tableHeaderMatch).not.toBeNull();
    const tableHeader = tableHeaderMatch![0];

    const thMatches = Array.from(tableHeader.matchAll(/<TableHead[^>]*>(.*?)<\/TableHead>/g)).map(
      (m) => m[1]
    );

    expect(thMatches).toEqual(['Timestamp', 'Actor', 'Action']);
  });

  it('does not contain Entity or Details headers or row cells in the audit table', () => {
    expect(auditSection).not.toContain('Entity</TableHead>');
    expect(auditSection).not.toContain('Details</TableHead>');
    expect(auditSection).not.toContain('log.entityType');
    expect(auditSection).not.toContain('log.details');
  });

  it('retains timestamp formatting, actor email with title, and action badge in row cells', () => {
    expect(auditSection).toContain('log.createdAt');
    expect(auditSection).toContain('log.adminEmail');
    expect(auditSection).toContain('title={log.adminEmail}');
    expect(auditSection).toContain('log.action');
    expect(auditSection).toContain('{log.action}');
  });
});
