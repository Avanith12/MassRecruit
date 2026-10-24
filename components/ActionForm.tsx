"use client";

import { useActionState, useEffect, useRef, startTransition, type ReactNode } from "react";

export type ActionState = { error?: string; ok?: string; at?: number } | undefined;
type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Form bound to a server action via useActionState. Submits through
 * startTransition so field values are kept when the action returns an error
 * (React 19 otherwise resets uncontrolled forms after an action).
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess = false,
  "aria-label": ariaLabel,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
  "aria-label"?: string;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      aria-label={ariaLabel}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => run(fd));
      }}
    >
      {/* Layout classes go on the fieldset (the form's direct content wrapper) so space-y/grid apply to fields. */}
      <fieldset disabled={pending} className={`m-0 min-w-0 border-0 p-0 ${className ?? ""}`}>
        {children}
      </fieldset>
      {state?.error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="mt-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {state.ok}
        </p>
      )}
    </form>
  );
}
