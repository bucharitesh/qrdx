import { Mobile as Smartphone } from "iconsax-reactjs";
import { themePreset } from "@/components/landing/theme";
import { registerTemplate } from "./registry";

registerTemplate({
  type: "apps",
  label: "App download",
  description: "One code for the App Store, Google Play and the web",
  icon: Smartphone,
  order: 43,
  variants: [
    {
      id: "app-launch",
      name: "App launch",
      description: "The visitor's store button comes first",
      theme: { colors: themePreset("classic"), radius: 16 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Get the app",
            subtitle: "Order ahead, earn rewards and skip the line.",
          },
        },
        {
          type: "apps",
          props: {
            name: "Our app",
            description: "Free on iPhone, iPad and Android.",
            appStoreUrl: "https://apps.apple.com/",
            playStoreUrl: "https://play.google.com/store/apps",
            webUrl: "https://example.com/app",
            webLabel: "Use it in your browser",
          },
        },
        {
          type: "text",
          props: {
            heading: "Why you'll love it",
            body: "• Order in two taps\n• Rewards on every purchase\n• Exclusive app-only offers",
            card: true,
          },
        },
      ],
    },
    {
      id: "game",
      name: "Game",
      description: "Dark theme with store links and socials",
      theme: { colors: themePreset("midnight"), font: "rounded", radius: 20 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Pixel Quest",
            subtitle: "The puzzle adventure everyone's talking about.",
          },
        },
        {
          type: "apps",
          props: {
            name: "Pixel Quest",
            appStoreUrl: "https://apps.apple.com/",
            playStoreUrl: "https://play.google.com/store/apps",
          },
        },
        {
          type: "socials",
          props: {
            items: [
              { network: "youtube", url: "https://youtube.com/" },
              { network: "discord", url: "https://discord.com/" },
            ],
          },
        },
      ],
    },
  ],
});
