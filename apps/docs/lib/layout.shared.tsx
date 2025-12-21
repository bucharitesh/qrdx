import type { BaseLayoutProps, LinkItemType } from "fumadocs-ui/layouts/shared";
import Logo from "@/assets/logo.svg";
import { QrdxLogoAnimation } from "@/components/qrdx-logo-animation";
import { owner, repo } from "./github";

export const linkItems: LinkItemType[] = [];

export const logo = (
  <>
    {/* <Image
      alt="Fumadocs"
      // src={Logo}
      sizes="100px"
      className="hidden w-22 in-[.uwu]:block"
      aria-label="Fumadocs"
    /> */}
    {/* <FumadocsIcon className="size-5 [.uwu_&]:hidden" /> */}
    <Logo className="size-5 md:hidden block text-primary" />
    <QrdxLogoAnimation size={30} className="hidden md:block" />
  </>
);

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          {logo}
          <span className="font-medium in-[header_&]:text-[15px]">QRdx</span>
        </>
      ),
    },
  };
}
