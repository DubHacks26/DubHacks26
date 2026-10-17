"use client";

import { useState } from "react";
import Landing from "@/components/landing/landing";
import Onboarding from "@/components/onboarding/onboarding";
import AppShell from "@/components/shop-scroller/shop-scroller";

export default function ShopScrollerExperience() {
  const [stage, setStage] = useState("landing");

  if (stage === "landing")
    return <Landing onStart={() => setStage("onboarding")} />;
  if (stage === "onboarding")
    return <Onboarding onDone={() => setStage("app")} />;
  return <AppShell />;
}
