import { Video } from "iconsax-reactjs";
import { themePreset } from "@/components/landing/theme";
import { registerTemplate } from "./registry";

registerTemplate({
  type: "video",
  label: "Video",
  description: "A YouTube, Vimeo or Loom video, or a video file you upload",
  icon: Video,
  order: 53,
  variants: [
    {
      id: "product-video",
      name: "Product video",
      description: "Embed a YouTube or Vimeo video with a call to action",
      theme: { colors: themePreset("classic"), radius: 12 },
      blocks: [
        {
          type: "header",
          props: {
            title: "See it in action",
            subtitle: "A two-minute tour of everything in the box.",
          },
        },
        { type: "video-embed", props: {} },
        {
          type: "button",
          props: { label: "Shop now", url: "https://example.com/shop" },
        },
      ],
    },
    {
      id: "uploaded-video",
      name: "Uploaded video",
      description: "Play your own MP4, no YouTube needed",
      theme: { colors: themePreset("graphite"), font: "geist", radius: 10 },
      blocks: [
        {
          type: "header",
          props: {
            title: "Welcome",
            subtitle: "A short video from our team.",
          },
        },
        { type: "video-file", props: {} },
        {
          type: "text",
          props: { body: "Questions? Reply to the email you got from us." },
        },
      ],
    },
    {
      id: "looping-clip",
      name: "Looping clip",
      description: "A short silent clip that plays on its own, like a GIF",
      theme: { colors: themePreset("sunset"), radius: 20 },
      blocks: [
        { type: "video-file", props: { autoplay: true, aspect: "portrait" } },
        {
          type: "header",
          props: { title: "New season", subtitle: "Available in store now." },
        },
        {
          type: "button",
          props: { label: "Find a store", url: "https://example.com/stores" },
        },
      ],
    },
  ],
});
