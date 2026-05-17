import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/httpserver/http-body-to-body.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('http-body-to-body', () => {
  it('unwraps the nested body field from the http payload', async () => {
    const context = createJavascriptContext({
      body: '{"body":"hello"}',
    });

    const result = await suite.run("resource", { context });

    expect(result.doc.descriptionValue).toContain('HTTP request body');
    expect(context.getBody()).toBe('hello');
  });
});
