import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/_envcheck")({
  server: {
    handlers: {
      GET: async () => {
        const keys = Object.keys(process.env)
          .filter((k) => k.includes("SUPABASE") || k.includes("SERVICE") || k.includes("ROLE"))
          .sort();
        return Response.json({ keys, hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY });
      },
    },
  },
});
