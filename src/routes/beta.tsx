import { sitePath } from "@/lib/site-path";
import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/beta")({
  beforeLoad: () => {
    throw redirect({ href: sitePath("/get-started"), statusCode: 301 });
  },
});
