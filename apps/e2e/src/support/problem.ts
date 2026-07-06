import { expect } from 'vitest';
import type { HttpResponse } from './client';

// Asserts an error response is a well-formed RFC 7807 problem document
// (invariant #7): the right status, the application/problem+json content type,
// and the { type, title, status, instance } envelope. `contains` optionally
// checks a substring of the serialized body (e.g. a validation message).
export function expectProblem(
  res: HttpResponse<unknown>,
  { status, contains }: { status: number; contains?: string },
) {
  expect(res.status).toBe(status);
  expect(res.headers.get('content-type') ?? '').toContain('application/problem+json');
  expect(res.body).toMatchObject({
    type: expect.any(String),
    title: expect.any(String),
    status,
    instance: expect.any(String),
  });
  if (contains !== undefined) {
    expect(JSON.stringify(res.body)).toContain(contains);
  }
}
