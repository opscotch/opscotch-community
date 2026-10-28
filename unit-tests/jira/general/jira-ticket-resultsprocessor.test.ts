import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/jira/general/jira-ticket-resultsprocessor.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('jira/general/jira-ticket-resultsprocessor', () => {
  it('stashes the ticket key as OPSCOTCH_phmActionReference', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({ key: 'ABC-99', id: '10001' }),
    });

    await suite.run("resource", { context });

    expect(context.getProperty('OPSCOTCH_phmActionReference')).toBe('ABC-99');
  });
});
