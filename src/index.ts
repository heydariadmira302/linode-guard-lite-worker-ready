import type { Env } from "./env";
import { routeRequest } from "./router";
import { JobRunnerService } from "./services/job-runner-service";
import { createRequestId } from "./utils/ids";

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const requestId = request.headers.get("X-Request-Id") ?? createRequestId();
    const deploymentNotification = new JobRunnerService(env).notifyDeploymentUpdateIfNeeded().catch(() => undefined);
    if (ctx) ctx.waitUntil(deploymentNotification);
    return routeRequest(request, env, requestId);
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const task = new JobRunnerService(env).runDueJobs(new Date(controller.scheduledTime));
    ctx.waitUntil(task);
    await task;
  }
};
