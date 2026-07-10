import { createFileRoute } from "@tanstack/react-router";

import { WorkshopApp } from "#/components/workshop/WorkshopApp";

export const Route = createFileRoute("/")({ component: WorkshopApp });
