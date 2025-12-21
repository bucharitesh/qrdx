/** biome-ignore-all lint/a11y/noSvgWithoutTitle: false positive */
"use client";

import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Loader2, X } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Github from "@/assets/github.svg";
import Google from "@/assets/google.svg";
import { QrdxLogoAnimation } from "@/components/qrdx-logo-animation";
import { authClient } from "@/lib/auth-client";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "signin" | "signup";
  trigger?: React.ReactNode; // Optional trigger element
}

export function AuthDialog({
  open,
  onOpenChange,
  initialMode = "signin",
  trigger,
}: AuthDialogProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSignIn, setIsSignIn] = useState(initialMode === "signin");
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGithubLoading, setIsGithubLoading] = useState(false);
  const [lastLoginMethod, setLastLoginMethod] = useState<string | null>(null);

  const getCallbackUrl = () => {
    const baseUrl = pathname || "/editor/theme";
    const queryString = searchParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  };

  useEffect(() => {
    if (open) {
      setIsSignIn(initialMode === "signin");
      // Get the last used login method
      const lastMethod = authClient.getLastUsedLoginMethod();
      setLastLoginMethod(lastMethod);
    }
  }, [open, initialMode]);

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: getCallbackUrl(),
      });
    } catch (error) {
      console.error("Google Sign In Error:", error);
      // Handle error appropriately (e.g., show a toast notification)
    }
  };

  const handleGithubSignIn = async () => {
    setIsGithubLoading(true);
    try {
      await authClient.signIn.social({
        provider: "github",
        callbackURL: getCallbackUrl(),
      });
    } catch (error) {
      console.error("GitHub Sign In Error:", error);
      // Handle error appropriately
    }
  };

  const toggleMode = () => {
    setIsSignIn(!isSignIn);
  };

  if (!open) return null;

  return (
    <div className="fixed animate-in fade-in-0 duration-300 inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-xl">
      {trigger}
      <div className="absolute inset-0 z-0 bg-radial-[125%_125%_at_50%_10%,transparent_40%,var(--primary)_100%] bg-size-100 bg-no-repeat" />
      <motion.svg
        className="absolute right-[calc(50%-14rem)] top-[calc(50%-14.2rem)] hidden sm:block pointer-events-none text-primary"
        fill="none"
        height="41"
        viewBox="0 0 43 41"
        width="43"
        initial={{ opacity: 0, scale: 0.5, x: -50, y: 50 }}
        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
        transition={{
          delay: 0.5,
          duration: 0.4,
          ease: "easeOut",
        }}
      >
        <path
          d="M0.348667 8.25936C-0.0835381 7.58379 -0.11367 6.94969 0.256859 6.35847C0.628799 5.76583 1.19846 5.44856 1.96723 5.39954C2.736 5.35051 3.34848 5.65455 3.80465 6.30602C4.62235 7.46561 5.57259 8.54021 6.65114 9.53121C8.88149 6.13 11.4846 3.14898 14.4576 0.593803C15.1526 -0.00850296 15.8748 -0.152615 16.6184 0.16148C17.3635 0.476997 17.7717 1.08021 17.8443 1.97251C18.2083 5.42548 18.3312 9.19174 18.2131 13.2713C21.3817 11.8256 26.1326 9.77682 32.4686 7.12791C33.0214 6.90991 33.6153 6.91748 34.2503 7.1478C34.8853 7.37812 35.337 7.76999 35.6012 8.32484C35.8669 8.88112 35.7827 9.44846 35.3515 10.0269C33.1941 12.8749 30.9884 17.1684 28.736 22.9115C29.5756 23.2257 31.4805 23.9337 34.4452 25.0354C37.4113 26.1358 39.6874 27.0015 41.2707 27.6298C42.1371 27.9681 42.6892 28.6452 42.9284 29.6596C43.1705 30.674 42.7986 31.3858 41.8129 31.795C38.2127 33.2886 34.9494 34.4917 32.0215 35.4085C32.8631 36.3511 33.8485 37.3647 34.9765 38.4536C35.3365 38.8156 35.4638 39.2441 35.3556 39.7391C35.2474 40.2341 34.9782 40.6013 34.5454 40.8435C34.1139 41.0843 33.6935 41.047 33.2855 40.7332C31.5325 39.4523 29.5618 37.7854 27.3751 35.731C27.0391 35.3931 26.8596 34.9944 26.8338 34.5347C26.8095 34.0765 26.9291 33.678 27.1926 33.3392C27.4575 33.0018 27.8043 32.7354 28.2358 32.5429C30.7814 31.6754 33.121 30.7737 35.256 29.8335C29.2289 27.1491 25.9874 25.6981 25.5287 25.4807C25.3128 25.36 25.1265 25.1953 24.9711 24.9909C24.8144 24.7851 24.707 24.5325 24.6461 24.2303C24.5852 23.9281 24.6047 23.6813 24.6991 23.487C25.562 21.2195 26.6405 18.6359 27.9332 15.7403C28.2444 15.0412 28.6655 14.1834 29.1923 13.171C24.2721 15.2678 20.0965 16.9794 16.6654 18.3029C16.09 18.4954 15.52 18.3672 14.9554 17.9214C14.3922 17.4741 14.1336 16.9618 14.1797 16.3817C14.441 13.2682 14.4637 9.91203 14.2436 6.3145C12.1562 8.55832 10.3581 10.9712 8.84794 13.5517C8.48871 14.1542 8.00933 14.4801 7.40843 14.5278C6.80893 14.577 6.23324 14.395 5.67993 13.9832C3.61485 12.3885 1.83588 10.4805 0.345844 8.25652L0.348667 8.25936Z"
          fill="currentColor"
        ></path>
      </motion.svg>
      <motion.svg
        className="absolute left-[calc(50%-14rem)] bottom-[calc(50%-12rem)] hidden sm:block pointer-events-none text-primary"
        fill="none"
        height="41"
        viewBox="0 0 43 41"
        width="43"
        xmlns="http://www.w3.org/2000/svg"
        initial={{ opacity: 0, scale: 0.5, x: 50, y: -50 }}
        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
        transition={{
          delay: 0.5,
          duration: 0.4,
          ease: "easeOut",
        }}
      >
        <path
          d="M42.6513 32.7406C43.0835 33.4162 43.1137 34.0503 42.7431 34.6415C42.3712 35.2342 41.8015 35.5514 41.0328 35.6005C40.264 35.6495 39.6515 35.3454 39.1954 34.694C38.3777 33.5344 37.4274 32.4598 36.3489 31.4688C34.1185 34.87 31.5154 37.851 28.5424 40.4062C27.8474 41.0085 27.1252 41.1526 26.3816 40.8385C25.6365 40.523 25.2283 39.9198 25.1557 39.0275C24.7917 35.5745 24.6688 31.8083 24.7869 27.7287C21.6183 29.1744 16.8674 31.2232 10.5314 33.8721C9.97859 34.0901 9.38469 34.0825 8.74971 33.8522C8.11472 33.6219 7.66299 33.23 7.39876 32.6752C7.1331 32.1189 7.21728 31.5515 7.64848 30.9731C9.80593 28.1251 12.0116 23.8316 14.264 18.0885C13.4244 17.7743 11.5195 17.0663 8.55478 15.9646C5.58868 14.8642 3.31259 13.9985 1.72932 13.3702C0.8629 13.0319 0.310788 12.3548 0.071572 11.3404C-0.170466 10.326 0.201377 9.61417 1.1871 9.20502C4.78733 7.7114 8.05065 6.50832 10.9785 5.59149C10.1369 4.64892 9.15149 3.63529 8.02349 2.54638C7.66348 2.18436 7.53617 1.75588 7.64439 1.2609C7.75262 0.765928 8.02176 0.398745 8.45464 0.15653C8.88611 -0.0842678 9.30652 -0.0470338 9.71445 0.266789C11.4675 1.54771 13.4382 3.21464 15.6249 5.269C15.9609 5.60688 16.1404 6.00564 16.1662 6.46526C16.1905 6.92346 16.0709 7.32197 15.8074 7.66078C15.5425 7.99817 15.1957 8.26457 14.7642 8.45714C12.2186 9.32462 9.87903 10.2263 7.74404 11.1665C13.7711 13.8509 17.0126 15.3019 17.4713 15.5193C17.6872 15.64 17.8735 15.8047 18.0289 16.0091C18.1856 16.2149 18.293 16.4675 18.3539 16.7697C18.4148 17.0719 18.3953 17.3187 18.3009 17.513C17.438 19.7805 16.3595 22.3641 15.0668 25.2597C14.7556 25.9588 14.3345 26.8166 13.8077 27.829C18.7279 25.7322 22.9035 24.0206 26.3346 22.6971C26.91 22.5046 27.48 22.6328 28.0446 23.0786C28.6078 23.5259 28.8664 24.0382 28.8203 24.6183C28.559 27.7318 28.5363 31.088 28.7564 34.6855C30.8438 32.4417 32.6419 30.0288 34.1521 27.4483C34.5113 26.8458 34.9907 26.5199 35.5916 26.4722C36.1911 26.423 36.7668 26.605 37.3201 27.0168C39.3852 28.6115 41.1641 30.5195 42.6542 32.7435L42.6513 32.7406Z"
          fill="currentColor"
        ></path>
      </motion.svg>
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </button>
      <div className="relative z-10 flex p-4 h-full w-full max-w-100 flex-1 flex-col justify-center gap-y-6">
        <div className="relative grid flex-1 content-center">
          <Card className="w-full max-w-md overflow-hidden shadow-lg p-6 relative">
            <div className="space-y-4">
              <div className="space-y-2">
                <QrdxLogoAnimation size={60} className="mx-auto mb-8" />
                <h2 className="text-center text-lg font-bold">
                  {isSignIn ? "Sign in to QRdx" : "Create account"}
                </h2>
                <p className="text-muted-foreground text-center">
                  {isSignIn
                    ? "Welcome back! Please sign in to continue"
                    : "Sign up to get started with qrdx"}
                </p>
              </div>

              <div className="space-y-6 pt-4">
                <div className="flex gap-2 items-center justify-center">
                  <div className="relative w-full">
                    <Button
                      variant={"outline"}
                      onClick={handleGoogleSignIn}
                      className="hover:bg-primary/10 hover:text-foreground flex w-full items-center justify-center gap-2"
                      disabled={isGoogleLoading || isGithubLoading}
                    >
                      <Google className="h-5 w-5" />
                      <span className="font-medium">Google</span>
                      {isGoogleLoading && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                    </Button>
                    {lastLoginMethod === "google" && (
                      <Badge className="absolute px text-[0.5rem] right-0 -top-1/2 translate-y-1/2">
                        Last used
                      </Badge>
                    )}
                  </div>

                  <div className="relative w-full">
                    <Button
                      variant={"outline"}
                      onClick={handleGithubSignIn}
                      className="hover:bg-primary/10 hover:text-foreground flex w-full items-center justify-center gap-2"
                      disabled={isGoogleLoading || isGithubLoading}
                    >
                      <Github className="h-5 w-5" />
                      <span className="font-medium">GitHub</span>
                      {isGithubLoading && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                    </Button>
                    {lastLoginMethod === "github" && (
                      <Badge className="absolute px text-[0.5rem] right-0 -top-1/2 translate-y-1/2">
                        Last used
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <div className="mt-6 text-muted-foreground text-sm font-medium text-center gap-2 flex items-center justify-center">
                    Don't have an account?
                    <button
                      type="button"
                      onClick={toggleMode}
                      className="text-primary focus:ring-primary hover:underline focus:ring-2 focus:ring-offset-2 focus:outline-none"
                    >
                      {isSignIn ? "Sign up" : "Sign in to your account"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
        <footer className="flex w-full max-w-100 justify-between text-sm">
          <p className="text-muted-foreground">
            © {new Date().getFullYear()} QRdx
          </p>
          <ul className="flex gap-2">
            <li className="flex items-center gap-2 after:size-[1.5px] after:rounded-full after:bg-muted-foreground last:after:hidden">
              <button
                type="button"
                className="relative rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-[#0033FF]"
              >
                Support
              </button>
            </li>
            <li className="flex items-center gap-2 after:size-[1.5px] after:rounded-full after:bg-muted-foreground last:after:hidden">
              <Link
                className="relative rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-[#0033FF]"
                href="/legal/privacy-policy"
              >
                Privacy
              </Link>
            </li>
            <li className="flex items-center gap-2 after:size-[1.5px] after:rounded-full after:bg-muted-foreground last:after:hidden">
              <Link
                className="relative rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-[#0033FF]"
                href="/legal/terms-of-service"
              >
                Terms
              </Link>
            </li>
          </ul>
        </footer>
      </div>
    </div>
  );
}
