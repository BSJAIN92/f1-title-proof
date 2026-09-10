import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireServerCredential } from "./serverAccess";

export const consumeRequestLimit = mutation({
  args: { serverCredential: v.string(), key: v.string(), now: v.number(), windowMs: v.number(), limit: v.number() },
  handler: async (ctx, args) => {
    requireServerCredential(args.serverCredential);
    if (!/^[a-z_]+:[a-f0-9]{64}$/.test(args.key) || !Number.isFinite(args.now) || args.windowMs < 1_000 || args.windowMs > 86_400_000 || !Number.isInteger(args.limit) || args.limit < 1 || args.limit > 10_000) throw new Error("The request limit is invalid.");
    const windowStart = Math.floor(args.now / args.windowMs) * args.windowMs;
    const existing = await ctx.db.query("requestLimitBuckets").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (!existing || existing.windowStart !== windowStart) {
      if (existing) await ctx.db.patch(existing._id, { windowStart, count: 1, expiresAt: windowStart + args.windowMs * 2 });
      else await ctx.db.insert("requestLimitBuckets", { key: args.key, windowStart, count: 1, expiresAt: windowStart + args.windowMs * 2 });
      return { allowed: true, remaining: args.limit - 1, retryAfterSeconds: 0 };
    }
    if (existing.count >= args.limit) return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((windowStart + args.windowMs - args.now) / 1000)) };
    await ctx.db.patch(existing._id, { count: existing.count + 1 });
    return { allowed: true, remaining: args.limit - existing.count - 1, retryAfterSeconds: 0 };
  },
});
