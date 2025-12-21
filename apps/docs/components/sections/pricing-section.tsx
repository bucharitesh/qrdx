"use client";

import { toast } from "@repo/design-system";
import { cn } from "@repo/design-system/lib/utils";
import { Loader } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCheckout } from "@/actions/checkout";
import { SectionHeader } from "@/components/sections/section-header";
import { siteConfig } from "@/config/site";
import { authClient } from "@/lib/auth-client";
import { usePostLoginAction } from "@/lib/hooks/use-post-login-action";
import { useSubscription } from "@/lib/hooks/use-subscription";
import { useAuthStore } from "@/store/auth-store";

interface TabsProps {
  activeTab: "yearly" | "monthly";
  setActiveTab: (tab: "yearly" | "monthly") => void;
  className?: string;
}

function PricingTabs({ activeTab, setActiveTab, className }: TabsProps) {
  return (
    <div
      className={cn(
        "relative flex w-fit items-center rounded-full border p-0.5 backdrop-blur-sm cursor-pointer h-9 flex-row bg-muted",
        className,
      )}
    >
      {["monthly", "yearly"].map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab as "yearly" | "monthly")}
          className={cn(
            "relative z-1 px-2 h-8 flex items-center justify-center cursor-pointer",
            {
              "z-0": activeTab === tab,
            },
          )}
        >
          {activeTab === tab && (
            <motion.div
              layoutId="active-tab"
              className="absolute inset-0 rounded-full bg-white dark:bg-[#3F3F46] shadow-md border border-border"
              transition={{
                duration: 0.2,
                type: "spring",
                stiffness: 300,
                damping: 25,
                velocity: 2,
              }}
            />
          )}
          <span
            className={cn(
              "relative block text-sm font-medium duration-200 shrink-0",
              activeTab === tab
                ? "text-secondary-foreground"
                : "text-muted-foreground",
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === "yearly" && (
              <span className="ml-2 text-xs font-semibold text-primary bg-primary/15 py-0.5 w-[calc(100%+1rem)] px-1 rounded-full">
                -20%
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export function PricingSection() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "monthly",
  );
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingTier, setPendingTier] = useState<string | null>(null);
  const { data: session } = authClient.useSession();
  const { openAuthDialog } = useAuthStore();
  const { subscriptionStatus } = useSubscription();

  const handleProCheckout = async () => {
    if (subscriptionStatus?.isSubscribed) {
      router.push("/settings");
      return;
    }

    setPendingTier("Pro");
    startTransition(async () => {
      // Get the Pro tier pricing info
      const proTier = siteConfig.pricing.pricingItems.find(
        (item) => item.name === "Pro",
      );

      if (!proTier) {
        toast.error("Pro tier not found");
        setPendingTier(null);
        return;
      }

      // Select the appropriate product ID based on billing cycle
      const productId =
        billingCycle === "yearly"
          ? proTier.polarYearlyPriceId
          : proTier.polarMonthlyPriceId;

      if (!productId) {
        toast.error("Product ID not found");
        setPendingTier(null);
        return;
      }

      const res = await createCheckout(productId as string);

      if ("error" in res || !res.url) {
        toast.error(res.error || "Failed to create checkout");
        setPendingTier(null);
        return;
      }

      router.push(res.url);
    });
  };

  usePostLoginAction("CHECKOUT", () => {
    handleProCheckout();
  });

  const handleTierClick = (
    tier: (typeof siteConfig.pricing.pricingItems)[0],
  ) => {
    // If it's the free tier, navigate to playground
    if (tier.name === "Free") {
      router.push("/playground");
      return;
    }

    // For Pro tier, handle checkout
    if (tier.name === "Pro") {
      if (!session) {
        openAuthDialog("signup", "CHECKOUT");
        return;
      }

      handleProCheckout();
    }
  };

  // Update price animation
  const PriceDisplay = ({
    tier,
  }: {
    tier: (typeof siteConfig.pricing.pricingItems)[0];
  }) => {
    const price = billingCycle === "yearly" ? tier.yearlyPrice : tier.price;

    return (
      <motion.span
        key={price}
        className="text-4xl font-semibold"
        initial={{
          opacity: 0,
          x: billingCycle === "yearly" ? -10 : 10,
          filter: "blur(5px)",
        }}
        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      >
        {price}
      </motion.span>
    );
  };

  return (
    <section
      id="pricing"
      className="flex flex-col items-center justify-center gap-10 pb-10 w-full relative"
    >
      <SectionHeader>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
          {siteConfig.pricing.title}
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          {siteConfig.pricing.description}
        </p>
      </SectionHeader>
      <div className="relative w-full h-full">
        <div className="absolute -top-14 left-1/2 -translate-x-1/2">
          <PricingTabs
            activeTab={billingCycle}
            setActiveTab={setBillingCycle}
            className="mx-auto"
          />
        </div>

        <div className="grid min-[650px]:grid-cols-2 gap-4 w-full max-w-4xl mx-auto px-6">
          {siteConfig.pricing.pricingItems.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "rounded-xl grid grid-rows-[180px_auto_1fr] relative h-fit min-[650px]:h-full min-[900px]:h-fit",
                tier.isPopular
                  ? "md:shadow-[0px_61px_24px_-10px_rgba(0,0,0,0.01),0px_34px_20px_-8px_rgba(0,0,0,0.05),0px_15px_15px_-6px_rgba(0,0,0,0.09),0px_4px_8px_-2px_rgba(0,0,0,0.10),0px_0px_0px_1px_rgba(0,0,0,0.08)] bg-secondary"
                  : "bg-[#F3F4F6] dark:bg-[#F9FAFB]/2 border border-border",
              )}
            >
              <div className="flex flex-col gap-4 p-4">
                <p className="text-sm">
                  {tier.name}
                  {tier.isPopular && (
                    <span className="bg-linear-to-b from-primary/50 from-[1.92%] to-primary to-100% text-white h-6 inline-flex w-fit items-center justify-center px-2 rounded-full text-sm ml-2 shadow-[0px_6px_6px_-3px_rgba(0,0,0,0.08),0px_3px_3px_-1.5px_rgba(0,0,0,0.08),0px_1px_1px_-0.5px_rgba(0,0,0,0.08),0px_0px_0px_1px_rgba(255,255,255,0.12)_inset,0px_1px_0px_0px_rgba(255,255,255,0.12)_inset]">
                      Popular
                    </span>
                  )}
                </p>
                <div className="flex items-baseline mt-2">
                  <PriceDisplay tier={tier} />
                  <span className="ml-2">
                    /{billingCycle === "yearly" ? "year" : "month"}
                  </span>
                </div>
                <p className="text-sm mt-2">{tier.description}</p>
              </div>

              <div className="flex flex-col gap-2 p-4">
                <button
                  onClick={() => handleTierClick(tier)}
                  disabled={isPending && pendingTier === tier.name}
                  className={`h-10 w-full flex items-center justify-center text-sm font-normal tracking-wide rounded-full px-4 cursor-pointer transition-all ease-out active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed ${
                    tier.isPopular
                      ? `${tier.buttonColor} shadow-[inset_0_1px_2px_rgba(255,255,255,0.25),0_3px_3px_-1.5px_rgba(16,24,40,0.06),0_1px_1px_rgba(16,24,40,0.08)]`
                      : `${tier.buttonColor} shadow-[0px_1px_2px_0px_rgba(255,255,255,0.16)_inset,0px_3px_3px_-1.5px_rgba(16,24,40,0.24),0px_1px_1px_-0.5px_rgba(16,24,40,0.20)]`
                  }`}
                >
                  {isPending && pendingTier === tier.name ? (
                    <span className="flex items-center gap-2">
                      <Loader className="size-4 animate-spin" />
                      Redirecting...
                    </span>
                  ) : (
                    tier.buttonText
                  )}
                </button>
              </div>
              <hr className="border-border dark:border-white/20" />
              <div className="p-4">
                {tier.name !== "Basic" && (
                  <p className="text-sm mb-4">
                    Everything in {tier.name === "Pro" ? "Basic" : "Pro"} +
                  </p>
                )}
                <ul className="space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <div
                        className={cn(
                          "size-5 rounded-full border border-primary/20 flex items-center justify-center",
                          tier.isPopular &&
                            "bg-muted-foreground/40 border-border",
                        )}
                      >
                        <div className="size-3 flex items-center justify-center">
                          <svg
                            width="8"
                            height="7"
                            viewBox="0 0 8 7"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className="block dark:hidden"
                          >
                            <path
                              d="M1.5 3.48828L3.375 5.36328L6.5 0.988281"
                              stroke="#101828"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>

                          <svg
                            width="8"
                            height="7"
                            viewBox="0 0 8 7"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className="hidden dark:block"
                          >
                            <path
                              d="M1.5 3.48828L3.375 5.36328L6.5 0.988281"
                              stroke="#FAFAFA"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </div>
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
