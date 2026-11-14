import type { Metadata } from "next";
import { SignOutScreen } from "./sign-out-screen";

export const metadata: Metadata = {
  title: "Sign out",
  robots: { index: false, follow: false },
};

/** Signs out (a POST from the browser), then opens /sign-in?signedOut=1. */
export default function SignOutPage() {
  return <SignOutScreen />;
}
