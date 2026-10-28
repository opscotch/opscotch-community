import path from 'node:path';
import { createJavascriptContext, createResourceSuite } from '@opscotch/resource-testkit';

const resource = path.resolve(
  import.meta.dirname,
  '../../../resources/elastic/ml/get-jobs-details.js',
);

const suite = createResourceSuite({
  resources: [{ id: 'resource', resource }],
});

describe('elastic/ml/get-jobs-details', () => {
  it('counts stopped jobs and skips excluded job ids', async () => {
    const context = createJavascriptContext({
      body: JSON.stringify({
        jobs: [
          { job_id: 'job-a', finished_time: 100 },
          { job_id: 'skip-me', finished_time: 200 },
          { job_id: 'job-b' },
          { job_id: 'job-c', finished_time: 300 },
        ],
      }),
      data: {
        processroute: 'ml-step',
        excludeJobs: 'skip',
      },
    });

    await suite.run('resource', { context });

    expect(context.__sendToStepCalls).toHaveLength(1);
    const payload = JSON.parse(context.__sendToStepCalls[0].body!);
    expect(payload.metric).toBe('elastic-ml-stopped-job');
    expect(payload.value).toBe(2);
    expect(payload.metadata.Jobs).toBe('job-a job-c ');
  });
});
