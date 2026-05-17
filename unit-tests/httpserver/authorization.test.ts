import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/httpserver/authorization.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

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

    const result = await suite.run("resource", { context });

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

    await suite.run("resource", { context });

    expect(context.getProperty('status_code')).toBe(401);
    expect(context.getBody()).toBe('');
    expect(context.__ended).toBe(true);
  });
});
