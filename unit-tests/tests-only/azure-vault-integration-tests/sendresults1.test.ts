import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/tests-only/azure-vault-integration-tests/sendresults1.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

describe('tests-only/azure-vault-integration-tests/sendresults1', () => {
  it('sends cookiecheck metric 1 and forwards to send-results2 when Cookie matches', async () => {
    const context = createJavascriptContext({
      headers: {
        Cookie: '["JSESSIONID=A; X-CSRF-TOKEN=B; "]',
      },
    });

    await suite.run("resource", { context });

    expect(context.__metrics).toEqual([{ args: ['cookiecheck', 1] }]);
    expect(context.__sendToStepCalls).toEqual([
      { stepName: 'send-results2', body: null, headers: undefined },
    ]);
  });

  it('still forwards to send-results2 when Cookie does not match', async () => {
    const context = createJavascriptContext({
      headers: {
        Cookie: '["other"]',
      },
    });

    await suite.run("resource", { context });

    expect(context.__metrics).toEqual([]);
    expect(context.__sendToStepCalls).toEqual([
      { stepName: 'send-results2', body: null, headers: undefined },
    ]);
  });
});
