import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/httpserver/authorization.js');

describe('authorization', () => {
  it('allows requests with a configured token value', async () => {
    const context = createJavascriptContext({
      headers: {
        Authorization: '["Token abc123"]',
      },
      data: {
        authorizationHeaders: {
          token: {
            values: ['abc123'],
          },
        },
      },
    });

    const result = await runResource({ resource, context });

    expect(result.doc.descriptionValue).toContain('authorization');
    expect(context.__ended).toBe(false);
  });

  it('rejects requests without a matching authorization header', async () => {
    const context = createJavascriptContext({
      headers: {
        Authorization: '["Token wrong"]',
      },
      data: {
        authorizationHeaders: {
          token: {
            values: ['abc123'],
          },
        },
      },
    });

    await runResource({ resource, context });

    expect(context.getProperty('status_code')).toBe(401);
    expect(context.getBody()).toBe('');
    expect(context.__ended).toBe(true);
  });
});
