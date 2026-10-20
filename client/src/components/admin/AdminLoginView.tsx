import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Input, Label } from '../ui/input.tsx';
import { Badge } from '../ui/badge.tsx';

interface AdminLoginViewProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onNavigateHome?: () => void;
  isLoading: boolean;
  error: string | null;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  onLogin,
  onNavigateHome,
  isLoading,
  error,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(email, password);
  };

  return (
    <div className="min-h-screen bg-axdoro-bg flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-md space-y-4">
        {onNavigateHome && (
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-2 text-xs text-axdoro-text-muted hover:text-axdoro-charcoal transition-colors cursor-pointer mb-2 px-1 py-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Storefront</span>
          </button>
        )}

        <div className="flex justify-center mb-6">
          <img
            src="/logo-white.png"
            alt="AXDORO"
            width={144}
            height={36}
            className="h-9 w-auto object-contain"
          />
        </div>

        <Card className="border-axdoro-border bg-axdoro-surface shadow-elevated">
          <CardHeader className="text-center space-y-2 pb-6">
            <div className="mx-auto w-12 h-12 rounded-xl bg-axdoro-accent-subtle border border-axdoro-accent/20 flex items-center justify-center text-axdoro-accent-muted shadow-subtle">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <CardTitle className="text-xl font-bold text-axdoro-charcoal">AXDORO Admin Portal</CardTitle>
              <Badge variant="secondary">Restricted</Badge>
            </div>
            <CardDescription className="text-xs text-axdoro-text-muted">
              Restricted administrative access. Authenticate to manage catalogue, inventory, orders, and audit records.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="admin-email" className="text-xs font-semibold text-axdoro-charcoal">
                  Administrator Email
                </Label>
                <Input
                  id="admin-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin1@axdoro.internal"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-password" className="text-xs font-semibold text-axdoro-charcoal">
                  Password
                </Label>
                <Input
                  id="admin-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full mt-2 bg-axdoro-charcoal text-white font-semibold shadow-subtle cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-axdoro-accent"
                size="lg"
              >
                {isLoading ? 'Authenticating...' : 'Sign In as Administrator'}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col gap-2 border-t border-axdoro-border pt-4 text-center">
            <p className="text-[11px] text-axdoro-text-muted">
              Local accounts are provisioned via{' '}
              <code className="text-axdoro-accent-muted font-mono font-semibold">npm run admin:provision:local</code>.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};
