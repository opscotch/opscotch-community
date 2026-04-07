import path from 'node:path';
import { createJavascriptContext, runResource } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../resources/general/standard-json-itemprocessor.js');

describe('standard-json-itemprocessor', () => {
  it('replaces invalid json with an empty object and logs the failure', async () => {
    const context = createJavascriptContext({
      body: 'not-json',
    });

    await runResource({ resource, context });

    expect(context.getBody()).toBe('{}');
    expect(context.__logs[0]).toContain('Failed to parse Body as JSON');
  });
});
