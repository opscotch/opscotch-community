import path from 'node:path';
import { createAuthenticationJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(import.meta.dirname, '../../../resources/general/authentication/set-header-from-step-properties.js');

const suite = createResourceSuite({
  resources: [{ id: "resource", resource }],
});

type AuthContext = ReturnType<typeof createAuthenticationJavascriptContext> & {
  setAuthenticationPropertiesOnStep(stepName: string, expiresInMs: number, key: string, value: string): void;
};

describe('authentication/set-header-from-step-properties', () => {
  it('sets headers from authentication properties already on the step', async () => {
    const context = createAuthenticationJavascriptContext({
      data: {
        propertiesStoredOnStep: 'auth-step',
        propertyName: 'Authorization',
      },
      authenticationProperties: {
        'auth-step': {
          Authorization: JSON.stringify({ Authorization: 'Bearer pre-set-token' }),
        },
      },
    });

    await suite.run("resource", { context });

    expect(context.getHeader('Authorization')).toBe('Bearer pre-set-token');
  });

  it('calls auth step via sendToStep when properties are missing', async () => {
    let context!: AuthContext;
    context = createAuthenticationJavascriptContext({
      data: {
        propertiesStoredOnStep: 'auth-step',
        propertyName: 'Authorization',
        authStep: 'do-auth',
        passToAuthData: {},
      },
      properties: {
        OPSCOTCH_AUTH_DATA: '{}',
      },
      sendToStep() {
        context.setAuthenticationPropertiesOnStep(
          'auth-step',
          3600000,
          'Authorization',
          JSON.stringify({ Authorization: 'Bearer from-auth-step' }),
        );
      },
    }) as AuthContext;

    await suite.run("resource", { context });

    expect(context.__sendToStepCalls).toEqual([{ stepName: 'do-auth', body: null, headers: undefined }]);
    expect(context.getHeader('Authorization')).toBe('Bearer from-auth-step');
  });
});
