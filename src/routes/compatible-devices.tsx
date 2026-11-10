import { sitePath } from "@/lib/site-path";
import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/compatible-devices")({
  beforeLoad: () => {
    throw redirect({ href: sitePath("/docs/"), statusCode: 301 });
  },
});
