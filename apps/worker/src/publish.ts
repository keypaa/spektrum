import type { Redis } from "ioredis";
import { renderChannel, type RenderEvent } from "@spektrum/shared/compile";

export async function publish(
  redis: Pick<Redis, "publish">,
  projectId: string,
  event: RenderEvent,
): Promise<void> {
  await redis.publish(renderChannel(projectId), JSON.stringify(event));
}