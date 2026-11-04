'use client';
import { ArrowRight01Icon, Layers01Icon, PackageIcon, SecurityCheckIcon } from '@hugeicons/core-free-icons';
import type { FormEvent } from 'react';

import { Button, ErrorNotice, Field, Icon, Input, PasswordInput } from './ui';

export function LoginPage({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  error: string;
}) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-brand-deep p-6 text-white lg:p-16">
        <span className="flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-white/10">
            <Icon icon={Layers01Icon} size={22} strokeWidth={2} />
          </span>
          <span className="font-display text-2xl font-semibold tracking-[-0.04em]">dayari</span>
          <span className="mt-1 font-sans text-[9px] font-semibold tracking-[0.18em] text-white/50 uppercase">
            Inventory
          </span>
        </span>

        <div className="my-10 max-w-lg lg:my-20">
          <p className="font-sans text-xs font-semibold tracking-[0.16em] text-white/60 uppercase">
            A clearer view of your shop
          </p>
          <h1 className="mt-5 font-display text-4xl leading-[1.08] font-semibold tracking-[-0.03em] lg:text-[56px]">
            Good work starts
            <br />
            with knowing
            <br />
            what you have.
          </h1>
          <p className="mt-5 max-w-sm font-sans text-sm leading-[1.7] tracking-[-0.02em] text-white/70 lg:text-base">
            One shared product catalogue. Every supplier, source and variant kept connected.
          </p>
        </div>

        <p className="flex items-center gap-2 font-sans text-xs tracking-[-0.02em] text-white/60">
          <Icon icon={SecurityCheckIcon} size={15} />
          Connected to your local shop service
        </p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-sm">
          <span className="grid size-12 place-items-center rounded-2xl border border-black/[0.07] bg-white text-brand">
            <Icon icon={PackageIcon} size={23} />
          </span>

          <p className="mt-7 font-sans text-xs font-semibold tracking-[0.1em] text-brand uppercase">
            Welcome back
          </p>
          <h2 className="mt-2.5 font-display text-3xl font-semibold tracking-[-0.03em] text-ink">
            Sign in to your shop
          </h2>
          <p className="mt-2.5 font-sans text-sm leading-[1.6] tracking-[-0.02em] text-grey-2">
            Use your Dayari account to continue.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <Field label="Email address">
              {(id) => (
                <Input
                  id={id}
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  placeholder="you@dayari.com"
                />
              )}
            </Field>
            <Field label="Password">
              {(id) => (
                <PasswordInput
                  id={id}
                  name="password"
                  autoComplete="current-password"
                  required
                  maxLength={256}
                />
              )}
            </Field>

            {error ? <ErrorNotice message={error} /> : null}

            <Button className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
              {busy ? null : <Icon icon={ArrowRight01Icon} size={16} strokeWidth={2} />}
            </Button>
          </form>

          <p className="mt-8 font-sans text-xs leading-[1.7] tracking-[-0.02em] text-grey-3">
            Need access? Ask your administrator to set up your account.
          </p>
        </div>
      </section>
    </main>
  );
}
