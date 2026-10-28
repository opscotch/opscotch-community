import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/tests-only/azure-vault-integration-tests/sendresults2.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('tests-only/azure-vault-integration-tests/sendresults2', () => {
  it('sends cookiecheck metric 2 when Cookie matches', async () => {
    const context = createJavascriptContext({
      headers: {
        Cookie: '["JSESSIONID=A; X-CSRF-TOKEN=B; "]',
      },
    });

    await suite.run("resource", { context });

    expect(context.__metrics).toEqual([{ args: ['cookiecheck', 2] }]);
  });

  it('sends no metric when Cookie does not match', async () => {
    const context = createJavascriptContext({
      headers: {
        Cookie: '["other"]',
      },
    });

    await suite.run("resource", { context });

    expect(context.__metrics).toEqual([]);
  });
});
