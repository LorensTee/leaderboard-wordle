// NG21 — error-envelope contract unit tests.
import { describe, expect, it } from 'vitest';
import { AppError, ERROR_CODES, errorEnvelope, resolveError } from '../../src/server/lib/errors';

describe('NG21 error envelope', () => {
	const requestId = 'test-req-1';

	it('shapes the envelope exactly as the contract', () => {
		expect(errorEnvelope('BAD_REQUEST', 'nope', requestId, [{ path: 'word' }])).toEqual({
			error: { code: 'BAD_REQUEST', message: 'nope', requestId, issues: [{ path: 'word' }] }
		});
	});

	it('omits issues when absent', () => {
		const body = errorEnvelope('NOT_FOUND', 'missing', requestId);
		expect(body.error).not.toHaveProperty('issues');
	});

	it('maps AppError to its status and code', () => {
		const err = new AppError(ERROR_CODES.FORBIDDEN, 'no', 403);
		const { status, body } = resolveError(err, requestId);
		expect(status).toBe(403);
		expect(body.error.code).toBe('FORBIDDEN');
	});

	it('never leaks internal error details (500 → generic message)', () => {
		const { status, body } = resolveError(new Error('secret db password in message'), requestId);
		expect(status).toBe(500);
		expect(body.error.code).toBe('INTERNAL');
		expect(body.error.message).toBe('An unexpected error occurred');
		expect(body.error.message).not.toContain('secret');
	});
});