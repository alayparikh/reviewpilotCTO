import { createFileRoute } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";

// Layout route for /dashboard: the feed lives at dashboard/index.tsx and the
// review detail at dashboard/$reviewId.tsx. This route only provides the
// shared outlet.
export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  return <Outlet />;
}
