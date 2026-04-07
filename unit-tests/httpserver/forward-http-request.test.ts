import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/httpserver/forward-http-request.js');

describe('forward-http-request', () => {
  it('normalizes the forwarded request and prepares the outbound call', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        method: 'PATCH',
        path: '/items/42',
        queryString: 'a=1',
        headers: {
          'Content-Type': 'application/json',
        },
        body: { ok: true },
      }),
    });

    const result = await runResource({ resource, context });

    expect(result.doc.descriptionValue).toContain('Normalize a forwarded HTTP request');
    expect(context.__url).toEqual({
      hostRef: 'target-server',
      path: '/items/42?a=1',
    });
    expect(context.__method).toBe('PATCH');
    expect(context.getHeader('Content-Type')).toBe('application/json');
    expect(context.getBody()).toBe('{"ok":true}');
  });
});
