import type { BaseLayoutProps, LinkItemType } from "fumadocs-ui/layouts/shared";
import { QrdxLogoAnimation } from "@/components/qrdx-logo-animation";
import { QrdxLogo } from "@/components/qrdx-logo";

export const linkItems: LinkItemType[] = [];

export const logo = (
  <>
    <QrdxLogo className="size-5 md:hidden block text-primary" />
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
