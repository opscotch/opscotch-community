import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/httpserver/http-body-to-body.js');

describe('http-body-to-body', () => {
  it('unwraps the nested body field from the http payload', async () => {
    const context = createJavascriptContext({
      body: '{"body":"hello"}',
    });

    const result = await runResource({ resource, context });

    expect(result.doc.descriptionValue).toContain('HTTP request body');
    expect(context.getBody()).toBe('hello');
  });
});
