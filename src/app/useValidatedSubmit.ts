import { useState } from 'react'

import { describeError } from '../data/errors'
import type { ValidationResult } from '../domain/validation'

export function useValidatedSubmit() {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function run<T>(validate: () => ValidationResult<T>, action: (value: T) => Promise<void>) {
    const result = validate()
    if (!result.ok) {
      setErrors(result.errors)
      return false
    }
    setErrors({})
    setSubmitError(null)
    setSaving(true)
    try {
      await action(result.value)
      return true
    } catch (err) {
      setSubmitError(describeError(err).message)
      return false
    } finally {
      setSaving(false)
    }
  }

  return { errors, setErrors, submitError, saving, run }
}
