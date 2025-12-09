"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { RedditContent } from "@/types/qr-content";
import { encodeReddit } from "@/utils/qr-content-encoder";

export function RedditForm() {
  const { setValue } = useQREditorStore();
  const [redditData, setRedditData] = React.useState<
    Omit<RedditContent, "type">
  >({
    username: "",
    subreddit: "",
  });

  React.useEffect(() => {
    const encoded = encodeReddit({ type: "reddit", ...redditData });
    setValue(encoded);
  }, [redditData, setValue]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="reddit-username">
          Reddit Username
        </Label>
        <Input
          id="reddit-username"
          type="text"
          placeholder="username or u/username"
          value={redditData.username}
          onChange={(e) =>
            setRedditData({ ...redditData, username: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="reddit-subreddit">
          Subreddit
        </Label>
        <Input
          id="reddit-subreddit"
          type="text"
          placeholder="subreddit or r/subreddit"
          value={redditData.subreddit}
          onChange={(e) =>
            setRedditData({ ...redditData, subreddit: e.target.value })
          }
        />
        <p className="text-muted-foreground text-[11px]">
          Enter either a username or subreddit (username takes priority)
        </p>
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open the Reddit profile or subreddit
      </p>
    </div>
  );
}


