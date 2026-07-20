'use client'

import * as React from 'react'
import { useActionState } from 'react'
import { Loader2, LogIn } from 'lucide-react'
import { Alert, AlertDescription, Button, Card, CardContent, Input, Label } from '@appkit/ui'
import { loginAction } from '../../lib/server/actions'

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: null })
  return (
    <Card>
      <CardContent className="p-6">
        <form action={action} className="space-y-4">
          {state.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
            Sign in
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
